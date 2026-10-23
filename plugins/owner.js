import { sleep, num } from '../lib/utils.js'

const O = { category: 'Owner', owner: true }

export default [
  { ...O, name: 'broadcast', aliases: ['bc'], desc: 'Send a message to all groups',
    async run({ sock, body, reply }) {
      if (!body) return reply('Type the message to broadcast.')
      const ids = Object.keys(await sock.groupFetchAllParticipating())
      let ok = 0
      for (const id of ids) {
        try { await sock.sendMessage(id, { text: `📢 *Broadcast*\n\n${body}` }); ok++ } catch {}
        await sleep(1500)
      }
      await reply(`✅ Sent to ${ok}/${ids.length} groups.`)
    } },
  { ...O, name: 'join', desc: 'Join a group by invite link',
    async run({ sock, args, reply }) {
      const code = (args[0] || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)?.[1]
      if (!code) return reply('Send a group invite link.')
      await sock.groupAcceptInvite(code); await reply('✅ Joined.')
    } },
  { ...O, name: 'leave', group: true, desc: 'Make the bot leave this group',
    async run({ sock, jid, reply }) { await reply('👋 Bye everyone.'); await sock.groupLeave(jid) } },
  { ...O, name: 'block', desc: 'Block a number (reply or type it)',
    async run({ sock, args, content, jid, reply }) {
      const n = (args[0] || '').replace(/\D/g, '')
      const target = n ? n + '@s.whatsapp.net' : (jid.endsWith('@s.whatsapp.net') ? jid : null)
      if (!target) return reply('Type the number to block.')
      await sock.updateBlockStatus(target, 'block'); await reply(`🚫 Blocked ${num(target)}`)
    } },
  { ...O, name: 'unblock', desc: 'Unblock a number',
    async run({ sock, args, reply }) {
      const n = (args[0] || '').replace(/\D/g, '')
      if (!n) return reply('Type the number to unblock.')
      await sock.updateBlockStatus(n + '@s.whatsapp.net', 'unblock'); await reply(`✅ Unblocked ${n}`)
    } },
  { ...O, name: 'setbio', desc: 'Change the bot About text',
    async run({ sock, body, reply }) {
      if (!body) return reply('Type the new bio.')
      await sock.updateProfileStatus(body); await reply('✅ Bio updated.')
    } },
  { ...O, name: 'restart', desc: 'Restart the bot',
    async run({ reply }) { await reply('🔄 Restarting...'); setTimeout(() => process.exit(0), 1000) } }
]
