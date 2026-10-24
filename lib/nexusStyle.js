// NEXUS MD message style
export const BRAND = {
  name: 'NEXUS MD',
  tagline: 'Your Smart AI Assistant',
  line: '━━━━━━━━━━━━━━━━━━',
  
  footer: '  > POWERED BY ADEZ TECH',
}

const ICONS = {
  AI: '🤖', FUN: '🎉', GENERAL: '⚡', GROUP: '👥', OWNER: '👑',
  TOOLS: '🛠️', DOWNLOAD: '📥', DOWNLOADER: '📥', SEARCH: '🔍', MEDIA: '🎬', GAMES: '🎮',
  AUDIO: '🎧', IMAGE: '🖼️', VIDEO: '🎞️',
}

function safeText(value) {
  return String(value).replace(/[\r\n\t]/g, ' ').replace(/[*_~`]/g, '').slice(0, 60)
}

// commands: array of { name, category, desc }
export function nexusMenu(prefix = '.', commands = []) {
  const groups = {}
  for (const c of commands) {
    const cat = String(c.category || 'GENERAL').toUpperCase()
    ;(groups[cat] ||= []).push(c)
  }

  const out = [
    '╭━━━〔 🔷 *NEXUS MD* 〕━━━╮',
    `┃ _${BRAND.tagline}_`,
    `┃ 🔰 Prefix: [ ${prefix} ]`,
    `┃ 📦 Commands: ${commands.length}`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
  ]

  for (const cat of Object.keys(groups).sort()) {
    out.push(`┏━━〔 ${ICONS[cat] || '🔹'} *${cat}* 〕`)
    // Names only, one per line (no descriptions)
    for (const c of groups[cat]) {
      out.push(`┃ ◈ ${prefix}${c.name}`)
    }
    out.push('┗━━━━━━━━━━━━━━━━━━', '')
  }

  out.push('💠 *FAST • SMART • NEXUS*', BRAND.footer)
  return out.join('\n')
}

// Optional: numbered style with a total per category.
// Use it by calling nexusMenuNumbered(...) instead of nexusMenu(...) where the menu is built.
export function nexusMenuNumbered(prefix = '.', commands = []) {
  const groups = {}
  for (const c of commands) {
    const cat = String(c.category || 'GENERAL').toUpperCase()
    ;(groups[cat] ||= []).push(c)
  }

  const out = [
    '╭━━━〔 🔷 *NEXUS MD* 〕━━━╮',
    `┃ _${BRAND.tagline}_`,
    `┃ 🔰 Prefix: [ ${prefix} ]`,
    `┃ 📦 Commands: ${commands.length}`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
  ]

  for (const cat of Object.keys(groups).sort()) {
    const list = [...groups[cat]].sort((a, b) => a.name.localeCompare(b.name))
    out.push(`╭────「 ${ICONS[cat] || '🔹'} ${cat} 」───┈⊷`)
    list.forEach((c, i) => out.push(`│◦➛ ${i + 1}. ${c.name}`))
    out.push('╰──────────────┈⊷', `🔢 Total: ${list.length} command${list.length === 1 ? '' : 's'}`, '')
  }

  out.push('💠 *FAST • SMART • NEXUS*', BRAND.footer)
  return out.join('\n')
}

export function nexusWelcome(pushName = 'there', prefix = '.') {
  return [
    '🔷 *N E X U S  M D*',
    `_${BRAND.tagline}_`,
    '',
    BRAND.line,
    '',
    `👋 Hello, *${safeText(pushName)}*!`,
    '',
    '🚀 Welcome to your digital assistant.',
    'I am here to make your tasks easier,',
    'faster, and smarter.',
    '',
    `📌 Type *${prefix}menu* to explore commands.`,
    '',
    BRAND.line,
    BRAND.footer,
    '_Your vision. Your technology. Your NEXUS._ 🚀',
  ].join('\n')
}

export function nexusPing(startTime) {
  const elapsed = Math.max(0, Date.now() - startTime)
  return [
    '🔷 *NEXUS MD — SYSTEM STATUS*',
    BRAND.line,
    '🟢 Status: Responding',
    `⏱️ Response time: ${elapsed} ms`,
    BRAND.footer,
  ].join('\n')
}

export function nexusConnected({ number = '', prefix = '.', count = 0 } = {}) {
  const time = new Date().toLocaleString('en-GB', { timeZone: process.env.TIMEZONE || 'UTC', hour12: false })
  return [
    '╭━━━〔 🔷 *NEXUS MD* 〕━━━╮',
    '┃ 🟢 *CONNECTED SUCCESSFULLY*',
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    '┏━━〔 📡 *STATUS* 〕',
    `┃ ◈ Bot: ${BRAND.name}`,
    `┃ ◈ Number: ${safeText(number)}`,
    `┃ ◈ Prefix: [ ${prefix} ]`,
    `┃ ◈ Commands: ${count}`,
    `┃ ◈ Time: ${time}`,
    '┗━━━━━━━━━━━━━━━━━━',
    '',
    `📌 Type *${prefix}menu* to explore commands.`,
    '',
    BRAND.footer,
  ].join('\n')
}

// Generic result box: nexusBox('🌤 *WEATHER*', ['line one', 'line two'])
export function nexusBox(title, lines = []) {
  const body = lines.flatMap((l) => String(l).split('\n')).map((l) => `┃ ${l}`)
  return [`┏━━〔 ${title} 〕`, ...body, '┗━━━━━━━━━━━━━━━━━━', '', BRAND.footer].join('\n')
}

// Short usage or error hint
export function nexusHint(text) {
  return nexusBox('⚠️ *NOTICE*', [text])
}
