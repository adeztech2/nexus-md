import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import axios from 'axios'
import yts from 'yt-search'
import { B } from '../lib/baileys.js'
import { ctxInfo } from '../lib/utils.js'
import { nexusBox, nexusHint, BRAND } from '../lib/nexusStyle.js'

// Optional: bundled ffmpeg so animated stickers and audio tools work on Render
try {
  const ff = await import('@ffmpeg-installer/ffmpeg')
  process.env.FFMPEG_PATH = (ff.default || ff).path
} catch {}

const BOT_NAME = process.env.BOT_NAME || 'NEXUS'
const AUTHOR = 'Arnold Adez'
const MAX_BYTES = 50 * 1024 * 1024

// Find media of the wanted kinds in the message itself or in the message it replies to
function findMedia({ m, content, jid }, kinds = ['imageMessage', 'videoMessage']) {
  const own = kinds.find((k) => content?.[k])
  if (own) return { msg: m, kind: own }
  const info = ctxInfo(content)
  const q = info.quotedMessage
  const kind = kinds.find((k) => q?.[k])
  if (!kind) return null
  return { msg: { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant }, message: q }, kind }
}

const download = (ctx, found) =>
  B.downloadMediaMessage(found.msg, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })

async function makeSticker(ctx, type, usage) {
  const found = findMedia(ctx)
  if (!found) return ctx.reply(nexusHint(`Send or reply to an image/video with ${ctx.prefix}${usage}`))
  const buffer = await download(ctx, found)
  const { Sticker } = await import('wa-sticker-formatter')
  const st = new Sticker(buffer, { pack: BOT_NAME, author: AUTHOR, type, quality: 50 })
  await ctx.sock.sendMessage(ctx.jid, { sticker: await st.toBuffer() }, { quoted: ctx.m })
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args)
    p.on('error', () => reject(new Error('ffmpeg is not installed')))
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed'))))
  })
}

const ytId = (s = '') => s.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1]

export default [
  // ───── Stickers ─────
  {
    name: 'sticker', aliases: ['s'], category: 'Media', desc: 'Image/video → sticker (send or reply)',
    async run(ctx) { await makeSticker(ctx, 'full', 'sticker') }
  },
  {
    name: 'scircle', aliases: ['sround'], category: 'Media', desc: 'Image/video → round sticker',
    async run(ctx) { await makeSticker(ctx, 'circle', 'scircle') }
  },
  {
    name: 'scrop', category: 'Media', desc: 'Image/video → cropped square sticker',
    async run(ctx) { await makeSticker(ctx, 'crop', 'scrop') }
  },
  {
    name: 'take', aliases: ['steal'], category: 'Media', desc: 'Re-name a sticker, e.g. .take pack|author',
    async run(ctx) {
      const found = findMedia(ctx, ['stickerMessage'])
      if (!found) return ctx.reply(nexusHint(`Reply to a sticker with ${ctx.prefix}take pack|author`))
      const [pack, author] = ctx.body.split('|').map((x) => x.trim())
      const buffer = await download(ctx, found)
      const { Sticker } = await import('wa-sticker-formatter')
      const st = new Sticker(buffer, { pack: pack || BOT_NAME, author: author || AUTHOR, type: 'full', quality: 50 })
      await ctx.sock.sendMessage(ctx.jid, { sticker: await st.toBuffer() }, { quoted: ctx.m })
    }
  },
  {
    name: 'toimg', aliases: ['toimage'], category: 'Media', desc: 'Sticker → image (reply to a sticker)',
    async run(ctx) {
      const found = findMedia(ctx, ['stickerMessage'])
      if (!found) return ctx.reply(nexusHint(`Reply to a sticker with ${ctx.prefix}toimg`))
      const buffer = await download(ctx, found)
      let png
      try {
        const sharp = (await import('sharp')).default
        png = await sharp(buffer).png().toBuffer()
      } catch { return ctx.reply(nexusHint('Image conversion is not available on this server.')) }
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: `🔷 *${BRAND.name}*\n✅ Sticker converted\n\n${BRAND.footer}` }, { quoted: ctx.m })
    }
  },

  // ───── Converters ─────
  {
    name: 'tomp3', aliases: ['mp3', 'toaudio'], category: 'Media', desc: 'Video → audio (reply to a video)',
    async run(ctx) {
      const found = findMedia(ctx, ['videoMessage', 'audioMessage'])
      if (!found) return ctx.reply(nexusHint(`Reply to a video with ${ctx.prefix}tomp3`))
      const buffer = await download(ctx, found)
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      const input = path.join(os.tmpdir(), `in-${id}`)
      const output = path.join(os.tmpdir(), `out-${id}.mp3`)
      try {
        fs.writeFileSync(input, buffer)
        await runFfmpeg(['-y', '-i', input, '-vn', '-ac', '2', '-b:a', '128k', output])
        await ctx.sock.sendMessage(ctx.jid, { audio: fs.readFileSync(output), mimetype: 'audio/mpeg' }, { quoted: ctx.m })
      } catch (e) {
        await ctx.reply(nexusHint(e.message === 'ffmpeg is not installed' ? 'Audio conversion needs ffmpeg on the server.' : 'Could not convert that file.'))
      } finally {
        fs.rmSync(input, { force: true }); fs.rmSync(output, { force: true })
      }
    }
  },
  {
    name: 'tourl', aliases: ['upload'], category: 'Media', desc: 'Upload an image/video/audio and get a link',
    async run(ctx) {
      const found = findMedia(ctx, ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'])
      if (!found) return ctx.reply(nexusHint(`Send or reply to a file with ${ctx.prefix}tourl`))
      const buffer = await download(ctx, found)
      if (buffer.length > 30 * 1024 * 1024) return ctx.reply(nexusHint('File is too big (max 30MB).'))
      const mime = found.msg.message[found.kind]?.mimetype || 'application/octet-stream'
      const ext = mime.split('/')[1]?.split(';')[0] || 'bin'
      const form = new FormData()
      form.append('reqtype', 'fileupload')
      form.append('fileToUpload', new Blob([buffer], { type: mime }), `file.${ext}`)
      const r = await axios.post('https://catbox.moe/user/api.php', form, { timeout: 60000 })
      await ctx.reply(nexusBox('🔗 *UPLOAD*', [String(r.data).trim()]))
    }
  },

  // ───── Web & YouTube ─────
  {
    name: 'ss', aliases: ['screenshot'], category: 'Media', desc: 'Screenshot of a website',
    async run({ sock, jid, m, args, reply, prefix }) {
      let url = args[0]
      if (!url) return reply(nexusHint(`Type a link, e.g. ${prefix}ss google.com`))
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      const r = await axios.get(`https://image.thum.io/get/width/1280/crop/800/${url}`, { responseType: 'arraybuffer', timeout: 45000 })
      await sock.sendMessage(jid, { image: Buffer.from(r.data), caption: `🔷 *${BRAND.name}*\n🌐 ${url}\n\n${BRAND.footer}` }, { quoted: m })
    }
  },
  {
    name: 'ytinfo', aliases: ['yt'], category: 'Media', desc: 'Details of a YouTube video (link or search)',
    async run({ sock, jid, m, body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Type a link or name, e.g. ${prefix}ytinfo Burna Boy`))
      const id = ytId(body)
      const v = id ? await yts({ videoId: id }) : (await yts(body)).videos[0]
      if (!v) return reply(nexusHint('No result.'))
      const text = nexusBox('▶️ *YOUTUBE*', [
        `*${v.title}*`,
        `👤 ${v.author?.name || 'Unknown'}`,
        `⏱️ ${v.timestamp} • 👁️ ${(v.views || 0).toLocaleString()}`,
        v.ago ? `📅 ${v.ago}` : '',
        v.url,
      ].filter(Boolean))
      try { await sock.sendMessage(jid, { image: { url: v.thumbnail || v.image }, caption: text }, { quoted: m }) }
      catch { await reply(text) }
    }
  },
  {
    name: 'yts', aliases: ['ytsearch'], category: 'Media', desc: 'Search YouTube',
    async run({ body, reply }) {
      if (!body) return reply(nexusHint('Type what to search.'))
      const r = await yts(body)
      const vids = r.videos.slice(0, 5)
      if (!vids.length) return reply(nexusHint('No results.'))
      await reply(nexusBox('🔎 *YOUTUBE SEARCH*', vids.flatMap((v, i) => [
        `*${i + 1}. ${v.title}*`,
        `⏱️ ${v.timestamp} • 👁️ ${v.views.toLocaleString()}`,
        `👤 ${v.author.name}`,
        v.url,
        '',
      ])))
    }
  },
  {
    name: 'dl', aliases: ['download'], category: 'Media', desc: 'Download a direct file link (max 50MB)',
    async run({ sock, jid, m, args, reply }) {
      const url = args[0]
      if (!/^https?:\/\//i.test(url || '')) return reply(nexusHint('Send a direct file link, e.g. .dl https://site.com/video.mp4'))
      await reply(nexusHint('⏳ Downloading...'))
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
