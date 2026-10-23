export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const num = (jid) => String(jid || '').split('@')[0].split(':')[0]

export function unwrap(msg) {
  let c = msg
  for (let i = 0; i < 5 && c; i++) {
    const inner = c.ephemeralMessage?.message ?? c.viewOnceMessage?.message ??
      c.viewOnceMessageV2?.message ?? c.documentWithCaptionMessage?.message
    if (!inner) break
    c = inner
  }
  return c
}

export const getText = (c) =>
  c?.conversation || c?.extendedTextMessage?.text || c?.imageMessage?.caption ||
  c?.videoMessage?.caption || c?.documentMessage?.caption || ''

export const ctxInfo = (c) =>
  c?.extendedTextMessage?.contextInfo || c?.imageMessage?.contextInfo ||
  c?.videoMessage?.contextInfo || c?.documentMessage?.contextInfo || {}

// Does a group participant entry match this jid? (handles @lid ids too)
export const sameUser = (p, jid) =>
  [p.id, p.lid, p.phoneNumber].filter(Boolean).map(num).includes(num(jid))

// Targets: @mentions, else the replied-to person, else numbers typed in args
export function getTargets({ content, args }) {
  const info = ctxInfo(content)
  if (info.mentionedJid?.length) return info.mentionedJid
  if (info.participant) return [info.participant]
  return args.map((a) => a.replace(/\D/g, '')).filter((n) => n.length >= 8).map((n) => n + '@s.whatsapp.net')
}

export function formatUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}
