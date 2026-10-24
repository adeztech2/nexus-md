import { askAI, hasAI, aiInfo, supportsVision } from '../lib/ai.js'
import { B } from '../lib/baileys.js'
import { unwrap, ctxInfo, getText } from '../lib/utils.js'

const BOT_NAME = process.env.BOT_NAME || 'NEXUS MD'
const SYSTEM = `You are ${BOT_NAME}, a helpful WhatsApp assistant made by Arnold Adez. ` +
  'Keep answers short and clear. Plain text only, no markdown headers.'
const history = new Map() // chat -> [{ role, content: string }] (text only, always user/assistant pairs)

// ---------- helpers ----------
const quotedMsg = ({ content }) => unwrap(ctxInfo(content).quotedMessage)

// Text typed after the command, or the text of the message being replied to
const inputText = (ctx) => ctx.body || getText(quotedMsg(ctx)) || ''

// Find an image in the message itself or in the message it replies to
function findImage({ m, content, jid }) {
  if (content?.imageMessage) return { target: { key: m.key, message: content }, mime: content.imageMessage.mimetype }
  const info = ctxInfo(content)
  const q = unwrap(info.quotedMessage)
  if (!q?.imageMessage) return null
  return {
    target: { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant }, message: q },
    mime: q.imageMessage.mimetype
  }
}

// One-shot AI task (no chat history)
async function task(ctx, system, userContent) {
  if (!hasAI()) { await ctx.reply('🤖 AI is not set up. Add ANTHROPIC_API_KEY or GROQ_API_KEY in Render → Environment.'); return }
  try {
    const out = await askAI(system, [{ role: 'user', content: userContent }], 1200)
    await ctx.reply(out.slice(0, 4000))
  } catch (e) { await ctx.reply('❌ ' + e.message) }
}

// Text tools: reply to a message or type the text after the command
const textTool = (name, desc, usage, system, aliases = []) => ({
  name, aliases, category: 'AI', desc,
  async run(ctx) {
    const text = inputText(ctx)
    if (!text) return ctx.reply(`📝 ${usage}`)
    await task(ctx, system, text)
  }
})

// Image tools (need Claude)
const imageTool = (name, desc, prompt, aliases = []) => ({
  name, aliases, category: 'AI', desc,
  async run(ctx) {
    if (!hasAI()) return task(ctx, '', '')
    if (!supportsVision()) return ctx.reply('🖼 Image tools need ANTHROPIC_API_KEY (Claude).')
    const img = findImage(ctx)
    if (!img) return ctx.reply(`🖼 Send or reply to a picture with *${ctx.prefix}${name}*`)
    const buf = await B.downloadMediaMessage(img.target, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })
    if (buf.length > 4.5 * 1024 * 1024) return ctx.reply('❌ That image is too big. Send a smaller one.')
    await task(ctx, SYSTEM, [
      { type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: buf.toString('base64') } },
      { type: 'text', text: ctx.body ? `${prompt}\nExtra request: ${ctx.body}` : prompt }
    ])
  }
})

// ---------- commands ----------
export default [
  {
    name: 'ai', aliases: ['ask', 'gpt', 'chat'], category: 'AI', desc: 'Chat with AI (.ai reset to clear)',
    async run(ctx) {
      const { sock, jid, body, reply } = ctx
      if (!hasAI()) return reply('🤖 AI is not set up. Add ANTHROPIC_API_KEY or GROQ_API_KEY in Render → Environment.')
      if (body.toLowerCase() === 'reset') { history.delete(jid); return reply('🧹 Conversation cleared.') }

      const img = findImage(ctx)
      if (img && !supportsVision()) return reply('🖼 Image questions need ANTHROPIC_API_KEY (Claude). Send text only.')
      if (!body && !img) return reply('Ask something, e.g. .ai explain how rainbows form\nOr reply to a picture with .ai what is this?')

      const past = (history.get(jid) || []).slice(-8)
      let userContent = body
      if (img) {
        const buf = await B.downloadMediaMessage(img.target, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })
        if (buf.length > 4.5 * 1024 * 1024) return reply('❌ That image is too big. Send a smaller one.')
        userContent = [
          { type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: buf.toString('base64') } },
          { type: 'text', text: body || 'Describe this image.' }
        ]
      }

      try {
        const answer = (await askAI(SYSTEM, [...past, { role: 'user', content: userContent }])).slice(0, 4000)
        history.set(jid, [...past, { role: 'user', content: body || '[image]' }, { role: 'assistant', content: answer }])
        await reply(answer)
      } catch (e) {
        await reply('❌ ' + e.message)
      }
    }
  },

  {
    name: 'translate', aliases: ['tr'], category: 'AI', desc: 'Translate, e.g. .translate swahili hello',
    async run(ctx) {
      const lang = ctx.args[0]
      const text = ctx.args.slice(1).join(' ') || getText(quotedMsg(ctx))
      if (!lang || !text) return ctx.reply('🌍 Use: .translate <language> <text>\nOr reply to a message with .translate <language>')
      await task(ctx, 'You are a translator. Translate the text into the requested language. Reply with the translation only.',
        `Language: ${lang}\n\nText:\n${text}`)
    }
  },

  textTool('summarize', 'Summarize a long text (reply or type)', 'Reply to a long message with .summarize, or type the text after it.',
    'Summarize the text in a few short bullet points using plain dashes. Keep the original language.', ['summary', 'tldr']),

  textTool('grammar', 'Fix spelling and grammar', 'Reply to a message with .grammar, or type the text after it.',
    'Fix the spelling and grammar of the text. Reply with the corrected text only.', ['fix']),

  textTool('explain', 'Explain something in simple words', 'Type what to explain, e.g. .explain blockchain',
    'Explain the topic in very simple words, as if to a 12 year old. Use a short everyday example. Under 120 words.', ['eli5']),

  textTool('rewrite', 'Rewrite a text in better words', 'Reply to a message with .rewrite, or type the text after it.',
    'Rewrite the text so it sounds clear, polite and natural. Keep the meaning and the language. Reply with the rewritten text only.', ['improve']),

  textTool('code', 'Write code, e.g. .code python function to reverse a string', 'Describe the code you want, e.g. .code javascript debounce function',
    'You are a coding assistant. Give working code in a single code block, then at most 3 short lines explaining it. Keep it compact.', ['dev']),

  textTool('poem', 'Write a short poem about anything', 'Type a topic, e.g. .poem the ocean',
    'Write a short, original poem (8 lines max) about the topic. Reply with the poem only.'),

  textTool('quiz', 'Make a 3-question quiz on a topic', 'Type a topic, e.g. .quiz solar system',
    'Create a 3-question multiple choice quiz on the topic. Give options A, B, C, D for each. Put the answers at the end under "Answers:".'),

  imageTool('describe', 'Describe a picture', 'Describe this image clearly in a few sentences.'),
  imageTool('ocr', 'Read the text in a picture', 'Extract all readable text from this image exactly as written. If there is no text, say so.', ['readtext']),
  imageTool('caption', 'Write a caption for a picture', 'Write 3 short, catchy social media captions for this image.'),

  {
    name: 'aiinfo', category: 'AI', desc: 'Show which AI is connected',
    async run({ reply }) {
      const i = aiInfo()
      await reply(i ? `🤖 Provider: ${i.provider}\n🧠 Model: ${i.model}\n🖼 Images: ${supportsVision() ? 'yes' : 'no'}` : '🤖 AI is not set up.')
    }
  }
]
