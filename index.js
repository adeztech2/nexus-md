import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import './lib/keepalive.js'
import pino from 'pino'
import { B, makeWASocket } from './lib/baileys.js'
import { loadCommands, handleMessage, getAllCommands, getPrefix, clearMeta } from './lib/router.js'
import { getGroup } from './lib/db.js'
import { createSession } from './lib/session.js'
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
const PORT = process.env.PORT || 3000
const logger = pino({ level: 'silent' })

// Numbers this deployment runs: comma-separated, digits only, with country code
const NUMBERS = String(process.env.BOT_NUMBERS || process.env.BOT_NUMBER || '')
  .split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)
if (!NUMBERS.length) console.log('ℹ️ No BOT_NUMBERS set. Add BOT_NUMBERS=number1,number2 to run bots.')

const bots = new Map() // number -> state for that connection

function makeBot(number) {
  // A single-number deployment keeps SESSION_ID, so an existing bot keeps its login
  const id = NUMBERS.length === 1 && process.env.SESSION_ID ? process.env.SESSION_ID : `nexus_${number}`
  return { number, session: createSession(id), sock: null, pairRequested: false, replaced: false, joinedOnce: false }
}
for (const n of NUMBERS) bots.set(n, makeBot(n))

// Always-online: keep every connection showing as available while the setting is on
setInterval(() => {
  if (!settings.alwaysonline) return
  for (const bot of bots.values()) if (bot.sock?.user) bot.sock.sendPresenceUpdate('available').catch(() => {})
}, 60000)

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// Web server: health check for Render/Heroku + the pairing page
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/pair' || url.pathname === '/pair.html') {
    const number = (url.searchParams.get('number') || '').replace(/\D/g, '')

    // No number: show the pairing page
    if (!url.searchParams.has('number')) {
      try {
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

    if (number.length < 8 || number.length > 15) {
      return sendJson(res, 400, { error: 'Enter your full number with country code, digits only.' })
    }
    const bot = bots.get(number)
    if (!bot) {
      return sendJson(res, 404, { error: 'This number is not set up on this deployment. Add it to BOT_NUMBERS and redeploy.' })
    }
    if (!bot.sock) {
      return sendJson(res, 503, { error: 'The bot is still starting. Try again in a few seconds.' })
    }
    if (bot.sock.authState.creds.registered) {
      return sendJson(res, 409, { error: 'This number is already linked to a WhatsApp account.' })
    }
    try {
      const code = await bot.sock.requestPairingCode(number)
      return sendJson(res, 200, { code })
    } catch (e) {
      console.log(`[${number}] ❌ Pair code failed:`, e.message)
      return sendJson(res, 500, { error: 'Could not create a code. Wait a few seconds and try again.' })
    }
  }

  sendJson(res, 200, { status: 'ok', bot: BOT_NAME, numbers: NUMBERS.length, uptime: Math.floor(process.uptime()) })
}).listen(PORT, () => console.log(`🌐 Server on port ${PORT}`))

async function start(bot) {
  const { number, session } = bot
  const { state, saveCreds } = await useMultiFileAuthState(session.dir)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger, browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false
  })
  bot.sock = sock
  enableChannelForward(sock) // every message from this number shows "Forwarded from <channel>"

  sock.ev.on('creds.update', async () => { await saveCreds(); session.scheduleUpload() })

  // Unlinked number: request a pairing code in the logs (the /pair page also works)
  if (!sock.authState.creds.registered && !bot.pairRequested) {
    bot.pairRequested = true
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(number)
        console.log(`[${number}] 🔑 PAIR CODE: ${code}\n  WhatsApp > Linked devices > Link with phone number\n`)
      } catch (e) { console.log(`[${number}] ❌ Pair code failed:`, e.message); bot.pairRequested = false }
    }, 3000)
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      const me = num(sock.user.id)
      console.log(`✅ ${BOT_NAME} connected as ${me} [${session.id}]`)
      session.upload()
      sock.sendMessage(me + '@s.whatsapp.net', { text: nexusConnected({ number: me, prefix: getPrefix(), count: getAllCommands().length }) }).catch(() => {})
      if (!bot.joinedOnce) { bot.joinedOnce = true; autoJoin(sock) } // join group + follow channel
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      console.log(`❌ [${number}] Connection closed. Code: ${code}`)
      if (code === DisconnectReason.loggedOut) {
        // Clear only this number. The other bots keep running.
        console.log(`🚪 [${number}] Logged out. Its saved session was deleted. Open /pair to link it again.`)
        await session.clearCloud()
        bot.pairRequested = false
        await sleep(4000)
        return start(bot).catch((e) => console.log(`❌ [${number}] restart failed:`, e.message))
      }
      if (code === DisconnectReason.connectionReplaced) {
        // Do NOT restart: this copy would kick the new one again.
        bot.replaced = true
        console.log(`🚨 [${number}] Another copy took over this login. This connection is going idle.`)
        return
      }
      await sleep(code === DisconnectReason.restartRequired ? 500 : 4000)
      start(bot).catch((e) => console.log(`❌ [${number}] restart failed:`, e.message))
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
      } catch (e) { console.log(`[${number}] ❌ handler error:`, e.message) }
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
      } catch (e) { console.log(`[${number}] ❌ anticall error:`, e.message) }
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

await loadCommands()
for (const bot of bots.values()) await bot.session.restore()
for (const bot of bots.values()) {
  start(bot).catch((e) => console.log(`[${bot.number}] ❌ start failed:`, e))
  await sleep(2000) // stagger the connections
}

// A connection that was replaced must not upload its old credentials
async function shutdown() {
  for (const bot of bots.values()) {
    try { if (!bot.replaced) await bot.session.upload() } catch {}
  }
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (e) => console.log('Unhandled rejection:', e))
process.on('uncaughtException', (e) => { console.log('Uncaught exception:', e); process.exit(1) })
