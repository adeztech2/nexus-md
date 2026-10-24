import fs from 'fs'
import path from 'path'

// Bot-wide switches. Saved to ./data/bot-settings.json so they survive restarts.
const FILE = path.join(process.cwd(), 'data', 'bot-settings.json')

export const DEFAULTS = {
  mode: 'public',          // public = everyone can use commands, private = only the bot's own number
  autoread: false,         // mark incoming messages as read
  autotyping: false,       // show "typing..." before replying
  autorecording: false,    // show "recording audio..." before replying
  alwaysonline: false,     // keep the bot showing as online
  autoviewstatus: false,   // view contacts' statuses automatically
  anticall: false,         // reject incoming calls
  callmsg: '📵 Calls are not allowed. Please send a message instead.',
}

export const settings = { ...DEFAULTS }

try { Object.assign(settings, JSON.parse(fs.readFileSync(FILE, 'utf8'))) } catch {}

export function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(settings, null, 2))
  } catch (e) { console.log('⚠️ Could not save settings:', e.message) }
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS)
  saveSettings()
}
