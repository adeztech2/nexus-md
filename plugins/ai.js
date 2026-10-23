const KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6'
const history = new Map() // chat -> [{role, content}]

export default [
  {
    name: 'ai', aliases: ['ask', 'gpt', 'chat'], category: 'AI', desc: 'Chat with AI (.ai reset to clear)',
    async run({ jid, body, reply }) {
      if (!KEY) return reply('AI is not set up. Add ANTHROPIC_API_KEY in the environment settings.')
      if (!body) return reply('Ask something, e.g. .ai explain how rainbows form')
      if (body.toLowerCase() === 'reset') { history.delete(jid); return reply('🧹 Conversation cleared.') }

      const msgs = [...(history.get(jid) || []), { role: 'user', content: body }].slice(-10)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1000, messages: msgs,
          system: 'You are a helpful WhatsApp assistant. Keep answers short and clear. Plain text only, no markdown headers.'
        })
      })
      const data = await res.json()
      if (!res.ok) return reply('❌ AI error: ' + (data?.error?.message || res.status))
      const out = (data.content || []).map((b) => b.text || '').join('').trim() || 'No answer.'
      history.set(jid, [...msgs, { role: 'assistant', content: out }].slice(-10))
      await reply(out.slice(0, 4000))
    }
  }
]
