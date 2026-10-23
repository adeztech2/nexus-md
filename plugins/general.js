import os from 'os'
import { getAllCommands } from '../lib/router.js'
import { formatUptime } from '../lib/utils.js'
import { BRAND, nexusMenu, nexusPing } from '../lib/nexusStyle.js'

const DEV_NAME = 'Arnold Adez'
const DEV_NUMBER = '254111783552'
const IMAGE_URL = process.env.MENU_IMAGE || 'https://u.pone.rs/vwszbeei.jpeg'

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
  }
]
