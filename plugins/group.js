import { getTargets, num } from '../lib/utils.js'
import { getGroup, setGroup } from '../lib/db.js'
import { clearMeta } from '../lib/router.js'

const G = { category: 'Group', group: true }
const need = (c) => ({ ...G, ...c })

async function change(ctx, action, verb) {
  const targets = getTargets(ctx)
  if (!targets.length) return ctx.reply(`Reply to someone, @mention them, or type their number.`)
  await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, action)
  clearMeta(ctx.jid)
  await ctx.sock.sendMessage(ctx.jid, { text: `✅ ${verb}: ${targets.map((t) => '@' + num(t)).join(' ')}`, mentions: targets })
}

export default [
  need({ name: 'tagall', aliases: ['everyone'], desc: 'Mention everyone', admin: true,
    async run({ sock, jid, metadata, body }) {
      const ids = metadata.participants.map((p) => p.id)
      const text = `📢 *${body || 'Attention everyone'}*\n\n` + ids.map((i) => '@' + num(i)).join(' ')
      await sock.sendMessage(jid, { text, mentions: ids })
    } }),
  need({ name: 'hidetag', desc: 'Mention everyone silently', admin: true,
    async run({ sock, jid, metadata, body, reply }) {
      if (!body) return reply('Type a message after the command.')
      await sock.sendMessage(jid, { text: body, mentions: metadata.participants.map((p) => p.id) })
    } }),
  need({ name: 'kick', aliases: ['remove'], desc: 'Remove a member', admin: true, botAdmin: true,
    run: (c) => change(c, 'remove', 'Removed') }),
  need({ name: 'add', desc: 'Add a number to the group', admin: true, botAdmin: true,
    run: (c) => change(c, 'add', 'Added') }),
  need({ name: 'promote', desc: 'Make a member admin', admin: true, botAdmin: true,
    run: (c) => change(c, 'promote', 'Promoted') }),
  need({ name: 'demote', desc: 'Remove admin rights', admin: true, botAdmin: true,
    run: (c) => change(c, 'demote', 'Demoted') }),
  need({ name: 'close', aliases: ['mute'], desc: 'Only admins can send', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) { await sock.groupSettingUpdate(jid, 'announcement'); await reply('🔒 Group closed.') } }),
  need({ name: 'open', aliases: ['unmute'], desc: 'Everyone can send', admin: true, botAdmin: true,
    async run({ sock, jid, reply }) { await sock.groupSettingUpdate(jid, 'not_announcement'); await reply('🔓 Group opened.') } }),
  need({ name: 'link', aliases: ['invite'], desc: 'Get the invite link', botAdmin: true,
    async run({ sock, jid, reply }) { await reply('https://chat.whatsapp.com/' + await sock.groupInviteCode(jid)) } }),
  need({ name: 'setname', desc: 'Change group name', admin: true, botAdmin: true,
    async run({ sock, jid, body, reply }) {
      if (!body) return reply('Type the new name.')
      await sock.groupUpdateSubject(jid, body); await reply('✅ Name updated.')
    } }),
  need({ name: 'setdesc', desc: 'Change group description', admin: true, botAdmin: true,
    async run({ sock, jid, body, reply }) {
      if (!body) return reply('Type the new description.')
      await sock.groupUpdateDescription(jid, body); await reply('✅ Description updated.')
    } }),
  need({ name: 'antilink', desc: 'Delete group invite links (on/off)', admin: true,
    async run({ jid, args, reply }) {
      const v = (args[0] || '').toLowerCase()
      if (!['on', 'off'].includes(v)) return reply(`Anti-link is *${getGroup(jid).antilink ? 'on' : 'off'}*. Use: antilink on/off`)
      setGroup(jid, { antilink: v === 'on' })
      await reply(`🛡 Anti-link ${v === 'on' ? 'enabled (make me admin so I can delete)' : 'disabled'}.`)
    } }),
  need({ name: 'welcome', desc: 'Welcome/goodbye messages (on/off)', admin: true,
    async run({ jid, args, reply }) {
      const v = (args[0] || '').toLowerCase()
      if (!['on', 'off'].includes(v)) return reply(`Welcome is *${getGroup(jid).welcome ? 'on' : 'off'}*. Use: welcome on/off`)
      setGroup(jid, { welcome: v === 'on' })
      await reply(`👋 Welcome messages ${v}.`)
    } }),
  need({ name: 'groupinfo', aliases: ['ginfo'], desc: 'Show group details',
    async run({ metadata, reply }) {
      const admins = metadata.participants.filter((p) => p.admin).length
      await reply(`*${metadata.subject}*\n👥 Members: ${metadata.participants.length}\n🛡 Admins: ${admins}\n📝 ${metadata.desc || 'No description'}`)
    } })
]
