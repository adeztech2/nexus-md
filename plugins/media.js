import axios from 'axios'
import yts from 'yt-search'
import { B } from '../lib/baileys.js'
import { ctxInfo } from '../lib/utils.js'

// Optional: bundled ffmpeg so animated stickers work on Render
try {
  const ff = await import('@ffmpeg-installer/ffmpeg')
  process.env.FFMPEG_PATH = (ff.default || ff).path
} catch {}

const BOT_NAME = process.env.BOT_NAME || 'NEXUS'
const MAX_BYTES = 50 * 1024 * 1024

// Find image/video in the message itself or in the message it replies to
function findMedia({ m, content, jid }) {
  const own = content?.imageMessage ? 'imageMessage' : content?.videoMessage ? 'videoMessage' : null
  if (own) return { msg: m, kind: own }
  const info = ctxInfo(content)
  const q = info.quotedMessage
  const kind = q?.imageMessage ? 'imageMessage' : q?.videoMessage ? 'videoMessage' : null
  if (!kind) return null
  return { msg: { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant }, message: q }, kind }
}

export default [
  {
    name: 'sticker', aliases: ['s'], category: 'Media', desc: 'Image/video → sticker (send or reply)',
    async run(ctx) {
      const found = findMedia(ctx)
      if (!found) return ctx.reply(`Send or reply to an image/video with ${ctx.prefix}sticker`)
      const buffer = await B.downloadMediaMessage(found.msg, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })
      const { Sticker } = await import('wa-sticker-formatter')
      const st = new Sticker(buffer, { pack: BOT_NAME, author: 'Arnold Adez', type: 'full', quality: 50 })
      await ctx.sock.sendMessage(ctx.jid, { sticker: await st.toBuffer() }, { quoted: ctx.m })
    }
  },
  {
    name: 'yts', aliases: ['ytsearch'], category: 'Media', desc: 'Search YouTube',
    async run({ body, reply }) {
      if (!body) return reply('Type what to search.')
      const r = await yts(body)
      const vids = r.videos.slice(0, 5)
      if (!vids.length) return reply('No results.')
      await reply(vids.map((v, i) => `*${i + 1}. ${v.title}*\n⏱ ${v.timestamp} • 👁 ${v.views.toLocaleString()}\n👤 ${v.author.name}\n${v.url}`).join('\n\n'))
    }
  },
  {
    name: 'dl', aliases: ['download'], category: 'Media', desc: 'Download a direct file link (max 50MB)',
    async run({ sock, jid, m, args, reply }) {
      const url = args[0]
      if (!/^https?:\/\//i.test(url || '')) return reply('Send a direct file link, e.g. .dl https://site.com/video.mp4')
      await reply('⏳ Downloading...')
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES })
      const type = String(res.headers['content-type'] || '').split(';')[0]
      const buffer = Buffer.from(res.data)
      const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file')
      let payload
      if (type.startsWith('video/')) payload = { video: buffer, mimetype: type }
      else if (type.startsWith('audio/')) payload = { audio: buffer, mimetype: type }
      else if (type.startsWith('image/')) payload = { image: buffer }
      else payload = { document: buffer, mimetype: type || 'application/octet-stream', fileName }
      await sock.sendMessage(jid, payload, { quoted: m })
    }
  }
]
