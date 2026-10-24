import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import './lib/keepalive.js'
import pino from 'pino'
import { B, makeWASocket } from './lib/baileys.js'
import { loadCommands, handleMessage, getAllCommands, getPrefix, clearMeta } from './lib/router.js'
import { getGroup } from './lib/db.js'
import { createSession } from './lib/session.js'
import { loadNumbers, saveNumbers } from './lib/numbers.js'
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
const PAIR_KEY = process.env.PAIR_KEY || ''
const logger = pino({ level: 'silent' })

// Numbers from the environment. More can be added from the /pair page.
const ENV_NUMBERS = String(process.env.BOT_NUMBERS || process.env.BOT_NUMBER || '')
  .split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)

const bots = new Map()       // number -> state for that connection
const knownNumbers = new Set() // every number that should run, saved to Supabase

function makeBot(number) {
  // A single-number deployment keeps SESSION_ID, so an existing bot keeps its login
  const useSessionId = process.env.SESSION_ID && ENV_NUMBERS.length === 1 && ENV_NUMBERS[0] === number
  const id = useSessionId ? process.env.SESSION_ID : `nexus_${number}`
  return { number, session: createSession(id), sock: null, starting: null, replaced: false, joinedOnce: false }
}

async function addBot(number) {
  const bot = makeBot(number)
  bots.set(number, bot)
  if (!knownNumbers.has(number)) {
    knownNumbers.add(number)
    await saveNumbers([...knownNumbers])
  }
  return bot
}

// Restore the login (if any) and start the connection. Resolves once the socket exists.
async function ensureRunning(bot) {
  if (bot.sock) return
  if (!bot.starting) {
    bot.starting = (async () => {
      await bot.session.restore()
      await start(bot)
    })().catch((e) => { bot.starting = null; throw e })
  }
  await bot.starting
}

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
    if (!PAIR_KEY) {
      return sendJson(res, 403, { error: 'Pairing is turned off. Set PAIR_KEY on this deployment.' })
    }
    if (url.searchParams.get('key') !== PAIR_KEY) {
      return sendJson(res, 403, { error: 'Wrong access key.' })
    }

    const existing = bots.get(number)
    const fresh = !existing?.sock
    const bot = existing || await addBot(number)

    try {
      await ensureRunning(bot)
    } catch (e) {
      console.log(`[${number}] ❌ start failed:`, e.message)
      return sendJson(res, 503, { error: 'Could not start this number. Try again in a few seconds.' })
    }
    if (fresh) await sleep(3000) // give a new socket a moment before asking for a code

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

  sendJson(res, 200, { status: 'ok', bot: BOT_NAME, numbers: bots.size, uptime: Math.floor(process.uptime()) })
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
        // Clear only this number. Its login is gone, so it waits for a new pairing on /pair.
        console.log(`🚪 [${number}] Logged out. Its saved session was deleted. Open /pair to link it again.`)
        await session.clearCloud()
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

// Startup: load commands, then start every saved and configured number
await loadCommands()
const stored = await loadNumbers()
for (const n of [...ENV_NUMBERS, ...stored]) knownNumbers.add(n)
await saveNumbers([...knownNumbers])
for (const n of knownNumbers) bots.set(n, makeBot(n))
for (const bot of bots.values()) {
  ensureRunning(bot).catch((e) => console.log(`[${bot.number}] ❌ start failed:`, e.message))
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
