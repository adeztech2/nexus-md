import 'dotenv/config'
import http from 'http'
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

// Tiny web server so Render sees the service as alive
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', bot: BOT_NAME, uptime: Math.floor(process.uptime()) }))
}).listen(PORT, () => console.log(`🌐 Server on port ${PORT}`))

let pairRequested = false

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger, browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false
  })

  sock.ev.on('creds.update', async () => { await saveCreds(); scheduleUpload() })

  // First run: print a pair code in the logs
  if (!sock.authState.creds.registered && !pairRequested) {
    if (!BOT_NUMBER) { console.log('❌ Set BOT_NUMBER (digits only, with country code)'); process.exit(1) }
    pairRequested = true
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(BOT_NUMBER)
        console.log(`\n🔑 PAIR CODE: ${code}\nWhatsApp > Linked devices > Link with phone number\n`)
      } catch (e) { console.log('❌ Pair code failed:', e.message); pairRequested = false }
    }, 3000)
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
