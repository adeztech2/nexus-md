import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import pino from 'pino'
import { B, makeWASocket } from './lib/baileys.js'
import { loadCommands, handleMessage, getAllCommands, getPrefix, clearMeta } from './lib/router.js'
import { getGroup } from './lib/db.js'
import { restore, upload, scheduleUpload, clearCloud } from './lib/session.js'
import { sleep, num } from './lib/utils.js'

const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B
const BOT_NAME = process.env.BOT_NAME || 'NEXUS MD'
const BOT_NUMBER = String(process.env.BOT_NUMBER || '').replace(/\D/g, '')
const PORT = process.env.PORT || 3000
const logger = pino({ level: 'silent' })

let currentSock = null
let pairRequested = false

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// Web server: health check for Render + the pairing page
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/pair' || url.pathname === '/pair.html') {
    const number = (url.searchParams.get('number') || '').replace(/\D/g, '')

    // No number: show the pairing page
    if (!url.searchParams.has('number')) {
      try {
        const html = fs.readFileSync(new URL('./pair.html', import.meta.url))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(html)
      } catch {
        return sendJson(res, 500, { error: 'pair.html not found next to index.js' })
      }
    }

    // Number given: make a pairing code
    if (number.length < 8 || number.length > 15) {
      return sendJson(res, 400, { error: 'Enter your full number with country code, digits only.' })
    }
    if (!currentSock) {
      return sendJson(res, 503, { error: 'The bot is still starting. Try again in a few seconds.' })
    }
    if (currentSock.authState.creds.registered) {
      return sendJson(res, 409, { error: 'This bot is already linked to a WhatsApp account.' })
    }
    try {
      const code = await currentSock.requestPairingCode(number)
      return sendJson(res, 200, { code })
    } catch (e) {
      console.log('❌ Pair code failed:', e.message)
      return sendJson(res, 500, { error: 'Could not create a code. Wait a few seconds and try again.' })
    }
  }

  sendJson(res, 200, { status: 'ok', bot: BOT_NAME, uptime: Math.floor(process.uptime()) })
}).listen(PORT, () => console.log(`🌐 Server on port ${PORT}`))

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger, browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false
  })
  currentSock = sock

  sock.ev.on('creds.update', async () => { await saveCreds(); scheduleUpload() })

  // First run: pair with BOT_NUMBER in the logs, or wait for the /pair page
  if (!sock.authState.creds.registered && !pairRequested) {
    if (!BOT_NUMBER) {
      console.log('ℹ️ No BOT_NUMBER set. Open /pair on your site to link WhatsApp.')
    } else {
      pairRequested = true
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(BOT_NUMBER)
          console.log(`\n🔑 PAIR CODE: ${code}\nWhatsApp > Linked devices > Link with phone number\n`)
        } catch (e) { console.log('❌ Pair code failed:', e.message); pairRequested = false }
      }, 3000)
    }
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(`✅ ${BOT_NAME} connected as ${num(sock.user.id)}`)
      upload()
      const me = num(sock.user.id) + '@s.whatsapp.net'
      sock.sendMessage(me, { text: `*${BOT_NAME}* is online ✅\nType ${getPrefix()}menu to see ${getAllCommands().length} commands.` }).catch(() => {})
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      console.log(`❌ Connection closed. Code: ${code}`)
      if (code === DisconnectReason.loggedOut) {
        console.log('🚪 Logged out. Saved session deleted. Redeploy to pair again.')
        await clearCloud()
        return process.exit(1)
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log('🚨 Another copy is using this login. Stopping.')
        return process.exit(1)
      }
      await sleep(code === DisconnectReason.restartRequired ? 500 : 4000)
      start().catch((e) => console.log('❌ restart failed:', e.message))
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      try { await handleMessage(sock, m) } catch (e) { console.log('❌ handler error:', e.message) }
    }
  })

  // Welcome / goodbye messages
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    clearMeta(id)
    if (!getGroup(id).welcome || !['add', 'remove'].includes(action)) return
    const jids = participants.map((p) => (typeof p === 'string' ? p : p.id))
    const tags = jids.map((j) => '@' + num(j)).join(' ')
    const text = action === 'add' ? `👋 Welcome ${tags}!` : `👋 Goodbye ${tags}.`
    sock.sendMessage(id, { text, mentions: jids }).catch(() => {})
  })
}

await restore()
await loadCommands()
start().catch((e) => console.log('❌ start failed:', e))

async function shutdown() { try { await upload() } catch {} process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (e) => console.log('Unhandled rejection:', e))
process.on('uncaughtException', (e) => { console.log('Uncaught exception:', e); process.exit(1) })
