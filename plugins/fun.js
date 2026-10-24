import axios from 'axios'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'

const F = { category: 'Fun' }
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5)
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const bar = (pct) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))

const BALL = ['Yes ✅', 'No ❌', 'Maybe 🤔', 'Definitely 💯', 'Ask again later ⏳', 'Very unlikely 😬', 'Without a doubt 🔥']
const TRUTH = ['What is your biggest fear?', 'What is the last lie you told?', 'Who was your first crush?', 'What is your most embarrassing moment?', 'What is one habit you wish you could drop?']
const DARE = ['Send a voice note singing your favourite song.', 'Change your status to "I love pineapple pizza" for 1 hour.', 'Text your best friend "I miss you" right now.', 'Do 10 pushups and send proof.', 'Speak only in emojis for the next 10 minutes.']
const RIDDLES = [
  ['What has keys but cannot open locks?', 'A piano (or a keyboard)'],
  ['What gets wetter the more it dries?', 'A towel'],
  ['I speak without a mouth and hear without ears. What am I?', 'An echo'],
  ['What has hands but cannot clap?', 'A clock'],
  ['The more you take, the more you leave behind. What am I?', 'Footsteps'],
  ['What can travel around the world while staying in a corner?', 'A stamp'],
  ['What has a head and a tail but no body?', 'A coin'],
  ['What goes up but never comes down?', 'Your age'],
  ['What has many teeth but cannot bite?', 'A comb'],
  ['What building has the most stories?', 'A library'],
]
const COMPLIMENTS = [
  'You make hard things look easy.', 'Your energy makes any room better.', 'You are the kind of person people are glad to know.',
  'Your ideas are sharper than you think.', 'You bring out the best in the people around you.', 'You are doing better than you give yourself credit for.',
  'Your smile is contagious.', 'You are a great friend.',
]
const PICKUP = [
  'Are you Wi-Fi? Because I am feeling a connection.', 'Do you have a map? I keep getting lost in your eyes.',
  'Are you a keyboard? Because you are just my type.', 'Is your name Google? Because you have everything I have been searching for.',
  'Are you a charger? Because I would be lost without you.', 'Do you believe in love at first text?',
]
const WYR = [
  'Would you rather always be 10 minutes late or always be 20 minutes early?', 'Would you rather lose your phone or lose your wallet?',
  'Would you rather speak every language or play every instrument?', 'Would you rather have unlimited data or unlimited airtime?',
  'Would you rather live without music or live without movies?', 'Would you rather be able to fly or be invisible?',
]
const SLOTS = ['🍒', '🍋', '🍉', '⭐', '💎', '7️⃣']
const FONTS = { Bold: [0x1D400, 0x1D41A], Italic: [0x1D468, 0x1D482], 'Sans Bold': [0x1D5D4, 0x1D5EE], Mono: [0x1D670, 0x1D68A] }

// Answer waiting to be revealed by .answer, per chat
const pending = new Map()

function restyle(text, [upper, lower]) {
  return [...text].map((ch) => {
    const c = ch.charCodeAt(0)
    if (c >= 65 && c <= 90) return String.fromCodePoint(upper + c - 65)
    if (c >= 97 && c <= 122) return String.fromCodePoint(lower + c - 97)
    return ch
  }).join('')
}

const netFail = (reply) => reply(nexusHint('Could not reach the service. Try again in a moment.'))

export default [
  // ───── Originals ─────
  { ...F, name: 'joke', desc: 'Random joke',
    async run({ reply }) {
      try {
        const r = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 15000 })
        await reply(nexusBox('😂 *JOKE*', [r.data.setup, '', r.data.punchline]))
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'fact', desc: 'Random fact',
    async run({ reply }) {
      try {
        const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 15000 })
        await reply(nexusBox('💡 *FACT*', [r.data.text]))
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'flip', aliases: ['coin'], desc: 'Flip a coin',
    async run({ reply }) { await reply(nexusBox('🪙 *COIN FLIP*', [pick(['Heads', 'Tails'])])) } },
  { ...F, name: 'dice', aliases: ['roll'], desc: 'Roll a dice',
    async run({ reply }) { await reply(nexusBox('🎲 *DICE*', [`You rolled *${1 + Math.floor(Math.random() * 6)}*`])) } },
  { ...F, name: '8ball', desc: 'Ask the magic 8-ball',
    async run({ body, reply }) {
      if (!body) return reply(nexusHint('Ask a yes/no question.'))
      await reply(nexusBox('🎱 *MAGIC 8-BALL*', [`Q: ${body}`, `A: ${pick(BALL)}`]))
    } },
  { ...F, name: 'truth', desc: 'Random truth question', async run({ reply }) { await reply(nexusBox('🫣 *TRUTH*', [pick(TRUTH)])) } },
  { ...F, name: 'dare', desc: 'Random dare', async run({ reply }) { await reply(nexusBox('😈 *DARE*', [pick(DARE)])) } },

  // ───── Games ─────
  { ...F, name: 'rps', desc: 'Rock paper scissors, e.g. .rps rock',
    async run({ args, reply, prefix }) {
      const map = { r: 'rock', rock: 'rock', p: 'paper', paper: 'paper', s: 'scissors', scissors: 'scissors' }
      const you = map[(args[0] || '').toLowerCase()]
      if (!you) return reply(nexusHint(`Use: ${prefix}rps rock / paper / scissors`))
      const bot = pick(['rock', 'paper', 'scissors'])
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
      const icons = { rock: '🪨', paper: '📄', scissors: '✂️' }
      const result = you === bot ? "It's a draw 🤝" : beats[you] === bot ? 'You win 🎉' : 'I win 😎'
      await reply(nexusBox('🎮 *ROCK PAPER SCISSORS*', [`You: ${icons[you]} ${you}`, `Me: ${icons[bot]} ${bot}`, '', result]))
    } },
  { ...F, name: 'slot', aliases: ['slots'], desc: 'Spin the slot machine',
    async run({ reply }) {
      const s = [pick(SLOTS), pick(SLOTS), pick(SLOTS)]
      const same = new Set(s).size
      const result = same === 1 ? '💰 JACKPOT!' : same === 2 ? '✨ So close, two match!' : 'No luck. Spin again.'
      await reply(nexusBox('🎰 *SLOT MACHINE*', [s.join('  |  '), '', result]))
    } },
  { ...F, name: 'riddle', desc: 'Get a riddle (.answer to reveal)',
    async run({ jid, reply }) {
      const [q, a] = pick(RIDDLES)
      pending.set(jid, { title: 'RIDDLE', answer: a })
      await reply(nexusBox('🧩 *RIDDLE*', [q, '', 'Type .answer to reveal.']))
    } },
  { ...F, name: 'trivia', desc: 'Random trivia question (.answer to reveal)',
    async run({ jid, reply }) {
      try {
        const r = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple&encode=base64', { timeout: 15000 })
        const q = r.data?.results?.[0]
        if (!q) return reply(nexusHint('No question right now. Try again in a few seconds.'))
        const d = (s) => Buffer.from(s, 'base64').toString('utf8')
        const correct = d(q.correct_answer)
        const options = shuffle([...q.incorrect_answers.map(d), correct])
        const letter = 'ABCD'[options.indexOf(correct)]
        pending.set(jid, { title: 'TRIVIA', answer: `${letter}. ${correct}` })
        await reply(nexusBox('🧠 *TRIVIA*', [
          `${d(q.category)} • ${d(q.difficulty)}`, '', d(q.question), '',
          ...options.map((o, i) => `${'ABCD'[i]}. ${o}`), '', 'Type .answer to reveal.',
        ]))
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'answer', aliases: ['reveal'], desc: 'Reveal the answer to the last riddle/trivia',
    async run({ jid, reply }) {
      const p = pending.get(jid)
      if (!p) return reply(nexusHint('Nothing to answer. Try .riddle or .trivia first.'))
      pending.delete(jid)
      await reply(nexusBox(`✅ *${p.title} ANSWER*`, [p.answer]))
    } },
  { ...F, name: 'wyr', aliases: ['wouldyourather'], desc: 'Would you rather question',
    async run({ reply }) { await reply(nexusBox('🤔 *WOULD YOU RATHER*', [pick(WYR)])) } },

  // ───── People & feelings ─────
  { ...F, name: 'choose', aliases: ['pick'], desc: 'Pick one option, e.g. .choose rice | pilau | chips',
    async run({ body, reply, prefix }) {
      const opts = body.split(/\||,|\bor\b/i).map((x) => x.trim()).filter(Boolean)
      if (opts.length < 2) return reply(nexusHint(`Use: ${prefix}choose rice | pilau | chips`))
      await reply(nexusBox('🎯 *DECISION*', [`Options: ${opts.join(', ')}`, `I choose: *${pick(opts)}*`]))
    } },
  { ...F, name: 'rate', desc: 'Rate anything out of 100',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Use: ${prefix}rate my cooking`))
      const pct = Math.floor(Math.random() * 101)
      await reply(nexusBox('⭐ *RATING*', [body, `${bar(pct)} ${pct}%`]))
    } },
  { ...F, name: 'ship', desc: 'Compatibility, e.g. .ship Amina & Brian',
    async run({ body, reply, prefix }) {
      const [a, b] = body.split(/&|\+|\band\b|\|/i).map((x) => x.trim()).filter(Boolean)
      if (!a || !b) return reply(nexusHint(`Use: ${prefix}ship Amina & Brian`))
      const pct = hash([a.toLowerCase(), b.toLowerCase()].sort().join('+')) % 101
      const verdict = pct > 80 ? 'A perfect match 💞' : pct > 50 ? 'Good chemistry 💕' : pct > 25 ? 'Friends first 🙂' : 'Better as friends 😅'
      await reply(nexusBox('💘 *LOVE METER*', [`${a}  ❤️  ${b}`, `${bar(pct)} ${pct}%`, '', verdict]))
    } },
  { ...F, name: 'compliment', desc: 'Send a kind compliment',
    async run({ body, reply }) {
      await reply(nexusBox('🌟 *COMPLIMENT*', [`${body ? body + ': ' : ''}${pick(COMPLIMENTS)}`]))
    } },
  { ...F, name: 'pickup', aliases: ['flirt'], desc: 'A clean pickup line',
    async run({ reply }) { await reply(nexusBox('😉 *PICKUP LINE*', [pick(PICKUP)])) } },
  { ...F, name: 'age', desc: 'Age calculator, e.g. .age 2000-05-14',
    async run({ args, reply, prefix }) {
      const m = (args[0] || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const dob = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      const now = new Date()
      if (!dob || isNaN(dob) || dob > now) return reply(nexusHint(`Use: ${prefix}age 2000-05-14  (year-month-day)`))
      let years = now.getUTCFullYear() - dob.getUTCFullYear()
      let months = now.getUTCMonth() - dob.getUTCMonth()
      let days = now.getUTCDate() - dob.getUTCDate()
      if (days < 0) { months--; days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate() }
      if (months < 0) { years--; months += 12 }
      let next = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()))
      if (next < now) next = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()))
      const left = Math.ceil((next - now) / 86400000)
      await reply(nexusBox('🎂 *AGE*', [`${years} years, ${months} months, ${days} days`, `Next birthday in ${left} days`]))
    } },

  // ───── Text toys ─────
  { ...F, name: 'reverse', desc: 'Reverse a text',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Use: ${prefix}reverse hello`))
      await reply(nexusBox('🔄 *REVERSED*', [[...body].reverse().join('')]))
    } },
  { ...F, name: 'mock', desc: 'sPoNgEbOb text',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Use: ${prefix}mock you are so smart`))
      let i = 0
      const out = [...body].map((c) => (/[a-z]/i.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('')
      await reply(nexusBox('🧽 *MOCK*', [out]))
    } },
  { ...F, name: 'clap', desc: 'Add 👏 between words',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Use: ${prefix}clap well done team`))
      await reply(nexusBox('👏 *CLAP*', [body.split(/\s+/).join(' 👏 ')]))
    } },
  { ...F, name: 'fancy', aliases: ['font'], desc: 'Stylish fonts for your text',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Use: ${prefix}fancy Nexus MD`))
      await reply(nexusBox('🔤 *FANCY TEXT*', Object.entries(FONTS).map(([name, set]) => `${name}: ${restyle(body, set)}`)))
    } },

  // ───── Pictures & jokes ─────
  { ...F, name: 'dadjoke', desc: 'A dad joke',
    async run({ reply }) {
      try {
        const r = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json', 'User-Agent': 'NEXUS MD WhatsApp bot' }, timeout: 15000 })
        await reply(nexusBox('👨 *DAD JOKE*', [r.data.joke]))
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'dog', desc: 'Random dog picture',
    async run({ sock, jid, m, reply }) {
      try {
        const r = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 15000 })
        await sock.sendMessage(jid, { image: { url: r.data.message }, caption: nexusBox('🐶 *DOG*', ['Good boy!']) }, { quoted: m })
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'cat', desc: 'Random cat picture',
    async run({ sock, jid, m, reply }) {
      try {
        const r = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 15000 })
        await sock.sendMessage(jid, { image: { url: r.data[0].url }, caption: nexusBox('🐱 *CAT*', ['Meow!']) }, { quoted: m })
      } catch { await netFail(reply) }
    } },
  { ...F, name: 'meme', desc: 'Random meme',
    async run({ sock, jid, m, reply }) {
      try {
        for (let i = 0; i < 3; i++) {
          const r = await axios.get('https://meme-api.com/gimme', { timeout: 15000 })
          if (r.data.nsfw || r.data.spoiler || !r.data.url) continue
          return await sock.sendMessage(jid, { image: { url: r.data.url }, caption: nexusBox('🤣 *MEME*', [r.data.title || 'Meme']) }, { quoted: m })
        }
        await reply(nexusHint('No meme found. Try again.'))
      } catch { await netFail(reply) }
    } }
]
