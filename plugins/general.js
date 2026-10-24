import os from 'os'
import { getAllCommands } from '../lib/router.js'
import { formatUptime } from '../lib/utils.js'
import { BRAND, nexusMenu, nexusPing, nexusBox, nexusHint } from '../lib/nexusStyle.js'

const DEV_NAME = 'Arnold Adez'
const DEV_NUMBER = '254111783552'
const IMAGE_URL = process.env.MENU_IMAGE || 'https://u.pone.rs/vwszbeei.jpeg'
const REPO_URL = process.env.REPO_URL || 'https://github.com/adeztech2/nexus-md'
const SUPPORT_LINK = process.env.SUPPORT_LINK || ''
const CHANNEL_LINK = process.env.CHANNEL_LINK || ''

// Download the menu picture once and keep it in memory. Returns null if it fails.
let imageCache = null
async function getImage() {
  if (imageCache) return imageCache
  try {
    const res = await fetch(IMAGE_URL)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    imageCache = Buffer.from(await res.arrayBuffer())
    return imageCache
  } catch (e) {
    console.log('⚠️ Menu picture failed:', e.message)
    return null
  }
}

// Text typed with the command, without the command word itself
function argText(m) {
  const x = m.message || {}
  const t = x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || ''
  return t.trim().split(/\s+/).slice(1).join(' ')
}

// Who the command is about: @mention, replied-to person, typed number, or the sender
function targetJid(m) {
  const x = m.message || {}
  const ctx = Object.values(x).find((v) => v && typeof v === 'object' && v.contextInfo)?.contextInfo
  if (ctx?.mentionedJid?.[0]) return ctx.mentionedJid[0]
  if (ctx?.participant) return ctx.participant
  const digits = argText(m).replace(/\D/g, '')
  if (digits.length >= 8) return digits + '@s.whatsapp.net'
  return m.key.participant || m.key.remoteJid
}

export default [
  {
    name: 'menu', aliases: ['help', 'commands'], category: 'General', desc: 'Show all commands',
    async run({ reply, prefix, sock, jid, m }) {
      const text = nexusMenu(prefix, getAllCommands())
      const image = await getImage()
      if (image) {
        try {
          await sock.sendMessage(jid, { image, caption: text }, { quoted: m })
          return
        } catch (e) {
          console.log('⚠️ Menu picture send failed:', e.message)
        }
      }
      await reply(text)
    }
  },
  {
    name: 'ping', category: 'General', desc: 'Check bot speed',
    async run({ sock, jid, m }) {
      const t = Date.now()
      const sent = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: m })
      await sock.sendMessage(jid, { text: nexusPing(t), edit: sent.key })
    }
  },
  {
    name: 'alive', aliases: ['runtime', 'uptime'], category: 'General', desc: 'Uptime and status',
    async run({ reply }) {
      const mem = (process.memoryUsage().rss / 1048576).toFixed(0)
      await reply([
        `🔷 *${BRAND.name} — STATUS*`,
        BRAND.line,
        '🟢 Status: Running',
        `⏱️ Uptime: ${formatUptime(process.uptime())}`,
        `💾 Memory: ${mem} MB`,
        `🖥️ Platform: ${os.platform()}`,
        BRAND.footer,
      ].join('\n'))
    }
  },
  {
    name: 'owner', aliases: ['dev', 'developer'], category: 'General', desc: 'Show the developer contact',
    async run({ reply }) {
      await reply([
        `🔷 *${BRAND.name} — DEVELOPER*`,
        BRAND.line,
        `👨‍💻 Name: ${DEV_NAME}`,
        `📞 Number: +${DEV_NUMBER}`,
        `💬 Chat: wa.me/${DEV_NUMBER}`,
        BRAND.footer,
      ].join('\n'))
    }
  },

  // ----- New commands -----
  {
    name: 'test', category: 'General', desc: 'Check that the bot is working',
    async run({ reply }) {
      await reply(nexusBox('✅ *TEST*', ['NEXUS MD is working fine.']))
    }
  },
  {
    name: 'repo', aliases: ['sc', 'script'], category: 'General', desc: 'Get the bot source code link',
    async run({ reply }) {
      await reply(nexusBox('📦 *SOURCE CODE*', [`🔗 ${REPO_URL}`, '⭐ Star the repo if you like the bot.']))
    }
  },
  {
    name: 'support', category: 'General', desc: 'Get the support link',
    async run({ reply }) {
      if (!SUPPORT_LINK) return reply(nexusHint('Support link is not set yet. Contact the owner with the owner command.'))
      await reply(nexusBox('🆘 *SUPPORT*', [`🔗 ${SUPPORT_LINK}`]))
    }
  },
  {
    name: 'channel', category: 'General', desc: 'Get the WhatsApp channel link',
    async run({ reply }) {
      if (!CHANNEL_LINK) return reply(nexusHint('Channel link is not set yet.'))
      await reply(nexusBox('📢 *CHANNEL*', [`🔗 ${CHANNEL_LINK}`]))
    }
  },
  {
    name: 'report', aliases: ['bug'], category: 'General', desc: 'Report a problem to the developer, e.g. .report text',
    async run({ reply, prefix, sock, m }) {
      const text = argText(m)
      if (!text) return reply(nexusHint(`Write your report, e.g. ${prefix}report .sticker is not working`))
      const from = (m.key.participant || m.key.remoteJid || '').split('@')[0]
      try {
        await sock.sendMessage(DEV_NUMBER + '@s.whatsapp.net', {
          text: nexusBox('🐞 *NEW REPORT*', [`From: +${from}`, `Chat: ${m.key.remoteJid}`, '', text])
        })
        await reply(nexusBox('✅ *REPORT SENT*', ['Thanks! The developer will look at it.']))
      } catch (e) {
        console.log('❌ report failed:', e.message)
        await reply(nexusHint('Could not send the report. Try again later.'))
      }
    }
  },
  {
    name: 'whois', category: 'General', desc: 'Info about a person (mention, reply or number)',
    async run({ reply, sock, jid, m }) {
      const target = targetJid(m)
      const number = target.split('@')[0]
      const lines = [`📞 Number: +${number}`]
      try {
        const [res] = (await sock.onWhatsApp(target)) || []
        lines.push(`💬 On WhatsApp: ${res?.exists ? 'Yes' : 'No'}`)
      } catch {}
      try {
        const st = await sock.fetchStatus(target)
        const bio = Array.isArray(st) ? st[0]?.status?.status : st?.status
        if (bio) lines.push(`📝 Bio: ${bio}`)
      } catch {}
      lines.push(`🔗 Chat: wa.me/${number}`)
      const text = nexusBox('🔎 *WHOIS*', lines)
      try {
        const url = await sock.profilePictureUrl(target, 'image')
        await sock.sendMessage(jid, { image: { url }, caption: text }, { quoted: m })
      } catch {
        await reply(text)
      }
    }
  }
]
