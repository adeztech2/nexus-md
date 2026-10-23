import { getAllCommands, getPrefix } from '../lib/router.js'
import { nexusMenu } from '../lib/nexusStyle.js'

export const name = 'menu'
export const category = 'general'
export const desc = 'Show all commands'

const IMAGE_URL = process.env.MENU_IMAGE || 'https://u.pone.rs/vwszbeei.jpeg'
let imageCache = null

// Download the picture once and keep it in memory. Returns null if it fails.
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

export async function run(ctx) {
  const sock = ctx.sock
  const m = ctx.m || ctx.msg || ctx.message
  const jid = ctx.jid || ctx.from || ctx.chat || m?.key?.remoteJid

  const commands = getAllCommands().map((c) => ({
    name: Array.isArray(c.name) ? c.name[0] : c.name,
    category: c.category,
    desc: c.desc || c.description || c.help || '',
  }))
  const text = nexusMenu(getPrefix(), commands)

  const image = await getImage()
  if (image) {
    try {
      await sock.sendMessage(jid, { image, caption: text }, { quoted: m })
      return
    } catch (e) {
      console.log('⚠️ Menu picture send failed:', e.message)
    }
  }
  await sock.sendMessage(jid, { text }, { quoted: m })
}
