import yts from 'yt-search'
import axios from 'axios'
import { ctxInfo, unwrap, getText } from '../lib/utils.js'
import {
  cobalt, cobaltReady, getBuffer, http, sendFile, friendly, decodeHtml, unescapeUrl, MAX_BYTES
} from '../lib/dl.js'

const CAT = 'Downloader'
const quotedText = ({ content }) => getText(unwrap(ctxInfo(content).quotedMessage))

// Build a download command: validates the link, shows progress, handles errors
function cmd(name, aliases, desc, usage, test, handler) {
  return {
    name, aliases, category: CAT, desc,
    async run(ctx) {
      const input = (ctx.body || quotedText(ctx) || '').trim()
      if (!input || (test && !test.test(input))) return ctx.reply(`📥 ${usage}`)
      try {
        await ctx.reply('⏳ Downloading...')
        await handler(ctx, input)
      } catch (e) {
        console.log(`❌ ${name} failed:`, e.message)
        await ctx.reply('❌ ' + friendly(e))
      }
    }
  }
}

// Download through cobalt and send (handles single files and multi-item posts)
async function viaCobalt(ctx, url, { audio = false, caption = '' } = {}) {
  const res = await cobalt(url, { audio })
  if (res.picker) {
    const items = res.picker.slice(0, 5)
    if (!items.length) throw new Error('Nothing to download in that post.')
    for (const it of items) {
      const f = await getBuffer(it.url)
      await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, caption })
    }
    return
  }
  const f = await getBuffer(res.url)
  await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, filename: res.filename || 'file', caption })
}

// Find a YouTube video from a search or a link
async function findVideo(q) {
  const id = q.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/)?.[1]
  if (id) return await yts({ videoId: id })
  const r = await yts(q)
  return r.videos?.[0]
}

// Search YouTube, show the result, send audio or video
async function playYoutube(ctx, query, { video = false } = {}) {
  const v = await findVideo(query)
  if (!v) throw new Error('No results found.')
  const maxSec = video ? 600 : 1200
  if (v.seconds > maxSec) throw new Error(`That is too long (${v.timestamp}). Limit is ${maxSec / 60} minutes.`)
  const info = `🎵 *${v.title}*\n👤 ${v.author?.name || ''}\n⏱ ${v.timestamp}\n🔗 ${v.url}`
  if (!cobaltReady()) {
    await ctx.reply(info)
    throw new Error('NO_COBALT')
  }
  if (v.thumbnail) await ctx.sock.sendMessage(ctx.jid, { image: { url: v.thumbnail }, caption: info }, { quoted: ctx.m })
  await viaCobalt(ctx, v.url, { audio: !video, caption: video ? v.title : '' })
}

// ---------- individual scrapers ----------
async function tiktokDownload(ctx, url) {
  try {
    const r = await axios.get('https://www.tikwm.com/api/', { params: { url, hd: 1 }, timeout: 30000 })
    const d = r.data?.data
    if (r.data?.code !== 0 || !d) throw new Error('tikwm failed')
    const abs = (u) => (u?.startsWith('/') ? 'https://www.tikwm.com' + u : u)
    if (d.images?.length) {
      for (const img of d.images.slice(0, 5)) {
        const f = await getBuffer(abs(img))
        await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, caption: d.title || '' })
      }
      return
    }
    const f = await getBuffer(abs(d.hdplay || d.play))
    return await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, type: 'video/mp4', caption: `🎵 ${d.title || 'TikTok'}` })
  } catch (e) {
    if (!cobaltReady()) throw e
    await viaCobalt(ctx, url)
  }
}

async function pinterestDownload(ctx, url) {
  try {
    const html = String((await http(url)).data)
    const vid = html.match(/"contentUrl":"(https:[^"]+?\.mp4)"/)?.[1] || html.match(/property="og:video(?::url)?" content="([^"]+)"/)?.[1]
    const img = html.match(/property="og:image" content="([^"]+)"/)?.[1]
    const media = vid ? unescapeUrl(vid) : img ? unescapeUrl(img).replace(/\/\d+x\//, '/originals/') : null
    if (!media) throw new Error('no media found')
    const f = await getBuffer(media)
    return await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, type: vid ? 'video/mp4' : f.type || 'image/jpeg', caption: '📌 Pinterest' })
  } catch (e) {
    if (!cobaltReady()) throw new Error('Could not read that Pinterest link.')
    await viaCobalt(ctx, url)
  }
}

async function mediafireDownload(ctx, url) {
  const html = String((await http(url)).data)
  let link = html.match(/href="(https?:\/\/download[0-9]*\.mediafire\.com[^"]+)"/)?.[1]
  if (!link) {
    const scrambled = html.match(/data-scrambled-url="([^"]+)"/)?.[1]
    if (scrambled) link = Buffer.from(scrambled, 'base64').toString()
  }
  if (!link) throw new Error('Could not find the download link (the file may be removed).')
  const name = decodeHtml(html.match(/<div class="filename">([^<]+)</)?.[1] || decodeURIComponent(link.split('/').pop().split('?')[0]))
  const size = html.match(/File size:\s*<span>([^<]+)</)?.[1] || ''
  const f = await getBuffer(link)
  await sendFile(ctx.sock, ctx.jid, ctx.m, { ...f, type: f.type.startsWith('text/') ? 'application/octet-stream' : f.type, filename: name, caption: `📦 ${name}${size ? `\n💾 ${size}` : ''}` })
}

async function apkDownload(ctx, name) {
  const r = await http(`https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(name)}/limit=1`)
  const app = r.data?.datalist?.list?.[0]
  if (!app?.file?.path) throw new Error('App not found.')
  if (app.size > MAX_BYTES) throw new Error(`${app.name} is too big (${(app.size / 1048576).toFixed(0)} MB, limit 90 MB).`)
  const caption = `📱 *${app.name}*\n📦 ${app.package}\n🔖 v${app.file.vername || '?'}\n💾 ${(app.size / 1048576).toFixed(1)} MB`
  if (app.icon) await ctx.sock.sendMessage(ctx.jid, { image: { url: app.icon }, caption }, { quoted: ctx.m })
  const f = await getBuffer(app.file.path)
  await ctx.sock.sendMessage(ctx.jid, {
    document: f.buffer, mimetype: 'application/vnd.android.package-archive', fileName: `${app.name}.apk`
  }, { quoted: ctx.m })
}

// Spotify / Apple Music can't be downloaded directly: find the song name, then play it from YouTube
async function spotifyTitle(url) {
  const r = await http(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
  if (!r.data?.title) throw new Error('Could not read that Spotify link.')
  return r.data.title
}
async function appleTitle(url) {
  const html = String((await http(url)).data)
  const t = html.match(/property="og:title" content="([^"]+)"/)?.[1]
  if (!t) throw new Error('Could not read that Apple Music link.')
  return decodeHtml(t).replace(/\s+on Apple Music.*$/i, '').replace(/\s+by\s+/i, ' ')
}

// ---------- commands ----------
export default [
  cmd('apk', ['app', 'apkdl'], 'Download an Android app', 'Type an app name, e.g. .apk whatsapp', null, apkDownload),

  cmd('apple', ['applemusic'], 'Apple Music link → song audio', 'Send an Apple Music link, e.g. .apple https://music.apple.com/...',
    /music\.apple\.com/i, async (ctx, url) => playYoutube(ctx, await appleTitle(url))),

  cmd('facebook', ['fb', 'fbdl'], 'Download a Facebook video', 'Send a Facebook link, e.g. .facebook https://fb.watch/...',
    /facebook\.com|fb\.watch|fb\.com/i, (ctx, url) => viaCobalt(ctx, url)),

  cmd('instagram', ['ig', 'insta'], 'Download Instagram reels/posts', 'Send an Instagram link, e.g. .instagram https://instagram.com/reel/...',
    /instagram\.com/i, (ctx, url) => viaCobalt(ctx, url)),

  cmd('mfire', ['mediafire'], 'Download a MediaFire file', 'Send a MediaFire link, e.g. .mfire https://www.mediafire.com/file/...',
    /mediafire\.com/i, mediafireDownload),

  cmd('pinterest', ['pin', 'pindl'], 'Download Pinterest video/image', 'Send a Pinterest link, e.g. .pinterest https://pin.it/...',
    /pinterest\.|pin\.it/i, pinterestDownload),

  cmd('play', ['song', 'music'], 'Search a song and get the audio', 'Type a song name, e.g. .play burna boy last last', null,
    (ctx, q) => playYoutube(ctx, q)),

  cmd('soundcloud', ['sc', 'scdl'], 'Download a SoundCloud track', 'Send a SoundCloud link, e.g. .soundcloud https://soundcloud.com/...',
    /soundcloud\.com|on\.soundcloud\.com/i, (ctx, url) => viaCobalt(ctx, url, { audio: true })),

  cmd('spotify', ['spot'], 'Spotify link → song audio', 'Send a Spotify link, e.g. .spotify https://open.spotify.com/track/...',
    /open\.spotify\.com/i, async (ctx, url) => playYoutube(ctx, await spotifyTitle(url))),

  cmd('tiktok', ['tt', 'ttdl'], 'Download a TikTok video (no watermark)', 'Send a TikTok link, e.g. .tiktok https://vm.tiktok.com/...',
    /tiktok\.com/i, tiktokDownload),

  cmd('twitter', ['x', 'tw'], 'Download a Twitter/X video', 'Send a tweet link, e.g. .twitter https://x.com/user/status/...',
    /twitter\.com|x\.com/i, (ctx, url) => viaCobalt(ctx, url)),

  cmd('video', ['ytv', 'ytmp4'], 'Search YouTube and get the video', 'Type a name or send a YouTube link, e.g. .video funny cats', null,
    (ctx, q) => playYoutube(ctx, q, { video: true }))
]
