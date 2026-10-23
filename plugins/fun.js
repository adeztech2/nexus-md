import axios from 'axios'

const F = { category: 'Fun' }
const pick = (a) => a[Math.floor(Math.random() * a.length)]

const BALL = ['Yes ✅', 'No ❌', 'Maybe 🤔', 'Definitely 💯', 'Ask again later ⏳', 'Very unlikely 😬', 'Without a doubt 🔥']
const TRUTH = ['What is your biggest fear?', 'What is the last lie you told?', 'Who was your first crush?', 'What is your most embarrassing moment?', 'What is one habit you wish you could drop?']
const DARE = ['Send a voice note singing your favourite song.', 'Change your status to "I love pineapple pizza" for 1 hour.', 'Text your best friend "I miss you" right now.', 'Do 10 pushups and send proof.', 'Speak only in emojis for the next 10 minutes.']

export default [
  { ...F, name: 'joke', desc: 'Random joke',
    async run({ reply }) {
      const r = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 15000 })
      await reply(`😂 ${r.data.setup}\n\n${r.data.punchline}`)
    } },
  { ...F, name: 'fact', desc: 'Random fact',
    async run({ reply }) {
      const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 15000 })
      await reply(`💡 ${r.data.text}`)
    } },
  { ...F, name: 'flip', aliases: ['coin'], desc: 'Flip a coin',
    async run({ reply }) { await reply(`🪙 ${pick(['Heads', 'Tails'])}`) } },
  { ...F, name: 'dice', aliases: ['roll'], desc: 'Roll a dice',
    async run({ reply }) { await reply(`🎲 You rolled *${1 + Math.floor(Math.random() * 6)}*`) } },
  { ...F, name: '8ball', desc: 'Ask the magic 8-ball',
    async run({ body, reply }) {
      if (!body) return reply('Ask a yes/no question.')
      await reply(`🎱 ${pick(BALL)}`)
    } },
  { ...F, name: 'truth', desc: 'Random truth question', async run({ reply }) { await reply(`🫣 ${pick(TRUTH)}`) } },
  { ...F, name: 'dare', desc: 'Random dare', async run({ reply }) { await reply(`😈 ${pick(DARE)}`) } }
]
