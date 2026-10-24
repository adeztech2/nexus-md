import { ctxInfo } from '../lib/utils.js'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'

const KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6'
const history = new Map() // chat -> [{role, content}]

const STYLE = 'You are the assistant inside a WhatsApp bot called NEXUS MD. Use plain text. For bold use single asterisks like *this*. No markdown headers, no tables. Keep it clear and not too long.'
const NO_KEY = 'AI is not set up. Add ANTHROPIC_API_KEY in the environment settings.'

// One call to the AI. Returns the answer text or throws an Error with a readable message.
async function askAI(system, messages, max = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || String(res.status))
  return (data.content || []).map((b) => b.text || '').join('').trim() || 'No answer.'
}

// Text of the message being replied to
function quotedText(content) {
  const q = ctxInfo(content).quotedMessage
  return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || ''
}
const textOf = (ctx) => ctx.body || quotedText(ctx.content)

// Builds a one-shot AI command: input(ctx) returns the prompt, or null to show the usage hint
function tool({ name, aliases, desc, icon, title, usage, system, input, max = 1000 }) {
  return {
    name, aliases, category: 'AI', desc,
    async run(ctx) {
      if (!KEY) return ctx.reply(nexusHint(NO_KEY))
      const prompt = input ? input(ctx) : textOf(ctx)
      if (!prompt) return ctx.reply(nexusHint(`Use: ${ctx.prefix}${usage}`))
      try {
        const out = await askAI(`${STYLE} ${system}`, [{ role: 'user', content: prompt }], max)
        await ctx.reply(nexusBox(`${icon} *${title}*`, [out.slice(0, 3500)]))
      } catch (e) {
        await ctx.reply(nexusHint('❌ AI error: ' + e.message))
      }
    }
  }
}

export default [
  // ───── Chat ─────
  {
    name: 'ai', aliases: ['ask', 'gpt', 'chat'], category: 'AI', desc: 'Chat with AI (.ai reset to clear)',
    async run({ jid, body, reply, prefix }) {
      if (!KEY) return reply(nexusHint(NO_KEY))
      if (!body) return reply(nexusHint(`Ask something, e.g. ${prefix}ai explain how rainbows form`))
      if (body.toLowerCase() === 'reset') { history.delete(jid); return reply(nexusBox('🧹 *AI*', ['Conversation cleared.'])) }
      const msgs = [...(history.get(jid) || []), { role: 'user', content: body }].slice(-10)
      try {
        const out = await askAI(`${STYLE} Keep answers short and clear.`, msgs)
        history.set(jid, [...msgs, { role: 'assistant', content: out }].slice(-10))
        await reply(nexusBox('🤖 *NEXUS AI*', [out.slice(0, 3500)]))
      } catch (e) { await reply(nexusHint('❌ AI error: ' + e.message)) }
    }
  },
  {
    name: 'aireset', aliases: ['clearai'], category: 'AI', desc: 'Clear the AI conversation',
    async run({ jid, reply }) { history.delete(jid); await reply(nexusBox('🧹 *AI*', ['Conversation cleared.'])) }
  },

  // ───── Language & writing ─────
  tool({ name: 'translate', aliases: ['tr'], desc: 'Translate text, e.g. .translate french good morning',
    icon: '🌍', title: 'TRANSLATE', usage: 'translate french good morning  (or reply to a message)',
    system: 'Translate the text into the requested language. Reply with the translation only, then on a new line the detected source language in brackets.',
    input: (ctx) => {
      const [lang, ...rest] = ctx.body.split(/\s+/).filter(Boolean)
      const text = rest.join(' ') || quotedText(ctx.content)
      return lang && text ? `Translate into ${lang}:\n\n${text}` : null
    } }),
  tool({ name: 'summarize', aliases: ['sum', 'tldr'], desc: 'Summarize a text (type it or reply to it)',
    icon: '📝', title: 'SUMMARY', usage: 'summarize <text>  (or reply to a message)',
    system: 'Summarize the text in a few short bullet points using the • symbol.', max: 800 }),
  tool({ name: 'fix', aliases: ['grammar', 'correct'], desc: 'Fix spelling and grammar',
    icon: '✅', title: 'CORRECTED TEXT', usage: 'fix <text>  (or reply to a message)',
    system: 'Fix spelling, grammar and punctuation without changing the meaning. Reply with the corrected text only.' }),
  tool({ name: 'rewrite', aliases: ['paraphrase'], desc: 'Rewrite text, e.g. .rewrite formal <text>',
    icon: '✍️', title: 'REWRITTEN', usage: 'rewrite formal <text>  (tones: formal, casual, friendly, short, polite)',
    system: 'Rewrite the text in the requested tone while keeping the meaning. Reply with the rewritten text only.',
    input: (ctx) => {
      const tones = ['formal', 'casual', 'friendly', 'short', 'polite', 'professional']
      const words = ctx.body.split(/\s+/).filter(Boolean)
      const tone = tones.includes((words[0] || '').toLowerCase()) ? words.shift().toLowerCase() : 'clear and polished'
      const text = words.join(' ') || quotedText(ctx.content)
      return text ? `Tone: ${tone}\n\nText:\n${text}` : null
    } }),
  tool({ name: 'explain', aliases: ['whatis'], desc: 'Explain anything simply',
    icon: '💡', title: 'EXPLANATION', usage: 'explain how vaccines work',
    system: 'Explain the topic clearly for a beginner in a few short paragraphs.', max: 1100 }),
  tool({ name: 'eli5', desc: 'Explain like I am 5',
    icon: '🧒', title: 'SIMPLE EXPLANATION', usage: 'eli5 how does the internet work',
    system: 'Explain the topic like the reader is 5 years old, using a simple everyday example. Maximum 6 sentences.', max: 600 }),

  // ───── Writing helpers ─────
  tool({ name: 'email', aliases: ['mail'], desc: 'Write an email from your idea',
    icon: '📧', title: 'EMAIL DRAFT', usage: 'email ask my landlord to fix the tap',
    system: 'Write a short, professional email with a subject line and a greeting and sign-off. Use [Your Name] where a name is needed.', max: 900 }),
  tool({ name: 'caption', desc: 'Social media captions for a topic',
    icon: '📸', title: 'CAPTIONS', usage: 'caption sunset at the beach',
    system: 'Write 5 short catchy social media captions with fitting emojis. Number them 1 to 5.', max: 700 }),
  tool({ name: 'hashtags', aliases: ['tags'], desc: 'Hashtag ideas for a topic',
    icon: '#️⃣', title: 'HASHTAGS', usage: 'hashtags football training',
    system: 'Give 15 relevant hashtags on one line, separated by spaces. No other text.', max: 300 }),
  tool({ name: 'bio', desc: 'Write a short social media bio',
    icon: '👤', title: 'BIO IDEAS', usage: 'bio photographer from Nairobi who loves travel',
    system: 'Write 4 different short bios (under 150 characters each) based on the details. Number them 1 to 4.', max: 500 }),
  tool({ name: 'names', aliases: ['namegen'], desc: 'Name ideas for a business, pet, channel...',
    icon: '🏷️', title: 'NAME IDEAS', usage: 'names a tech store in Mombasa',
    system: 'Suggest 10 creative, memorable names with a few words on why each fits. Number them.', max: 700 }),
  tool({ name: 'ideas', aliases: ['brainstorm'], desc: 'Brainstorm ideas on any topic',
    icon: '🧠', title: 'IDEAS', usage: 'ideas side businesses with a phone only',
    system: 'Give 8 practical, specific ideas. One line each, numbered.', max: 800 }),
  tool({ name: 'poem', desc: 'Write a short poem',
    icon: '🪶', title: 'POEM', usage: 'poem about the rainy season',
    system: 'Write an original poem of 8 to 12 lines on the topic.', max: 500 }),
  tool({ name: 'story', desc: 'Write a short story',
    icon: '📖', title: 'SHORT STORY', usage: 'story a boy who finds a talking bird',
    system: 'Write an original short story of about 250 words with a clear beginning, middle and end.', max: 900 }),

  // ───── Learning & life ─────
  tool({ name: 'code', aliases: ['dev'], desc: 'Write code, e.g. .code python function to reverse a string',
    icon: '💻', title: 'CODE', usage: 'code javascript function to reverse a string',
    system: 'Write working code for the request. You may put the code inside triple backticks. After the code, add one or two lines explaining how to use it.', max: 1500 }),
  tool({ name: 'math', aliases: ['solve'], desc: 'Solve a math problem step by step',
    icon: '🧮', title: 'MATH SOLUTION', usage: 'math 15% of 2400 plus 300',
    system: 'Solve the problem step by step, showing each step briefly, then give the final answer on its own line starting with "Answer:".', max: 900 }),
  tool({ name: 'quiz', desc: 'Make a 5 question quiz on a topic',
    icon: '🎯', title: 'QUIZ', usage: 'quiz photosynthesis',
    system: 'Write 5 multiple choice questions (A to D) on the topic. After all questions, add an "Answers:" line listing the correct letters.', max: 1000 }),
  tool({ name: 'recipe', aliases: ['cook'], desc: 'Get a recipe for a dish or ingredients',
    icon: '🍳', title: 'RECIPE', usage: 'recipe pilau  (or: recipe rice, eggs, tomatoes)',
    system: 'Give a simple recipe: ingredients list, then short numbered steps. If the user lists ingredients, suggest one dish that uses them.', max: 1000 }),
  tool({ name: 'advice', desc: 'Practical advice for a situation',
    icon: '🤝', title: 'ADVICE', usage: 'advice I have two job offers and cannot choose',
    system: 'Give calm, practical, balanced advice in a few short points. If the situation involves health, legal or money risks, remind the user to talk to a qualified professional.', max: 800 }),
  tool({ name: 'motivate', aliases: ['quote'], desc: 'A motivational message',
    icon: '🔥', title: 'MOTIVATION', usage: 'motivate I am tired of studying',
    system: 'Write a short, warm, encouraging message in 3 to 4 sentences. Do not use cliches.', max: 400,
    input: (ctx) => textOf(ctx) || 'Give me a short motivational message for today.' })
]
