import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import './lib/keepalive.js'
import pino from 'pino'
import { B, makeWASocket } from './lib/baileys.js'
import { loadCommands, handleMessage, getAllCommands, getPrefix, clearMeta } from './lib/router.js'
import { getGroup } from './lib/db.js'
import { restore, upload, scheduleUpload, clearCloud } from './lib/session.js'
import { sleep, num } from './lib/utils.js'
import { nexusConnected } from './lib/nexusStyle.js'
import { settings } from './lib/botSettings.js'
import { autoJoin, enableChannelForward } from './lib/autojoin.js'

// Hide noisy encryption session messages from the logs
const NOISE = [/^(Closing|Opening|Removing|Migrating) .*session/i, /^Decrypted message with closed session/i,
  /^Failed to decrypt message with any known session/i, /^Session error:/i, /^Bad MAC/i]
for (const fn of ['log', 'info', 'warn', 'error']) {
  const orig = console[fn].bind(console)
  console[fn] = (...args) => {
    const first = String(args[0] || '')
    if (NOISE.some((re) => re.test(first))) return
    orig(...args)
  }
}

const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B
const BOT_NAME = process.env.BOT_NAME || 'NEXUS MD'
const BOT_NUMBER = String(process.env.BOT_NUMBER || '').replace(/\D/g, '')
const PORT = process.env.PORT || 3000
const logger = pino({ level: 'silent' })

let currentSock = null
let pairRequested = false
let replaced = false   // true when another copy took over this login
let joinedOnce = false // auto-join/follow runs once per start

// Always-online: keep showing as available while the setting is on
setInterval(() => {
  if (settings.alwaysonline && currentSock?.user) currentSock.sendPresenceUpdate('available').catch(() => {})
}, 60000)

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
        // Look for pair.html in the repo root or in the public folder
        const paths = ['./pair.html', './public/pair.html']
        let html = null
        for (const f of paths) {
          try { html = fs.readFileSync(new URL(f, import.meta.url)); break } catch {}
        }
        if (!html) throw new Error('missing')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(html)
      } catch {
        return sendJson(res, 500, { error: 'pair.html not found. Put it in the repo root or in the public folder.' })
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
  enableChannelForward(sock) // every message shows "Forwarded from <channel>"

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
      sock.sendMessage(me, { text: nexusConnected({ number: num(sock.user.id), prefix: getPrefix(), count: getAllCommands().length }) }).catch(() => {})
      if (!joinedOnce) { joinedOnce = true; autoJoin(sock) } // join group + follow channel
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
        // Do NOT exit: Render would restart this copy and it would kick the new one again.
        replaced = true
        console.log('🚨 Another copy took over this login. This copy is going idle.')
        return
      }
      await sleep(code === DisconnectReason.restartRequired ? 500 : 4000)
      start().catch((e) => console.log('❌ restart failed:', e.message))
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      try {
        const chat = m.key.remoteJid
        // Statuses: view them if enabled, never treat them as commands
        if (chat === 'status@broadcast') {
          if (settings.autoviewstatus) await sock.readMessages([m.key]).catch(() => {})
          continue
        }
        // Private mode: only the bot account itself can use commands
        if (settings.mode === 'private' && !m.key.fromMe) continue
        if (!m.key.fromMe) {
          if (settings.autoread) sock.readMessages([m.key]).catch(() => {})
          if (settings.autotyping) sock.sendPresenceUpdate('composing', chat).catch(() => {})
          else if (settings.autorecording) sock.sendPresenceUpdate('recording', chat).catch(() => {})
        }
        await handleMessage(sock, m)
      } catch (e) { console.log('❌ handler error:', e.message) }
    }
  })

  // Reject calls when anti-call is on
  sock.ev.on('call', async (calls) => {
    if (!settings.anticall) return
    for (const c of calls) {
      if (c.status !== 'offer') continue
      try {
        await sock.rejectCall(c.id, c.from)
        await sock.sendMessage(c.from, { text: settings.callmsg })
      } catch (e) { console.log('❌ anticall error:', e.message) }
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

// A copy that was replaced must not upload its old credentials
async function shutdown() { try { if (!replaced) await upload() } catch {} process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (e) => console.log('Unhandled rejection:', e))
process.on('uncaughtException', (e) => { console.log('Uncaught exception:', e); process.exit(1) })
