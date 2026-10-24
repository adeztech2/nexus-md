// Shared AI engine for NEXUS MD.
// Pick ONE provider by setting an environment variable in Render:
//   ANTHROPIC_API_KEY  -> Claude (paid)
//   GROQ_API_KEY       -> Groq (free tier, fast)
//   AI_API_KEY         -> any OpenAI-compatible API (optional AI_BASE_URL)
// Optional: AI_MODEL to choose the model name.

const env = process.env
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function config() {
  if (env.ANTHROPIC_API_KEY) {
    return { type: 'anthropic', name: 'Claude', key: env.ANTHROPIC_API_KEY, model: env.AI_MODEL || 'claude-haiku-5-5' }
  }
  if (env.GROQ_API_KEY) {
    return {
      type: 'openai', name: 'Groq', key: env.GROQ_API_KEY,
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: env.AI_MODEL || 'llama-3.3-70b-versatile',
    }
  }
  if (env.AI_API_KEY) {
    const base = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    return { type: 'openai', name: 'OpenAI-compatible', key: env.AI_API_KEY, url: base + '/chat/completions', model: env.AI_MODEL || 'gpt-4o-mini' }
  }
  return null
}

export const hasAI = () => !!config()
export const supportsVision = () => config()?.type === 'anthropic'
export const aiInfo = () => {
  const c = config()
  return c ? { provider: c.name, model: c.model } : null
}

function friendly(status, msg) {
  const m = String(msg || '')
  if (status === 401 || status === 403) return 'The API key is invalid. Check it in Render → Environment.'
  if (/credit balance|billing|quota|insufficient|exceeded your current/i.test(m)) return 'The AI account has no credit left. Top it up, or use a free GROQ_API_KEY.'
  if (status === 404 || (/model/i.test(m) && /not found|does not exist|not exist/i.test(m))) return 'Model not found. Set AI_MODEL in Render to a valid model name.'
  if (status === 429) return 'Too many requests right now. Wait a moment and try again.'
  if (status >= 500) return 'The AI service is busy. Try again shortly.'
  return m.slice(0, 200) || `Error ${status}`
}

// messages: [{ role: 'user' | 'assistant', content: string }]
// (content can be an array of blocks for images when the provider is Claude)
export async function askAI(system, messages, max = 1000) {
  const c = config()
  if (!c) throw new Error('AI is not set up. Add ANTHROPIC_API_KEY or GROQ_API_KEY in Render → Environment.')

  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let res
      if (c.type === 'anthropic') {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: c.model, max_tokens: max, system, messages }),
          signal: AbortSignal.timeout(45000),
        })
      } else {
        res = await fetch(c.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
          body: JSON.stringify({ model: c.model, max_tokens: max, messages: [{ role: 'system', content: system }, ...messages] }),
          signal: AbortSignal.timeout(45000),
        })
      }

      const raw = await res.text()
      let data = {}
      try { data = JSON.parse(raw) } catch {}

      if (!res.ok) {
        const detail = typeof data?.error === 'string' ? data.error : data?.error?.message
        const err = new Error(friendly(res.status, detail))
        err.retry = [429, 500, 502, 503, 529].includes(res.status)
        throw err
      }

      const text = c.type === 'anthropic'
        ? (data.content || []).map((b) => b.text || '').join('')
        : data.choices?.[0]?.message?.content || ''
      return text.trim() || 'No answer.'
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        lastErr = new Error('The AI took too long. Try again.')
        lastErr.retry = true
      } else if (e.name === 'TypeError') {
        lastErr = new Error('Could not reach the AI service. Check the network and try again.')
        lastErr.retry = true
      } else {
        lastErr = e
      }
      if (!lastErr.retry) break
      await sleep(2000)
    }
  }
  throw lastErr
}
