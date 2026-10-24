import axios from 'axios'
import tts from 'google-tts-api'
import crypto from 'crypto'
import { num } from '../lib/utils.js'
import { ctxInfo } from '../lib/utils.js'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'

const T = { category: 'Tools' }
const get = (url, opt = {}) => axios.get(url, { timeout: 15000, ...opt })

// ───────────── helpers for the new commands ─────────────
const quoted = (content) => {
  const q = ctxInfo(content).quotedMessage
  return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || ''
}
const input = (ctx) => String(ctx.body || quoted(ctx.content) || '').trim()
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d })
const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').trim()
const use = (ctx, text) => ctx.reply(nexusHint(`Use: ${ctx.prefix}${text}`))
const TZ = process.env.TIMEZONE || 'Africa/Nairobi'

// Block links that point to private/internal addresses
function blocked(u) {
  try {
    const h = new URL(u).hostname.toLowerCase()
    return /^(localhost|0\.0\.0\.0|\[?::1\]?)$/.test(h) || /^(127|10)\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.endsWith('.internal') || h.endsWith('.local')
  } catch { return true }
}
const withHttp = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u)

// Send a picture with a caption, or just the text if the picture fails
async function card(ctx, url, text) {
  if (url) {
    try { await ctx.sock.sendMessage(ctx.jid, { image: { url }, caption: text }, { quoted: ctx.m }); return } catch {}
  }
  await ctx.reply(text)
}

// Builds a command that never crashes the bot
const C = (name, desc, run, aliases = []) => ({
  ...T, name, aliases, desc,
  async run(ctx) {
    try { await run(ctx) } catch (e) {
      console.log(`❌ ${name} failed:`, e.message)
      await ctx.reply(nexusHint('❌ Could not do that right now. Check your input and try again.'))
    }
  }
})

// ───────────── original commands (unchanged) ─────────────
const original = [
  { ...T, name: 'calc', desc: 'Calculator, e.g. .calc 12*(3+4)',
    async run({ body, reply }) {
      const expr = body.replace(/\^/g, '**').replace(/x/gi, '*')
      if (!expr || !/^[0-9+\-*/().%\s]+$/.test(expr)) return reply(nexusHint('Use numbers and + - * / ( ) % only.'))
      const val = Function(`"use strict"; return (${expr})`)()
      if (!Number.isFinite(val)) return reply(nexusHint('❌ Cannot calculate that.'))
      await reply(nexusBox('🧮 *CALCULATOR*', [`Input: ${body}`, `Answer: *${val}*`]))
    } },
  { ...T, name: 'weather', desc: 'Weather for a city',
    async run({ body, reply }) {
      if (!body) return reply(nexusHint('Type a city, e.g. .weather Nairobi'))
      const r = await get(`https://wttr.in/${encodeURIComponent(body)}?format=%l:+%c+%t+(feels+%f)%0AHumidity:+%h%0AWind:+%w`, { responseType: 'text' })
      await reply(nexusBox('🌤 *WEATHER*', [r.data]))
    } },
  { ...T, name: 'time', desc: 'Current time (default Nairobi), e.g. .time Europe/London',
    async run({ body, reply }) {
      const tz = body || 'Africa/Nairobi'
      try {
        const now = new Date().toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' })
        await reply(nexusBox('🕒 *TIME*', [`Zone: ${tz}`, now]))
      } catch { await reply(nexusHint('Unknown timezone. Example: Africa/Nairobi')) }
    } },
  { ...T, name: 'wiki', desc: 'Wikipedia summary',
    async run({ body, reply }) {
      if (!body) return reply(nexusHint('Type a topic.'))
      const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(body)}&srlimit=1&format=json`)
      const title = s.data?.query?.search?.[0]?.title
      if (!title) return reply(nexusHint('No result.'))
      const r = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      await reply(nexusBox('📚 *WIKIPEDIA*', [`*${r.data.title}*`, '', (r.data.extract || '').slice(0, 1500), '', r.data.content_urls?.mobile?.page || '']))
    } },
  { ...T, name: 'define', aliases: ['dict'], desc: 'English dictionary',
    async run({ body, reply }) {
      if (!body) return reply(nexusHint('Type a word.'))
      try {
        const r = await get(`https://api.dictionaryapi.dev/v2/entries/en/${encodeURIComponent(body.split(' ')[0])}`)
        const e = r.data[0]
        const out = e.meanings.slice(0, 3).map((m) => `_${m.partOfSpeech}_: ${m.definitions[0].definition}`)
        await reply(nexusBox('📖 *DICTIONARY*', [`*${e.word}*`, '', ...out]))
      } catch { await reply(nexusHint('Word not found.')) }
    } },
  { ...T, name: 'qr', desc: 'Make a QR code from text or a link',
    async run({ sock, jid, m, body, reply }) {
      if (!body) return reply(nexusHint('Type the text or link.'))
      const r = await get(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(body)}`, { responseType: 'arraybuffer' })
      await sock.sendMessage(jid, { image: Buffer.from(r.data), caption: '🔷 *NEXUS MD*\n✅ QR code ready\n\n💙 Powered by NEXUS MD' }, { quoted: m })
    } },
  { ...T, name: 'tts', desc: 'Text to voice note, e.g. .tts hello',
    async run({ sock, jid, m, body, reply }) {
      if (!body) return reply(nexusHint('Type the text (max 200 characters).'))
      const b64 = await tts.getAudioBase64(body.slice(0, 200), { lang: 'en', slow: false, timeout: 15000 })
      await sock.sendMessage(jid, { audio: Buffer.from(b64, 'base64'), mimetype: 'audio/mpeg', ptt: true }, { quoted: m })
    } },
  { ...T, name: 'shorten', aliases: ['short'], desc: 'Shorten a link',
    async run({ args, reply }) {
      if (!/^https?:\/\//i.test(args[0] || '')) return reply(nexusHint('Send a full link starting with http.'))
      const r = await get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args[0])}`, { responseType: 'text' })
      await reply(nexusBox('🔗 *LINK SHORTENER*', [`Short link: ${r.data}`]))
    } },
  { ...T, name: 'pp', aliases: ['getpp'], desc: 'Get a profile picture (reply or mention)',
    async run({ sock, jid, m, content, sender, reply }) {
      const info = ctxInfo(content)
      const target = info.mentionedJid?.[0] || info.participant || sender
      try {
        const url = await sock.profilePictureUrl(target, 'image')
        await sock.sendMessage(jid, { image: { url }, caption: '🔷 *NEXUS MD*\n👤 @' + num(target) + '\n\n💙 Powered by NEXUS MD', mentions: [target] }, { quoted: m })
      } catch { await reply(nexusHint('No profile picture (or it is private).')) }
    } }
]

// ───────────── data used by the new commands ─────────────
const UNIT_ALIASES = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  centimeter: 'cm', centimeters: 'cm', millimeter: 'mm', millimeters: 'mm', mile: 'mi', miles: 'mi', yard: 'yd', yards: 'yd',
  foot: 'ft', feet: 'ft', inch: 'in', inches: 'in', kilogram: 'kg', kilograms: 'kg', kgs: 'kg', gram: 'g', grams: 'g',
  pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', tonne: 'tn', tonnes: 'tn', liter: 'l', liters: 'l',
  litre: 'l', litres: 'l', milliliter: 'ml', milliliters: 'ml', gallon: 'gal', gallons: 'gal',
  celsius: 'c', fahrenheit: 'f', kelvin: 'k',
}
const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  mass: { kg: 1000, g: 1, mg: 0.001, lb: 453.592, oz: 28.3495, tn: 1e6 },
  volume: { l: 1, ml: 0.001, gal: 3.78541, cup: 0.236588 },
}
const normUnit = (u) => { const x = u.replace('°', ''); return UNIT_ALIASES[x] || x }
const toTemp = (v, from, to) => {
  const c = from === 'c' ? v : from === 'f' ? (v - 32) * 5 / 9 : v - 273.15
  return to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15
}

const COINS = { btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', bnb: 'binancecoin', sol: 'solana', xrp: 'ripple', doge: 'dogecoin',
  ada: 'cardano', ltc: 'litecoin', trx: 'tron', ton: 'the-open-network', matic: 'matic-network', dot: 'polkadot', shib: 'shiba-inu' }

const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..',
  m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--',
  z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' }
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
const toRoman = (n) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v } return s }
const fromRoman = (s) => {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  for (let i = 0; i < s.length; i++) { const a = val[s[i]], b = val[s[i + 1]] || 0; total += a < b ? -a : a }
  return total
}

const SIGNS = [[1, 20, 'Aquarius ♒'], [2, 19, 'Pisces ♓'], [3, 21, 'Aries ♈'], [4, 20, 'Taurus ♉'], [5, 21, 'Gemini ♊'], [6, 21, 'Cancer ♋'],
  [7, 23, 'Leo ♌'], [8, 23, 'Virgo ♍'], [9, 23, 'Libra ♎'], [10, 23, 'Scorpio ♏'], [11, 22, 'Sagittarius ♐'], [12, 22, 'Capricorn ♑']]
function zodiac(month, day) {
  let sign = 'Capricorn ♑'
  for (const [m, d, name] of SIGNS) if (month > m || (month === m && day >= d)) sign = name
  return sign
}

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur'.split(' ')
const TTS_LANGS = ['en', 'sw', 'fr', 'es', 'de', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'ru', 'tr', 'nl', 'id', 'zh-CN']
const reminders = new Set()

// ───────────── new commands ─────────────
const extra = [
  // ===== Money & Kenya =====
  C('currency', 'Convert money, e.g. .currency 100 usd kes', async (ctx) => {
    const parts = input(ctx).toLowerCase().split(/\s+/).filter((p) => p && p !== 'to' && p !== 'in')
    const amtTok = parts.find((p) => /^[\d.,]+$/.test(p))
    const amount = amtTok ? parseFloat(amtTok.replace(/,/g, '')) : 1
    const codes = parts.filter((p) => /^[a-z]{3}$/.test(p)).map((p) => p.toUpperCase())
    if (!codes.length || !Number.isFinite(amount)) return use(ctx, 'currency 100 usd kes')
    const from = codes[0]
    const to = codes[1] || (from === 'KES' ? 'USD' : 'KES')
    const r = await get(`https://open.er-api.com/v6/latest/${from}`)
    const rate = r.data?.rates?.[to]
    if (r.data?.result !== 'success' || !rate) return ctx.reply(nexusHint('Unknown currency code. Example: usd, kes, eur, gbp'))
    await ctx.reply(nexusBox('💱 *CURRENCY*', [
      `${fmt(amount)} ${from} = *${fmt(amount * rate)} ${to}*`,
      `Rate: 1 ${from} = ${fmt(rate, 4)} ${to}`,
      `Updated: ${String(r.data.time_last_update_utc || '').slice(0, 16)}`,
    ]))
  }, ['fx', 'forex', 'rate']),

  C('crypto', 'Crypto price, e.g. .crypto btc', async (ctx) => {
    const q = input(ctx).toLowerCase()
    if (!q) return use(ctx, 'crypto btc')
    const id = COINS[q] || q
    const r = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,kes&include_24hr_change=true`)
    const d = r.data?.[id]
    if (!d) return ctx.reply(nexusHint('Coin not found. Try btc, eth, sol, or the full name like bitcoin.'))
    const ch = d.usd_24h_change
    await ctx.reply(nexusBox('🪙 *CRYPTO*', [
      `*${id}*`, `USD: $${fmt(d.usd, 6)}`, `KES: KSh ${fmt(d.kes)}`,
      ch != null ? `24h: ${ch >= 0 ? '🟢 +' : '🔴 '}${fmt(ch)}%` : '',
    ].filter(Boolean)))
  }, ['coin']),

  C('vat', 'Kenya VAT calculator, e.g. .vat 1000 (default 16%)', async (ctx) => {
    const [a, r] = input(ctx).split(/\s+/).map(parseFloat)
    if (!Number.isFinite(a)) return use(ctx, 'vat 1000   (or: vat 1000 16)')
    const rate = Number.isFinite(r) ? r : 16
    const vatOn = a * rate / 100
    const net = a / (1 + rate / 100)
    await ctx.reply(nexusBox('🧾 *VAT ' + rate + '%*', [
      `If ${fmt(a)} is WITHOUT VAT:`, `  VAT: ${fmt(vatOn)}`, `  Total: *${fmt(a + vatOn)}*`, '',
      `If ${fmt(a)} INCLUDES VAT:`, `  Price before VAT: ${fmt(net)}`, `  VAT: ${fmt(a - net)}`,
    ]))
  }),

  C('loan', 'Loan payment, e.g. .loan 100000 12 24 (amount, yearly %, months)', async (ctx) => {
    const [p, rate, n] = input(ctx).split(/\s+/).map(parseFloat)
    if (![p, rate, n].every(Number.isFinite) || p <= 0 || n <= 0) return use(ctx, 'loan 100000 12 24   (amount, yearly interest %, months)')
    const r = rate / 12 / 100
    const pay = r === 0 ? p / n : (p * r) / (1 - Math.pow(1 + r, -n))
    await ctx.reply(nexusBox('🏦 *LOAN*', [
      `Amount: ${fmt(p)}`, `Interest: ${fmt(rate)}% a year`, `Months: ${n}`, '',
      `Monthly payment: *${fmt(pay)}*`, `Total paid: ${fmt(pay * n)}`, `Total interest: ${fmt(pay * n - p)}`,
      '', '_Reducing balance estimate. Your lender may add fees._',
    ]))
  }),

  C('splitbill', 'Split a bill, e.g. .splitbill 3600 4 10 (amount, people, tip %)', async (ctx) => {
    const [amt, ppl, tip = 0] = input(ctx).split(/\s+/).map(parseFloat)
    if (!Number.isFinite(amt) || !Number.isFinite(ppl) || ppl < 1) return use(ctx, 'splitbill 3600 4 10')
    const total = amt * (1 + (Number.isFinite(tip) ? tip : 0) / 100)
    await ctx.reply(nexusBox('🍽️ *SPLIT BILL*', [`Bill: ${fmt(amt)}`, `Tip: ${Number.isFinite(tip) ? tip : 0}%`, `Total: ${fmt(total)}`, `People: ${ppl}`, `Each pays: *${fmt(total / ppl)}*`]))
  }, ['split']),

  C('discount', 'Discount calculator, e.g. .discount 2000 15', async (ctx) => {
    const [price, pct] = input(ctx).split(/\s+/).map(parseFloat)
    if (!Number.isFinite(price) || !Number.isFinite(pct)) return use(ctx, 'discount 2000 15   (price, percent off)')
    await ctx.reply(nexusBox('🏷️ *DISCOUNT*', [`Price: ${fmt(price)}`, `Discount: ${pct}%`, `You save: ${fmt(price * pct / 100)}`, `Final price: *${fmt(price * (1 - pct / 100))}*`]))
  }),

  C('percent', 'Percent calculator, e.g. .percent 15 of 2400', async (ctx) => {
    const t = input(ctx).replace(/%/g, '')
    let m = t.match(/^([\d.]+)\s+of\s+([\d.]+)$/i)
    if (m) return ctx.reply(nexusBox('➗ *PERCENT*', [`${m[1]}% of ${fmt(m[2])} = *${fmt(m[1] * m[2] / 100)}*`]))
    m = t.match(/^([\d.]+)\s*\/\s*([\d.]+)$/)
    if (m && parseFloat(m[2]) !== 0) return ctx.reply(nexusBox('➗ *PERCENT*', [`${m[1]} is *${fmt(m[1] / m[2] * 100)}%* of ${m[2]}`]))
    return use(ctx, 'percent 15 of 2400   (or: percent 50/200)')
  }),

  C('convert', 'Convert units, e.g. .convert 10 km to mi', async (ctx) => {
    const m = input(ctx).toLowerCase().match(/^(-?[\d.]+)\s*([a-z°]+)\s+(?:to\s+)?([a-z°]+)$/)
    if (!m) return use(ctx, 'convert 10 km to mi   (length, weight, volume, temperature c/f/k)')
    const v = parseFloat(m[1]); const a = normUnit(m[2]); const b = normUnit(m[3])
    let out
    if (['c', 'f', 'k'].includes(a) && ['c', 'f', 'k'].includes(b)) out = toTemp(v, a, b)
    else {
      const group = Object.values(UNITS).find((g) => a in g && b in g)
      if (!group) return ctx.reply(nexusHint('Units not supported or not the same kind. Try km, mi, m, ft, kg, lb, l, gal, c, f.'))
      out = v * group[a] / group[b]
    }
    await ctx.reply(nexusBox('📏 *CONVERT*', [`${fmt(v, 6)} ${a} = *${fmt(out, 6)} ${b}*`]))
  }, ['unit']),

  // ===== Kenya & world info =====
  C('prayer', 'Prayer times, e.g. .prayer Mombasa (or .prayer London UK)', async (ctx) => {
    const [city = 'Nairobi', ...rest] = input(ctx).split(/\s+/).filter(Boolean)
    const country = rest.join(' ') || 'Kenya'
    const r = await get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`)
    const tm = r.data?.data?.timings
    if (!tm) return ctx.reply(nexusHint('City not found.'))
    await ctx.reply(nexusBox('🕌 *PRAYER TIMES*', [`${city}, ${country}`, r.data.data.date?.readable || '', '',
      `Fajr: ${tm.Fajr}`, `Sunrise: ${tm.Sunrise}`, `Dhuhr: ${tm.Dhuhr}`, `Asr: ${tm.Asr}`, `Maghrib: ${tm.Maghrib}`, `Isha: ${tm.Isha}`]))
  }, ['salah']),

  C('holidays', 'Public holidays, e.g. .holidays KE (country code)', async (ctx) => {
    const cc = (input(ctx).split(/\s+/)[0] || 'KE').toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) return use(ctx, 'holidays KE')
    const year = new Date().getFullYear()
    const today = new Date().toISOString().slice(0, 10)
    let list = (await get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`)).data || []
    list = list.filter((h) => h.date >= today)
    if (list.length < 5) {
      try { list = list.concat((await get(`https://date.nager.at/api/v3/PublicHolidays/${year + 1}/${cc}`)).data || []) } catch {}
    }
    if (!list.length) return ctx.reply(nexusHint('No holidays found for that country code.'))
    await ctx.reply(nexusBox(`📅 *HOLIDAYS ${cc}*`, list.slice(0, 8).map((h) => `${h.date}  ${h.name}`)))
  }, ['holiday']),

  C('country', 'Country info, e.g. .country Kenya', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'country Kenya')
    const r = await get(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=name,capital,region,population,area,languages,currencies,flags,cca2`)
    const list = r.data || []
    const c = list.find((x) => x.name?.common?.toLowerCase() === q.toLowerCase()) || list[0]
    if (!c) return ctx.reply(nexusHint('Country not found.'))
    const cur = Object.values(c.currencies || {}).map((x) => `${x.name} (${x.symbol || ''})`).join(', ')
    await card(ctx, c.flags?.png, nexusBox(`🌍 *${c.name.common.toUpperCase()}*`, [
      `Official: ${c.name.official}`, `Capital: ${(c.capital || []).join(', ') || '-'}`, `Region: ${c.region}`,
      `Population: ${fmt(c.population, 0)}`, `Area: ${fmt(c.area, 0)} km²`,
      `Languages: ${Object.values(c.languages || {}).join(', ') || '-'}`, `Currency: ${cur || '-'}`, `Code: ${c.cca2}`,
    ]))
  }),

  C('bible', 'Bible verse, e.g. .bible John 3:16', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'bible John 3:16')
    const r = await get(`https://bible-api.com/${encodeURIComponent(q)}`)
    if (!r.data?.text) return ctx.reply(nexusHint('Verse not found. Example: John 3:16'))
    await ctx.reply(nexusBox('📖 *BIBLE*', [`*${r.data.reference}*`, '', r.data.text.trim().slice(0, 1500), '', `_${r.data.translation_name || ''}_`]))
  }, ['verse']),

  C('quran', 'Quran verse, e.g. .quran 2:255', async (ctx) => {
    const ref = input(ctx).replace(/\s+/g, '')
    if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return use(ctx, 'quran 2:255   (surah:verse)')
    const r = await get(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,en.asad`)
    const [ar, en] = r.data?.data || []
    if (!ar) return ctx.reply(nexusHint('Verse not found.'))
    await ctx.reply(nexusBox('🌙 *QURAN*', [`*${ar.surah?.englishName} ${ar.surah?.number}:${ar.numberInSurah}*`, '', ar.text, '', (en?.text || '').slice(0, 1200)]))
  }, ['ayah']),

  // ===== Entertainment & lookup =====
  C('series', 'TV show info, e.g. .series Money Heist', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'series Money Heist')
    const r = await get(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(q)}`)
    const s = r.data
    await card(ctx, s.image?.original || s.image?.medium, nexusBox(`📺 *${s.name.toUpperCase()}*`, [
      `Genres: ${(s.genres || []).join(', ') || '-'}`, `Rating: ${s.rating?.average ?? '-'}`, `Status: ${s.status}`,
      `Premiered: ${s.premiered || '-'}`, `Network: ${s.network?.name || s.webChannel?.name || '-'}`, '', strip(s.summary).slice(0, 700),
    ]))
  }, ['tvshow']),

  C('anime', 'Anime info, e.g. .anime Naruto', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'anime Naruto')
    const r = await get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=1&sfw=true`)
    const a = r.data?.data?.[0]
    if (!a) return ctx.reply(nexusHint('Anime not found.'))
    await card(ctx, a.images?.jpg?.image_url, nexusBox(`🎌 *${(a.title_english || a.title).toUpperCase()}*`, [
      `Score: ${a.score ?? '-'}`, `Episodes: ${a.episodes ?? '-'}`, `Status: ${a.status}`, `Year: ${a.year ?? '-'}`,
      `Genres: ${(a.genres || []).map((g) => g.name).join(', ') || '-'}`, '', (a.synopsis || '').slice(0, 600), '', a.url,
    ]))
  }),

  C('pokemon', 'Pokémon info, e.g. .pokemon pikachu', async (ctx) => {
    const q = input(ctx).toLowerCase().replace(/\s+/g, '-')
    if (!q) return use(ctx, 'pokemon pikachu')
    let p
    try { p = (await get(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(q)}`)).data } catch { return ctx.reply(nexusHint('Pokémon not found.')) }
    const stat = (n) => p.stats.find((s) => s.stat.name === n)?.base_stat
    await card(ctx, p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default, nexusBox(`🎮 *${p.name.toUpperCase()} #${p.id}*`, [
      `Type: ${p.types.map((t) => t.type.name).join(', ')}`, `Height: ${p.height / 10} m`, `Weight: ${p.weight / 10} kg`,
      `Abilities: ${p.abilities.map((a) => a.ability.name).join(', ')}`,
      `HP ${stat('hp')} | ATK ${stat('attack')} | DEF ${stat('defense')} | SPD ${stat('speed')}`,
    ]))
  }),

  C('meal', 'Recipe from a dish name, e.g. .meal chicken', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'meal chicken')
    const r = await get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`)
    const x = r.data?.meals?.[0]
    if (!x) return ctx.reply(nexusHint('No recipe found. Try a simpler word like chicken, beef, rice.'))
    const ing = []
    for (let i = 1; i <= 20; i++) if (x['strIngredient' + i]) ing.push(`${(x['strMeasure' + i] || '').trim()} ${x['strIngredient' + i]}`.trim())
    await card(ctx, x.strMealThumb, nexusBox(`🍲 *${x.strMeal.toUpperCase()}*`, [
      `${x.strCategory} • ${x.strArea}`, '', '*Ingredients*', ...ing.map((i) => '• ' + i), '', '*Method*', (x.strInstructions || '').slice(0, 1200),
    ]))
  }),

  C('book', 'Search books, e.g. .book Things Fall Apart', async (ctx) => {
    const q = input(ctx)
    if (!q) return use(ctx, 'book Things Fall Apart')
    const r = await get(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=title,author_name,first_publish_year`)
    const docs = r.data?.docs || []
    if (!docs.length) return ctx.reply(nexusHint('No books found.'))
    await ctx.reply(nexusBox('📚 *BOOKS*', docs.map((d, i) => `${i + 1}. *${d.title}* — ${(d.author_name || ['Unknown']).slice(0, 2).join(', ')} (${d.first_publish_year || '?'})`)))
  }, ['books']),

  // ===== Developer & web tools =====
  C('github', 'GitHub profile, e.g. .github torvalds', async (ctx) => {
    const u = input(ctx).split(/\s+/)[0]
    if (!u) return use(ctx, 'github torvalds')
    let d
    try { d = (await get(`https://api.github.com/users/${encodeURIComponent(u)}`)).data } catch { return ctx.reply(nexusHint('User not found (or GitHub limit reached, try later).')) }
    await card(ctx, d.avatar_url, nexusBox('🐙 *GITHUB*', [
      `*${d.name || d.login}* (@${d.login})`, d.bio ? `Bio: ${d.bio}` : '', `Repos: ${d.public_repos}`, `Followers: ${d.followers} | Following: ${d.following}`,
      d.location ? `Location: ${d.location}` : '', d.company ? `Company: ${d.company}` : '', `Joined: ${String(d.created_at).slice(0, 10)}`, d.html_url,
    ].filter(Boolean)))
  }, ['githubstalk', 'gh']),

  C('npm', 'NPM package info, e.g. .npm axios', async (ctx) => {
    const p = input(ctx).split(/\s+/)[0]
    if (!p) return use(ctx, 'npm axios')
    const [info, dl] = await Promise.allSettled([
      get(`https://registry.npmjs.org/${encodeURIComponent(p).replace('%40', '@')}/latest`),
      get(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(p).replace('%40', '@')}`),
    ])
    if (info.status !== 'fulfilled') return ctx.reply(nexusHint('Package not found.'))
    const d = info.value.data
    await ctx.reply(nexusBox('📦 *NPM*', [`*${d.name}* v${d.version}`, d.description || '', `License: ${d.license || '-'}`,
      dl.status === 'fulfilled' ? `Downloads last week: ${fmt(dl.value.data.downloads, 0)}` : '', `https://www.npmjs.com/package/${d.name}`].filter(Boolean)))
  }),

  C('ip', 'IP or domain lookup, e.g. .ip 8.8.8.8', async (ctx) => {
    const q = input(ctx).split(/\s+/)[0]
    if (!q || !/^[\w.:-]+$/.test(q)) return use(ctx, 'ip 8.8.8.8')
    const d = (await get(`https://ipwho.is/${encodeURIComponent(q)}`)).data
    if (!d?.success) return ctx.reply(nexusHint('Could not find that IP or domain.'))
    await ctx.reply(nexusBox('🌐 *IP LOOKUP*', [`IP: ${d.ip}`, `Country: ${d.country} ${d.flag?.emoji || ''}`, `Region: ${d.region}`, `City: ${d.city}`,
      `ISP: ${d.connection?.isp || '-'}`, `Timezone: ${d.timezone?.id || '-'}`, `Map: https://maps.google.com/?q=${d.latitude},${d.longitude}`]))
  }),

  C('dns', 'DNS records, e.g. .dns google.com MX', async (ctx) => {
    const [d, type = 'A'] = input(ctx).split(/\s+/)
    if (!d || !/^[\w.-]+$/.test(d)) return use(ctx, 'dns google.com   (types: A AAAA MX TXT NS CNAME)')
    const t = type.toUpperCase()
    if (!['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'].includes(t)) return use(ctx, 'dns google.com MX')
    const r = await get(`https://dns.google/resolve?name=${encodeURIComponent(d)}&type=${t}`)
    const ans = r.data?.Answer || []
    if (!ans.length) return ctx.reply(nexusHint('No records found.'))
    await ctx.reply(nexusBox(`🧭 *DNS ${t}*`, [d, '', ...ans.slice(0, 10).map((a) => String(a.data).slice(0, 200))]))
  }),

  C('isup', 'Check if a website is up, e.g. .isup google.com', async (ctx) => {
    const raw = input(ctx).split(/\s+/)[0]
    if (!raw) return use(ctx, 'isup google.com')
    const url = withHttp(raw)
    if (blocked(url)) return ctx.reply(nexusHint('That address is not allowed.'))
    const t0 = Date.now()
    try {
      const r = await get(url, { validateStatus: () => true, maxRedirects: 5, timeout: 10000, responseType: 'stream' })
      r.data.destroy()
      await ctx.reply(nexusBox('📡 *SITE CHECK*', [url, r.status < 500 ? '🟢 Status: UP' : '🔴 Status: SERVER ERROR', `HTTP code: ${r.status}`, `Response: ${Date.now() - t0} ms`]))
    } catch (e) {
      await ctx.reply(nexusBox('📡 *SITE CHECK*', [url, '🔴 Status: DOWN or unreachable']))
    }
  }, ['checksite']),

  C('unshorten', 'Reveal where a short link goes', async (ctx) => {
    const raw = input(ctx).split(/\s+/)[0]
    if (!raw) return use(ctx, 'unshorten https://bit.ly/xxxx')
    const url = withHttp(raw)
    if (blocked(url)) return ctx.reply(nexusHint('That address is not allowed.'))
    const r = await get(url, { maxRedirects: 10, validateStatus: () => true, timeout: 10000, responseType: 'stream' })
    const final = r.request?.res?.responseUrl || url
    r.data.destroy()
    await ctx.reply(nexusBox('🔓 *LINK REVEALED*', [`Short: ${url}`, `Goes to: ${final}`]))
  }, ['expandurl']),

  C('domaininfo', 'Domain registration info, e.g. .domaininfo example.com', async (ctx) => {
    const d = input(ctx).split(/\s+/)[0]?.toLowerCase()
    if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return use(ctx, 'domaininfo example.com')
    let r
    try { r = (await get(`https://rdap.org/domain/${encodeURIComponent(d)}`)).data } catch { return ctx.reply(nexusHint('No public registration info for that domain.')) }
    const ev = Object.fromEntries((r.events || []).map((e) => [e.eventAction, e.eventDate]))
    const registrar = (r.entities || []).find((e) => (e.roles || []).includes('registrar'))?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3]
    await ctx.reply(nexusBox('🌎 *DOMAIN INFO*', [d, `Registrar: ${registrar || '-'}`, `Registered: ${String(ev.registration || '-').slice(0, 10)}`,
      `Expires: ${String(ev.expiration || '-').slice(0, 10)}`, `Nameservers: ${(r.nameservers || []).map((n) => n.ldhName).slice(0, 4).join(', ') || '-'}`]))
  }),

  C('wame', 'Make a WhatsApp chat link, e.g. .wame 0712345678 hello', async (ctx) => {
    const [numTok, ...msg] = input(ctx).split(/\s+/)
    let n = String(numTok || '').replace(/\D/g, '')
    if (n.startsWith('0') && n.length === 10) n = '254' + n.slice(1)
    if (n.length < 9) return use(ctx, 'wame 0712345678 hello there')
    const text = msg.join(' ')
    await ctx.reply(nexusBox('💬 *WHATSAPP LINK*', [`https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`]))
  }, ['walink']),

  C('json', 'Pretty-print JSON (type it or reply to it)', async (ctx) => {
    const t = input(ctx)
    if (!t) return use(ctx, 'json {"a":1,"b":[2,3]}')
    try { await ctx.reply('```' + JSON.stringify(JSON.parse(t), null, 2).slice(0, 3500) + '```') } catch (e) { await ctx.reply(nexusHint('Invalid JSON: ' + e.message)) }
  }),

  C('hash', 'Hash text, e.g. .hash sha256 hello', async (ctx) => {
    const words = input(ctx).split(/\s+/)
    const algos = ['md5', 'sha1', 'sha256', 'sha512']
    const algo = algos.includes((words[0] || '').toLowerCase()) ? words.shift().toLowerCase() : 'sha256'
    const text = words.join(' ')
    if (!text) return use(ctx, 'hash sha256 hello   (md5, sha1, sha256, sha512)')
    await ctx.reply(nexusBox('#️⃣ *HASH*', [`Type: ${algo}`, crypto.createHash(algo).update(text).digest('hex')]))
  }),

  C('password', 'Strong password, e.g. .password 16', async (ctx) => {
    const n = Math.min(64, Math.max(8, parseInt(input(ctx)) || 16))
    const set = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?'
    let pw = ''
    for (let i = 0; i < n; i++) pw += set[crypto.randomInt(set.length)]
    await ctx.reply(nexusBox('🔐 *PASSWORD*', ['```' + pw + '```', `Length: ${n}`, '_Made on the bot, not saved. Use it in a private chat._']))
  }, ['genpass']),

  C('uuid', 'Generate a unique ID', async (ctx) => { await ctx.reply(nexusBox('🆔 *UUID*', [crypto.randomUUID()])) }),

  C('random', 'Random number, e.g. .random 1 100', async (ctx) => {
    let [a, b] = input(ctx).split(/\s+/).map(parseInt)
    if (!Number.isFinite(a)) { a = 1; b = 100 } else if (!Number.isFinite(b)) { b = a; a = 1 }
    if (a > b) [a, b] = [b, a]
    await ctx.reply(nexusBox('🎲 *RANDOM*', [`Between ${a} and ${b}: *${crypto.randomInt(a, b + 1)}*`]))
  }, ['rand']),

  C('color', 'Color info, e.g. .color #ff8800 or .color 255 136 0', async (ctx) => {
    const t = input(ctx).replace('#', '').trim()
    let r, g, b
    const hex = t.match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16)
    } else {
      const n = t.split(/[\s,]+/).map(Number)
      if (n.length !== 3 || n.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return use(ctx, 'color #ff8800   (or: color 255 136 0)')
      ;[r, g, b] = n
    }
    const rr = r / 255, gg = g / 255, bb = b / 255
    const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), l = (mx + mn) / 2, d = mx - mn
    let h = 0, s = 0
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1))
      h = mx === rr ? ((gg - bb) / d) % 6 : mx === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
      h = Math.round(h * 60); if (h < 0) h += 360
    }
    const hx = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
    await ctx.reply(nexusBox('🎨 *COLOR*', [`HEX: ${hx}`, `RGB: ${r}, ${g}, ${b}`, `HSL: ${h}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`]))
  }, ['colour']),

  C('lorem', 'Dummy text, e.g. .lorem 2 (paragraphs)', async (ctx) => {
    const n = Math.min(5, Math.max(1, parseInt(input(ctx)) || 1))
    const para = () => { const w = []; for (let i = 0; i < 45; i++) w.push(LOREM[crypto.randomInt(LOREM.length)]); const s = w.join(' '); return s[0].toUpperCase() + s.slice(1) + '.' }
    await ctx.reply(Array.from({ length: n }, para).join('\n\n'))
  }),

  // ===== Text tools =====
  C('base64', 'Encode text to Base64', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'base64 hello')
    await ctx.reply(nexusBox('🔤 *BASE64*', [Buffer.from(t).toString('base64')]))
  }, ['b64']),
  C('unbase64', 'Decode Base64 text', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'unbase64 aGVsbG8=')
    await ctx.reply(nexusBox('🔤 *DECODED*', [Buffer.from(t, 'base64').toString('utf8')]))
  }, ['b64d']),
  C('binary', 'Text to binary', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'binary hello')
    await ctx.reply(nexusBox('💾 *BINARY*', [Array.from(Buffer.from(t)).map((b) => b.toString(2).padStart(8, '0')).join(' ').slice(0, 3500)]))
  }),
  C('unbinary', 'Binary to text', async (ctx) => {
    const t = input(ctx).replace(/[^01\s]/g, '').trim(); if (!t) return use(ctx, 'unbinary 01101000 01101001')
    await ctx.reply(nexusBox('💾 *TEXT*', [Buffer.from(t.split(/\s+/).map((b) => parseInt(b, 2))).toString('utf8')]))
  }),
  C('urlencode', 'Encode text for a URL', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'urlencode hello world & more')
    await ctx.reply(nexusBox('🔗 *URL ENCODED*', [encodeURIComponent(t)]))
  }),
  C('urldecode', 'Decode a URL-encoded text', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'urldecode hello%20world')
    await ctx.reply(nexusBox('🔗 *URL DECODED*', [decodeURIComponent(t)]))
  }),
  C('morse', 'Text ⇄ Morse code', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'morse sos   (or send morse to decode)')
    if (/^[.\-/\s]+$/.test(t)) return ctx.reply(nexusBox('📡 *MORSE → TEXT*', [t.split('/').map((w) => w.trim().split(/\s+/).map((c) => MORSE_REV[c] || '?').join('')).join(' ')]))
    await ctx.reply(nexusBox('📡 *TEXT → MORSE*', [t.toLowerCase().split('').map((c) => (c === ' ' ? '/' : MORSE[c] || '')).filter(Boolean).join(' ')]))
  }),
  C('roman', 'Number ⇄ Roman numeral', async (ctx) => {
    const t = input(ctx).toUpperCase(); if (!t) return use(ctx, 'roman 1994   (or: roman MCMXCIV)')
    if (/^\d+$/.test(t)) {
      const n = parseInt(t)
      if (n < 1 || n > 3999) return ctx.reply(nexusHint('Use a number from 1 to 3999.'))
      return ctx.reply(nexusBox('🏛️ *ROMAN*', [`${n} = *${toRoman(n)}*`]))
    }
    if (/^[IVXLCDM]+$/.test(t)) return ctx.reply(nexusBox('🏛️ *ROMAN*', [`${t} = *${fromRoman(t)}*`]))
    return use(ctx, 'roman 1994')
  }),
  C('upper', 'MAKE TEXT UPPERCASE', async (ctx) => { const t = input(ctx); if (!t) return use(ctx, 'upper hello'); await ctx.reply(t.toUpperCase()) }, ['uppercase']),
  C('lower', 'make text lowercase', async (ctx) => { const t = input(ctx); if (!t) return use(ctx, 'lower HELLO'); await ctx.reply(t.toLowerCase()) }, ['lowercase']),
  C('title', 'Capitalize Each Word', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'title hello world')
    await ctx.reply(t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))
  }, ['capitalize']),
  C('slug', 'Make a URL-friendly slug', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'slug My First Blog Post!')
    await ctx.reply(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
  }),
  C('count', 'Count characters and words', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'count <text>   (or reply to a message)')
    await ctx.reply(nexusBox('🔢 *COUNT*', [`Characters: ${t.length}`, `Without spaces: ${t.replace(/\s/g, '').length}`,
      `Words: ${t.split(/\s+/).filter(Boolean).length}`, `Lines: ${t.split('\n').length}`, `Sentences: ${(t.match(/[.!?]+(\s|$)/g) || []).length || 1}`]))
  }, ['wordcount']),
  C('palindrome', 'Check if text is a palindrome', async (ctx) => {
    const t = input(ctx); if (!t) return use(ctx, 'palindrome level')
    const s = t.toLowerCase().replace(/[^a-z0-9]/g, '')
    await ctx.reply(nexusBox('🔁 *PALINDROME*', [s && s === [...s].reverse().join('') ? '✅ Yes, it reads the same both ways.' : '❌ No, it is not a palindrome.']))
  }),
  C('say', 'Voice note in a language, e.g. .say sw habari yako', async (ctx) => {
    const words = input(ctx).split(/\s+/)
    const lang = TTS_LANGS.includes(words[0]) ? words.shift() : 'en'
    const text = words.join(' ')
    if (!text) return use(ctx, `say sw habari yako   (languages: ${TTS_LANGS.join(' ')})`)
    const b64 = await tts.getAudioBase64(text.slice(0, 200), { lang, slow: false, timeout: 15000 })
    await ctx.sock.sendMessage(ctx.jid, { audio: Buffer.from(b64, 'base64'), mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.m })
  }, ['speak']),

  // ===== Date & health =====
  C('date', 'Today\'s date, week and day of year', async (ctx) => {
    const now = new Date()
    const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
    const start = new Date(local.getFullYear(), 0, 0)
    const doy = Math.floor((local - start) / 86400000)
    const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const week = Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)
    await ctx.reply(nexusBox('📅 *DATE*', [now.toLocaleDateString('en-GB', { timeZone: TZ, dateStyle: 'full' }), `Day of the year: ${doy}`, `Week: ${week}`, `Zone: ${TZ}`]))
  }, ['today']),

  C('countdown', 'Days until a date, e.g. .countdown 2026-12-25', async (ctx) => {
    const t = input(ctx)
    const d = new Date(t)
    if (!t || isNaN(d)) return use(ctx, 'countdown 2026-12-25')
    const diff = d - new Date()
    const days = Math.floor(Math.abs(diff) / 86400000)
    const hrs = Math.floor((Math.abs(diff) % 86400000) / 3600000)
    await ctx.reply(nexusBox('⏳ *COUNTDOWN*', [`Date: ${t}`, diff >= 0 ? `Time left: *${days} days ${hrs} hours*` : `That date passed *${days} days* ago.`]))
  }),

  C('zodiac', 'Star sign from a birthday, e.g. .zodiac 2000-05-14', async (ctx) => {
    const t = input(ctx)
    let mo, da
    let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) { mo = +m[2]; da = +m[3] } else if ((m = t.match(/^(\d{1,2})[\/.](\d{1,2})/))) { da = +m[1]; mo = +m[2] }
    if (!mo || !da || mo > 12 || da > 31) return use(ctx, 'zodiac 2000-05-14   (or: zodiac 14/05)')
    await ctx.reply(nexusBox('🔮 *ZODIAC*', [`Birthday: ${da}/${mo}`, `Sign: *${zodiac(mo, da)}*`]))
  }, ['starsign']),

  C('bmi', 'BMI calculator, e.g. .bmi 70 175 (kg, cm)', async (ctx) => {
    let [w, h] = input(ctx).replace(/kg|cm|m/gi, ' ').trim().split(/\s+/).map(parseFloat)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return use(ctx, 'bmi 70 175   (weight in kg, height in cm)')
    if (h < 3) h *= 100
    const v = w / Math.pow(h / 100, 2)
    const cat = v < 18.5 ? 'Underweight range' : v < 25 ? 'Healthy range' : v < 30 ? 'Overweight range' : 'Obese range'
    await ctx.reply(nexusBox('⚖️ *BMI*', [`Weight: ${w} kg`, `Height: ${h} cm`, `BMI: *${fmt(v, 1)}*`, `Category: ${cat}`, '', '_BMI is only a rough guide. For health advice talk to a doctor._']))
  }),

  C('remind', 'Reminder, e.g. .remind 10m call mum (s, m, h)', async (ctx) => {
    const mm = input(ctx).match(/^(\d+)\s*(s|m|h)\s+([\s\S]+)$/i)
    if (!mm) return use(ctx, 'remind 10m call mum   (units: s, m, h)')
    const ms = parseInt(mm[1]) * { s: 1000, m: 60000, h: 3600000 }[mm[2].toLowerCase()]
    if (ms < 5000 || ms > 24 * 3600000) return ctx.reply(nexusHint('Choose between 5 seconds and 24 hours.'))
    if (reminders.size >= 200) return ctx.reply(nexusHint('Too many reminders waiting. Try later.'))
    const id = Symbol('r'); reminders.add(id)
    const { sock, jid, sender } = ctx
    setTimeout(async () => {
      reminders.delete(id)
      try { await sock.sendMessage(jid, { text: `⏰ *REMINDER* @${num(sender)}\n${mm[3]}`, mentions: [sender] }) } catch {}
    }, ms)
    await ctx.reply(nexusBox('⏰ *REMINDER SET*', [`In ${mm[1]}${mm[2].toLowerCase()}: ${mm[3]}`, '_If the bot restarts before then, the reminder is lost._']))
  }, ['reminder'])
]

export default [...original, ...extra]
