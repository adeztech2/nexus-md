// Stops free/eco hosts from putting the bot to sleep by pinging its own URL.
// Set APP_URL (e.g. https://your-app.herokuapp.com) on the host. Does nothing if it is not set.
import axios from 'axios'

const URL_ = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || ''
const EVERY_MS = 10 * 60 * 1000

if (URL_) {
  setInterval(() => { axios.get(URL_, { timeout: 15000 }).catch(() => {}) }, EVERY_MS).unref()
  console.log(`🔔 Keep-alive on: ${URL_}`)
}
