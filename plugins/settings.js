import { num, ctxInfo } from '../lib/utils.js'
import { B } from '../lib/baileys.js'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'
import { settings, saveSettings, resetSettings } from '../lib/botSettings.js'

const O = { category: 'Settings', owner: true }
const ownJid = (sock) => num(sock.user.id) + '@s.whatsapp.net'
const state = (v) => (v ? 'ON ✅' : 'OFF ❌')

// on/off switch that is stored in the bot settings
const toggle = (key, icon, title, desc) => ({
  ...O, name: key, desc,
  async run({ args, reply, prefix }) {
    const v = (args[0] || '').toLowerCase()
    if (!['on', 'off'].includes(v)) return reply(nexusHint(`${title} is ${state(settings[key])}. Use: ${prefix}${key} on/off`))
    settings[key] = v === 'on'
    saveSettings()
    await reply(nexusBox(`${icon} *${title}*`, [v === 'on' ? 'Turned ON ✅' : 'Turned OFF ❌']))
  }
})

// WhatsApp privacy setting: .name <value>
const privacy = (name, fn, values, icon, title, desc) => ({
  ...O, name, desc,
  async run({ sock, args, reply, prefix }) {
    const v = (args[0] || '').toLowerCase()
    if (!values.includes(v)) return reply(nexusHint(`Use: ${prefix}${name} ${values.join(' / ')}`))
    if (typeof sock[fn] !== 'function') return reply(nexusHint('This setting is not supported by the installed WhatsApp library.'))
    try {
      await sock[fn](v)
      await reply(nexusBox(`${icon} *${title}*`, [`Now set to: *${v}*`]))
    } catch (e) { await reply(nexusHint('❌ WhatsApp refused the change: ' + e.message)) }
  }
})

function findImage({ m, content, jid }) {
  if (content?.imageMessage) return m
  const info = ctxInfo(content)
  const q = info.quotedMessage
  if (!q?.imageMessage) return null
  return { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant }, message: q }
}

const AUDIENCE = ['all', 'contacts', 'contact_blacklist', 'none']

export default [
  // ───── Overview ─────
  { ...O, name: 'settings', aliases: ['config', 'botsettings'], desc: 'Show all bot settings',
    async run({ reply, prefix }) {
      await reply(nexusBox('⚙️ *BOT SETTINGS*', [
        `Mode: *${settings.mode.toUpperCase()}*`,
        `Auto read: ${state(settings.autoread)}`,
        `Auto typing: ${state(settings.autotyping)}`,
        `Auto recording: ${state(settings.autorecording)}`,
        `Always online: ${state(settings.alwaysonline)}`,
        `Auto view status: ${state(settings.autoviewstatus)}`,
        `Anti call: ${state(settings.anticall)}`,
        '',
        `Change with: ${prefix}autoread on/off, ${prefix}mode public/private, and so on.`,
        `See ${prefix}menu → Settings for every command.`,
      ]))
    } },
  { ...O, name: 'resetsettings', desc: 'Reset all bot settings to default',
    async run({ reply }) { resetSettings(); await reply(nexusBox('♻️ *SETTINGS RESET*', ['All bot settings are back to default.'])) } },

  // ───── Behaviour switches ─────
  { ...O, name: 'mode', desc: 'public = everyone, private = only the bot account',
    async run({ args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!['public', 'private'].includes(v)) return reply(nexusHint(`Mode is ${settings.mode.toUpperCase()}. Use: ${prefix}mode public / private`))
      settings.mode = v
      saveSettings()
      await reply(nexusBox('🔐 *BOT MODE*', [v === 'public' ? 'Public: everyone can use the bot.' : 'Private: only messages sent from the bot account itself are answered.']))
    } },
  toggle('autoread', '👀', 'AUTO READ', 'Mark incoming messages as read (on/off)'),
  toggle('autotyping', '⌨️', 'AUTO TYPING', 'Show typing before replies (on/off)'),
  toggle('autorecording', '🎙️', 'AUTO RECORDING', 'Show recording audio before replies (on/off)'),
  toggle('alwaysonline', '🟢', 'ALWAYS ONLINE', 'Keep the bot showing online (on/off)'),
  toggle('autoviewstatus', '📺', 'AUTO VIEW STATUS', 'View contacts\' statuses automatically (on/off)'),
  toggle('anticall', '📵', 'ANTI CALL', 'Reject incoming calls (on/off)'),
  { ...O, name: 'callmsg', desc: 'Set the message sent to people who call',
    async run({ body, reply, prefix }) {
      if (!body) return reply(nexusHint(`Current: ${settings.callmsg}\nUse: ${prefix}callmsg <new message>`))
      settings.callmsg = body.slice(0, 300)
      saveSettings()
      await reply(nexusBox('📵 *CALL MESSAGE*', ['Updated.', settings.callmsg]))
    } },

  // ───── Bot profile ─────
  { ...O, name: 'setbotname', desc: 'Change the bot WhatsApp name',
    async run({ sock, body, reply }) {
      if (!body) return reply(nexusHint('Type the new name.'))
      await sock.updateProfileName(body.slice(0, 25))
      await reply(nexusBox('✅ *PROFILE NAME*', ['Bot name updated.']))
    } },
  { ...O, name: 'setbotpp', aliases: ['setpp'], desc: 'Set the bot profile picture (send or reply to an image)',
    async run(ctx) {
      const msg = findImage(ctx)
      if (!msg) return ctx.reply(nexusHint(`Send or reply to an image with ${ctx.prefix}setbotpp`))
      const buffer = await B.downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })
      await ctx.sock.updateProfilePicture(ownJid(ctx.sock), buffer)
      await ctx.reply(nexusBox('✅ *PROFILE PICTURE*', ['Bot picture updated.']))
    } },
  { ...O, name: 'removebotpp', aliases: ['delpp'], desc: 'Remove the bot profile picture',
    async run({ sock, reply }) {
      await sock.removeProfilePicture(ownJid(sock))
      await reply(nexusBox('✅ *PROFILE PICTURE*', ['Bot picture removed.']))
    } },
  { ...O, name: 'presence', desc: 'Show as online/offline (available / unavailable)',
    async run({ sock, args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!['available', 'unavailable'].includes(v)) return reply(nexusHint(`Use: ${prefix}presence available / unavailable`))
      await sock.sendPresenceUpdate(v)
      await reply(nexusBox('📶 *PRESENCE*', [`Now: *${v}*`]))
    } },

  // ───── WhatsApp privacy ─────
  { ...O, name: 'privacy', desc: 'Show the bot account privacy settings',
    async run({ sock, reply }) {
      const p = await sock.fetchPrivacySettings(true)
      const lines = Object.entries(p || {}).map(([k, v]) => `${k}: ${v}`)
      await reply(nexusBox('🔒 *PRIVACY*', lines.length ? lines : ['No data returned.']))
    } },
  privacy('lastseen', 'updateLastSeenPrivacy', AUDIENCE, '🕘', 'LAST SEEN', 'Who sees last seen: all/contacts/contact_blacklist/none'),
  privacy('online', 'updateOnlinePrivacy', ['all', 'match_last_seen'], '🟢', 'ONLINE STATUS', 'Who sees when online: all/match_last_seen'),
  privacy('ppprivacy', 'updateProfilePicturePrivacy', AUDIENCE, '🖼️', 'PROFILE PHOTO', 'Who sees the profile photo'),
  privacy('statusprivacy', 'updateStatusPrivacy', AUDIENCE, '📺', 'STATUS PRIVACY', 'Who sees your status updates'),
  privacy('readreceipts', 'updateReadReceiptsPrivacy', ['all', 'none'], '✔️', 'READ RECEIPTS', 'Blue ticks: all/none'),
  privacy('groupadd', 'updateGroupsAddPrivacy', ['all', 'contacts', 'contact_blacklist'], '👥', 'GROUP ADD', 'Who can add the bot to groups'),
  privacy('callprivacy', 'updateCallPrivacy', ['all', 'known'], '📞', 'CALL PRIVACY', 'Who can call: all/known'),
  { ...O, name: 'blocklist', desc: 'Show blocked numbers',
    async run({ sock, reply }) {
      const list = await sock.fetchBlocklist()
      if (!list?.length) return reply(nexusBox('🚫 *BLOCKED*', ['No blocked numbers.']))
      await reply(nexusBox(`🚫 *BLOCKED (${list.length})*`, list.slice(0, 50).map((j) => '◈ +' + num(j))))
    } }
]
