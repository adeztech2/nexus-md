import axios from 'axios'

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
export const MAX_BYTES = 90 * 1024 * 1024
const COBALT = String(process.env.COBALT_API_URL || '').replace(/\/$/, '')

export const cobaltReady = () => !!COBALT

// GET a page or API (text/json)
export const http = (url, opt = {}) =>
  axios.get(url, { timeout: 30000, headers: { 'User-Agent': UA }, maxRedirects: 5, ...opt })

// Download a file into memory (stops if bigger than MAX_BYTES)
export async function getBuffer(url, max = MAX_BYTES) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer', timeout: 180000, maxContentLength: max, maxBodyLength: max,
    headers: { 'User-Agent': UA }
  })
  return { buffer: Buffer.from(r.data), type: String(r.headers['content-type'] || '').split(';')[0] }
}

// cobalt API (https://github.com/imputnet/cobalt): needs COBALT_API_URL (+ COBALT_API_KEY if your instance wants one)
export async function cobalt(url, { audio = false } = {}) {
  if (!COBALT) throw new Error('NO_COBALT')
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (process.env.COBALT_API_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_API_KEY}`
  const r = await axios.post(COBALT + '/', {
    url, downloadMode: audio ? 'audio' : 'auto', audioFormat: 'mp3', videoQuality: '720', filenameStyle: 'basic'
  }, { headers, timeout: 60000, validateStatus: () => true })
  const d = r.data || {}
  if (d.status === 'error') throw new Error('Downloader refused: ' + (d.error?.code || 'unknown error'))
  if (d.status === 'picker') return { picker: d.picker || [], audio: d.audio }
  if (d.url) return { url: d.url, filename: d.filename }
  throw new Error('The downloader returned nothing.')
}

// Send a downloaded file as the right WhatsApp message type
export function sendFile(sock, jid, m, { buffer, type = '', filename = 'file', caption = '' }) {
  let payload
  if (type.startsWith('video/')) payload = { video: buffer, mimetype: 'video/mp4', caption }
  else if (type.startsWith('audio/')) payload = { audio: buffer, mimetype: type === 'audio/mpeg' ? 'audio/mpeg' : type, fileName: filename }
  else if (type.startsWith('image/')) payload = { image: buffer, caption }
  else payload = { document: buffer, mimetype: type || 'application/octet-stream', fileName: filename, caption }
  return sock.sendMessage(jid, payload, { quoted: m })
}

// Turn technical errors into short, readable messages
export function friendly(e) {
  const msg = String(e?.message || e)
  if (msg === 'NO_COBALT') return 'This downloader needs COBALT_API_URL set in Render → Environment (your cobalt instance).'
  if (/maxContentLength|maxBodyLength/i.test(msg)) return 'That file is too big (limit 90 MB).'
  if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(msg)) return 'The download timed out. Try again.'
  if (/404/.test(msg)) return 'Nothing found at that link.'
  return msg.slice(0, 160)
}

export const decodeHtml = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export const unescapeUrl = (s = '') =>
  decodeHtml(s).replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\u0026/gi, '&')
