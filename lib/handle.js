// Keith-style command registry (ES module version)
export const commands = []

export const evt = {
  events: {},
  on(event, callback) {
    if (!this.events[event]) this.events[event] = []
    this.events[event].push(callback)
  },
  emit(event, data) {
    if (this.events[event]) this.events[event].forEach((callback) => callback(data))
  }
}

const randomEmojis = [
  '😊', '😎', '🔥', '⭐', '💫', '✨', '🌟', '💥', '🚀', '🎯', '💯', '❤️', '💕', '💖', '💝', '🎉', '🎊', '🏆', '👑', '💎',
  '📌', '📍', '🛎️', '🔔', '🎵', '🎶', '📢', '🔊', '👀', '👁️', '🧠', '💡', '🔋', '🔌', '💻', '📱', '⌚', '📷', '🎥', '📹',
  '☀️', '🌙', '🌈', '☁️', '⚡', '💧', '🌊', '🎮', '👾', '🕹️', '🎲', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄',
  '🏀', '⚽', '🎾', '🏐', '🎱', '⚾', '🏈', '🏹', '⛳', '🚗', '🚓', '🚕', '🚙', '🚌', '🚎', '🏎️', '✈️', '🛩️',
  '🍎', '🍌', '🍇', '🍓', '🍈', '🍒', '🍑', '🍍', '🥭', '🍉', '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🎂', '🍰', '🍦', '🍩'
]

export function getRandomEmoji() {
  return randomEmojis[Math.floor(Math.random() * randomEmojis.length)]
}

// Path of the plugin file that called keith(). Works for ES modules (file:///...) and normal paths.
function callerFile() {
  const line = (new Error().stack || '').split('\n')[3] || ''
  return line.match(/(file:\/\/[^\s)]+?|\/[^\s):]+?\.[cm]?js):\d+:\d+/)?.[1] || 'unknown'
}

export function keith(obj, functions) {
  const info = obj
  if (!info.category) info.category = 'General'
  if (!info.react) info.react = getRandomEmoji()
  if (!info.dontAddCommandList) info.dontAddCommandList = false
  info.function = functions
  info.filename = callerFile()
  commands.push(info)
  return info
}

evt.commands = commands
