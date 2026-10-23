import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { getText, num, unwrap, sameUser } from './utils.js'
import { getGroup } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PREFIX = process.env.PREFIX || '.'
const PRIVATE = String(process.env.PRIVATE || '').toLowerCase() === 'true'
const OWNERS = String(process.env.OWNER_NUMBER || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)

const commands = new Map()
const list = []
export const getAllCommands = () => list
export const getPrefix = () => PREFIX

export async function loadCommands() {
  const dir = path.join(__dirname, '../plugins')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const mod = await import(pathToFileURL(path.join(dir, f)).href)
      for (const c of [].concat(mod.default)) {
        list.push(c)
        for (const n of [c.name, ...(c.aliases || [])]) commands.set(n.toLowerCase(), c)
      }
    } catch (e) { console.log(`❌ Plugin ${f} failed:`, e.message) }
  }
  console.log(`🔌 Loaded ${list.length} commands`)
}

const metaCache = new Map() // jid -> { at, data }
async function getMeta(sock, jid) {
  const hit = metaCache.get(jid)
  if (hit && Date.now() - hit.at < 60000) return hit.data
  try {
    const data = await sock.groupMetadata(jid)
    metaCache.set(jid, { at: Date.now(), data })
    return data
  } catch { return hit?.data || null }
}
export const clearMeta = (jid) => metaCache.delete(jid)

export async function handleMessage(sock, m) {
  if (!m.message || m.key.remoteJid === 'status@broadcast') return
  const jid = m.key.remoteJid
  const isGroup = jid.endsWith('@g.us')
  const sender = m.key.fromMe ? sock.user.id : (m.key.participant || jid)
  const content = unwrap(m.message)
  const text = getText(content)
  const isOwner = !!m.key.fromMe || OWNERS.includes(num(sender))
  const reply = (t, extra = {}) => sock.sendMessage(jid, { text: t, ...extra }, { quoted: m })

  let metadata = null, isAdmin = false, isBotAdmin = false
  if (isGroup) {
    metadata = await getMeta(sock, jid)
    if (metadata) {
      isAdmin = metadata.participants.some((p) => p.admin && sameUser(p, sender))
      isBotAdmin = metadata.participants.some((p) =>
        p.admin && (sameUser(p, sock.user.id) || (sock.user.lid && sameUser(p, sock.user.lid))))
    }
    // Anti-link: delete WhatsApp invite links from non-admins
    if (getGroup(jid).antilink && !m.key.fromMe && !isAdmin && isBotAdmin &&
        /chat\.whatsapp\.com\/[A-Za-z0-9]/.test(text)) {
      try {
        await sock.sendMessage(jid, { delete: m.key })
        await sock.sendMessage(jid, { text: `🚫 @${num(sender)} group links are not allowed here.`, mentions: [sender] })
      } catch {}
      return
    }
  }

  if (!text.startsWith(PREFIX)) return
  const [name, ...args] = text.slice(PREFIX.length).trim().split(/\s+/)
  const cmd = commands.get((name || '').toLowerCase())
  if (!cmd) return
  if (PRIVATE && !isOwner) return
  if (cmd.owner && !isOwner) return reply('⛔ Owner only command.')
  if (cmd.group && !isGroup) return reply('👥 This command works in groups only.')
  if (cmd.admin && !(isAdmin || isOwner)) return reply('⛔ Group admins only.')
  if (cmd.botAdmin && !isBotAdmin) return reply('⚠️ Make me a group admin first.')

  const ctx = { sock, m, jid, sender, isGroup, isOwner, isAdmin, isBotAdmin, metadata, text, content,
    args, body: args.join(' '), prefix: PREFIX, reply }
  try { await cmd.run(ctx) } catch (e) {
    console.log(`❌ ${name} failed:`, e.stack || e)
    reply('❌ Something went wrong: ' + e.message).catch(() => {})
  }
}
