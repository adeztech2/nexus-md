import axios from 'axios'
import tts from 'google-tts-api'
import { num } from '../lib/utils.js'
import { ctxInfo } from '../lib/utils.js'

const T = { category: 'Tools' }
const get = (url, opt = {}) => axios.get(url, { timeout: 15000, ...opt })

export default [
  { ...T, name: 'calc', desc: 'Calculator, e.g. .calc 12*(3+4)',
    async run({ body, reply }) {
      const expr = body.replace(/\^/g, '**').replace(/x/gi, '*')
      if (!expr || !/^[0-9+\-*/().%\s]+$/.test(expr)) return reply('Use numbers and + - * / ( ) % only.')
      const val = Function(`"use strict"; return (${expr})`)()
      if (!Number.isFinite(val)) return reply('❌ Cannot calculate that.')
      await reply(`🧮 ${body} = *${val}*`)
    } },
  { ...T, name: 'weather', desc: 'Weather for a city',
    async run({ body, reply }) {
      if (!body) return reply('Type a city, e.g. .weather Nairobi')
      const r = await get(`https://wttr.in/${encodeURIComponent(body)}?format=%l:+%c+%t+(feels+%f)%0AHumidity:+%h%0AWind:+%w`, { responseType: 'text' })
      await reply(`🌤 ${r.data}`)
    } },
  { ...T, name: 'time', desc: 'Current time (default Nairobi), e.g. .time Europe/London',
    async run({ body, reply }) {
      const tz = body || 'Africa/Nairobi'
      try { await reply(`🕒 ${tz}\n${new Date().toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' })}`) }
      catch { await reply('Unknown timezone. Example: Africa/Nairobi') }
    } },
  { ...T, name: 'wiki', desc: 'Wikipedia summary',
    async run({ body, reply }) {
      if (!body) return reply('Type a topic.')
      const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(body)}&srlimit=1&format=json`)
      const title = s.data?.query?.search?.[0]?.title
      if (!title) return reply('No result.')
      const r = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      await reply(`📚 *${r.data.title}*\n\n${(r.data.extract || '').slice(0, 1500)}\n\n${r.data.content_urls?.mobile?.page || ''}`)
    } },
  { ...T, name: 'define', aliases: ['dict'], desc: 'English dictionary',
    async run({ body, reply }) {
      if (!body) return reply('Type a word.')
      try {
        const r = await get(`https://api.dictionaryapi.dev/v2/entries/en/${encodeURIComponent(body.split(' ')[0])}`)
        const e = r.data[0]
        const out = e.meanings.slice(0, 3).map((m) => `_${m.partOfSpeech}_: ${m.definitions[0].definition}`).join('\n')
        await reply(`📖 *${e.word}*\n\n${out}`)
      } catch { await reply('Word not found.') }
    } },
  { ...T, name: 'qr', desc: 'Make a QR code from text or a link',
    async run({ sock, jid, m, body, reply }) {
      if (!body) return reply('Type the text or link.')
      const r = await get(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(body)}`, { responseType: 'arraybuffer' })
      await sock.sendMessage(jid, { image: Buffer.from(r.data), caption: '✅ QR code' }, { quoted: m })
    } },
  { ...T, name: 'tts', desc: 'Text to voice note, e.g. .tts hello',
    async run({ sock, jid, m, body, reply }) {
      if (!body) return reply('Type the text (max 200 characters).')
      const b64 = await tts.getAudioBase64(body.slice(0, 200), { lang: 'en', slow: false, timeout: 15000 })
      await sock.sendMessage(jid, { audio: Buffer.from(b64, 'base64'), mimetype: 'audio/mpeg', ptt: true }, { quoted: m })
    } },
  { ...T, name: 'shorten', aliases: ['short'], desc: 'Shorten a link',
    async run({ args, reply }) {
      if (!/^https?:\/\//i.test(args[0] || '')) return reply('Send a full link starting with http.')
      const r = await get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args[0])}`, { responseType: 'text' })
      await reply(`🔗 ${r.data}`)
    } },
  { ...T, name: 'pp', aliases: ['getpp'], desc: 'Get a profile picture (reply or mention)',
    async run({ sock, jid, m, content, sender, reply }) {
      const info = ctxInfo(content)
      const target = info.mentionedJid?.[0] || info.participant || sender
      try {
        const url = await sock.profilePictureUrl(target, 'image')
        await sock.sendMessage(jid, { image: { url }, caption: '@' + num(target), mentions: [target] }, { quoted: m })
      } catch { await reply('No profile picture (or it is private).') }
    } }
]
