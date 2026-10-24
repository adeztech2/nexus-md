import { getTargets, num, ctxInfo } from '../lib/utils.js'
import { getGroup, setGroup } from '../lib/db.js'
import { clearMeta } from '../lib/router.js'
import { B } from '../lib/baileys.js'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'

const G = { category: 'Group', group: true }
const need = (c) => ({ ...G, ...c })

async function change(ctx, action, verb) {
  const targets = getTargets(ctx)
  if (!targets.length) return ctx.reply(nexusHint('Reply to someone, @mention them, or type their number.'))
  await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, action)
  clearMeta(ctx.jid)
  const text = nexusBox(`✅ *${verb.toUpperCase()}*`, targets.map((t) => '◈ @' + num(t)))
  await ctx.sock.sendMessage(ctx.jid, { text, mentions: targets })
}

// Find an image in the message itself or in the message it replies to
function findImage({ m, content, jid }) {
  if (content?.imageMessage) return m
  const info = ctxInfo(content)
  const q = info.quotedMessage
  if (!q?.imageMessage) return null
  return { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant }, message: q }
}

const DISAPPEAR = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 }

export default [
  // ───── Mentions ─────
  need({ name: 'tagall', aliases: ['everyone'], desc: 'Mention everyone', admin: true,
    async run({ sock, jid, metadata, body }) {
      const ids = metadata.participants.map((p) => p.id)
      const text = nexusBox('📢 *TAG ALL*', [body || 'Attention everyone', '', ids.map((i) => '@' + num(i)).join(' ')])
      await sock.sendMessage(jid, { text, mentions: ids })
    } }),
  need({ name: 'hidetag', desc: 'Mention everyone silently', admin: true,
    async run({ sock, jid, metadata, body, reply }) {
      if (!body) return reply(nexusHint('Type a message after the command.'))
      await sock.sendMessage(jid, { text: body, mentions: metadata.participants.map((p) => p.id) })
    } }),
  need({ name: 'tagadmins', aliases: ['calladmins'], desc: 'Mention only the admins',
    async run({ sock, jid, metadata, body }) {
      const ids = metadata.participants.filter((p) => p.admin).map((p) => p.id)
      const text = nexusBox('🛡️ *CALLING ADMINS*', [body || 'Your attention is needed.', '', ids.map((i) => '@' + num(i)).join(' ')])
      await sock.sendMessage(jid, { text, mentions: ids })
    } }),
  need({ name: 'admins', aliases: ['listadmins'], desc: 'List the group admins',
    async run({ sock, jid, metadata }) {
      const ids = metadata.participants.filter((p) => p.admin).map((p) => p.id)
      const text = nexusBox(`🛡️ *ADMINS (${ids.length})*`, ids.map((i) => '◈ @' + num(i)))
      await sock.sendMessage(jid, { text, mentions: ids })
    } }),

  // ───── Members ─────
  need({ name: 'kick', aliases: ['remove'], desc: 'Remove a member', admin: true, botAdmin: true,
    run: (c) => change(c, 'remove', 'Removed') }),
  need({ name: 'add', desc: 'Add a number to the group', admin: true, botAdmin: true,
    run: (c) => change(c, 'add', 'Added') }),
  need({ name: 'promote', desc: 'Make a member admin', admin: true, botAdmin: true,
    run: (c) => change(c, 'promote', 'Promoted') }),
  need({ name: 'demote', desc: 'Remove admin rights', admin: true, botAdmin: true,
    run: (c) => change(c, 'demote', 'Demoted') }),
  need({ name: 'pending', aliases: ['requests'], desc: 'Show people waiting to join', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      const list = await sock.groupRequestParticipantsList(jid)
      if (!list?.length) return reply(nexusBox('📥 *JOIN REQUESTS*', ['No one is waiting.']))
      await reply(nexusBox(`📥 *JOIN REQUESTS (${list.length})*`, list.map((p) => '◈ +' + num(p.jid || p.id))))
    } }),
  need({ name: 'approveall', desc: 'Approve all join requests', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      const list = await sock.groupRequestParticipantsList(jid)
      if (!list?.length) return reply(nexusHint('No one is waiting to join.'))
      await sock.groupRequestParticipantsUpdate(jid, list.map((p) => p.jid || p.id), 'approve')
      clearMeta(jid)
      await reply(nexusBox('✅ *APPROVED*', [`${list.length} people can now join.`]))
    } }),
  need({ name: 'rejectall', desc: 'Reject all join requests', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      const list = await sock.groupRequestParticipantsList(jid)
      if (!list?.length) return reply(nexusHint('No one is waiting to join.'))
      await sock.groupRequestParticipantsUpdate(jid, list.map((p) => p.jid || p.id), 'reject')
      await reply(nexusBox('🚫 *REJECTED*', [`${list.length} requests rejected.`]))
    } }),

  // ───── Group settings ─────
  need({ name: 'close', aliases: ['mute'], desc: 'Only admins can send', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      await sock.groupSettingUpdate(jid, 'announcement')
      await reply(nexusBox('🔒 *GROUP CLOSED*', ['Only admins can send messages.']))
    } }),
  need({ name: 'open', aliases: ['unmute'], desc: 'Everyone can send', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      await sock.groupSettingUpdate(jid, 'not_announcement')
      await reply(nexusBox('🔓 *GROUP OPENED*', ['Everyone can send messages.']))
    } }),
  need({ name: 'editinfo', desc: 'Who can edit group info (admins/all)', admin: true, botAdmin: true,
    async run({ sock, jid, args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!['admins', 'all'].includes(v)) return reply(nexusHint(`Use: ${prefix}editinfo admins  or  ${prefix}editinfo all`))
      await sock.groupSettingUpdate(jid, v === 'admins' ? 'locked' : 'unlocked')
      await reply(nexusBox('⚙️ *GROUP INFO*', [v === 'admins' ? 'Only admins can edit group info.' : 'Everyone can edit group info.']))
    } }),
  need({ name: 'disappear', aliases: ['ephemeral'], desc: 'Disappearing messages: off, 24h, 7d, 90d', admin: true, botAdmin: true,
    async run({ sock, jid, args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!(v in DISAPPEAR)) return reply(nexusHint(`Use: ${prefix}disappear off / 24h / 7d / 90d`))
      await sock.groupToggleEphemeral(jid, DISAPPEAR[v])
      await reply(nexusBox('⏳ *DISAPPEARING MESSAGES*', [v === 'off' ? 'Turned off.' : `Messages disappear after ${v}.`]))
    } }),
  need({ name: 'link', aliases: ['invite'], desc: 'Get the invite link', botAdmin: true,
    async run({ sock, jid, reply }) {
      await reply(nexusBox('🔗 *INVITE LINK*', ['https://chat.whatsapp.com/' + await sock.groupInviteCode(jid)]))
    } }),
  need({ name: 'revoke', aliases: ['resetlink'], desc: 'Reset the invite link', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) {
      const code = await sock.groupRevokeInvite(jid)
      await reply(nexusBox('🔗 *NEW INVITE LINK*', ['The old link no longer works.', 'https://chat.whatsapp.com/' + code]))
    } }),
  need({ name: 'setname', desc: 'Change group name', admin: true, botAdmin: true,
    async run({ sock, jid, body, reply }) {
      if (!body) return reply(nexusHint('Type the new name.'))
      await sock.groupUpdateSubject(jid, body)
      await reply(nexusBox('✅ *UPDATED*', ['Group name changed.']))
    } }),
  need({ name: 'setdesc', desc: 'Change group description', admin: true, botAdmin: true,
    async run({ sock, jid, body, reply }) {
      if (!body) return reply(nexusHint('Type the new description.'))
      await sock.groupUpdateDescription(jid, body)
      await reply(nexusBox('✅ *UPDATED*', ['Group description changed.']))
    } }),
  need({ name: 'setgpp', aliases: ['setgrouppic'], desc: 'Set the group picture (send or reply to an image)', admin: true, botAdmin: true,
    async run(ctx) {
      const msg = findImage(ctx)
      if (!msg) return ctx.reply(nexusHint(`Send or reply to an image with ${ctx.prefix}setgpp`))
      const buffer = await B.downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })
      await ctx.sock.updateProfilePicture(ctx.jid, buffer)
      await ctx.reply(nexusBox('✅ *UPDATED*', ['Group picture changed.']))
    } }),
  need({ name: 'gpp', aliases: ['grouppic'], desc: 'Get the group picture',
    async run({ sock, jid, m, reply }) {
      try {
        const url = await sock.profilePictureUrl(jid, 'image')
        await sock.sendMessage(jid, { image: { url }, caption: nexusBox('🖼️ *GROUP PICTURE*', ['Current group picture.']) }, { quoted: m })
      } catch { await reply(nexusHint('This group has no picture.')) }
    } }),

  // ───── Protection ─────
  need({ name: 'antilink', desc: 'Delete group invite links (on/off)', admin: true,
    async run({ jid, args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!['on', 'off'].includes(v)) return reply(nexusHint(`Anti-link is ${getGroup(jid).antilink ? 'on' : 'off'}. Use: ${prefix}antilink on/off`))
      setGroup(jid, { antilink: v === 'on' })
      await reply(nexusBox('🛡️ *ANTI-LINK*', [v === 'on' ? 'Enabled. Make me admin so I can delete links.' : 'Disabled.']))
    } }),
  need({ name: 'welcome', desc: 'Welcome/goodbye messages (on/off)', admin: true,
    async run({ jid, args, reply, prefix }) {
      const v = (args[0] || '').toLowerCase()
      if (!['on', 'off'].includes(v)) return reply(nexusHint(`Welcome is ${getGroup(jid).welcome ? 'on' : 'off'}. Use: ${prefix}welcome on/off`))
      setGroup(jid, { welcome: v === 'on' })
      await reply(nexusBox('👋 *WELCOME MESSAGES*', [v === 'on' ? 'Enabled.' : 'Disabled.']))
    } }),

  // ───── Info & fun ─────
  need({ name: 'groupinfo', aliases: ['ginfo'], desc: 'Show group details',
    async run({ metadata, reply }) {
      const admins = metadata.participants.filter((p) => p.admin).length
      await reply(nexusBox('ℹ️ *GROUP INFO*', [
        `*${metadata.subject}*`,
        `👥 Members: ${metadata.participants.length}`,
        `🛡️ Admins: ${admins}`,
        `📝 ${metadata.desc || 'No description'}`,
      ]))
    } }),
  need({ name: 'poll', desc: 'Make a poll: question|option1|option2', admin: true,
    async run({ sock, jid, body, reply, prefix }) {
      const [name, ...values] = body.split('|').map((x) => x.trim()).filter(Boolean)
      if (!name || values.length < 2 || values.length > 12) {
        return reply(nexusHint(`Use: ${prefix}poll Best food?|Rice|Pizza|Chips  (2 to 12 options)`))
      }
      await sock.sendMessage(jid, { poll: { name, values, selectableCount: 1 } })
    } })
]
