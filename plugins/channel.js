import { CHANNEL_LINK, GROUP_LINK, getChannel, isForwarding, setForwarding, autoJoin } from '../lib/autojoin.js'

export default [
  {
    name: 'channel', aliases: ['support', 'links'], category: 'General', desc: 'Bot channel and support group links',
    async run({ reply }) {
      await reply(`📢 *Channel:* ${CHANNEL_LINK}\n👥 *Support group:* ${GROUP_LINK}`)
    }
  },
  {
    name: 'forward', aliases: ['chfwd'], category: 'Owner', owner: true, desc: 'Channel forward tag on/off',
    async run({ args, reply }) {
      const v = (args[0] || '').toLowerCase()
      if (!['on', 'off'].includes(v)) {
        const c = getChannel()
        return reply(`📢 Channel forward is *${isForwarding() ? 'on' : 'off'}*\nChannel: ${c.jid ? c.name : 'not found yet'}\nUse: forward on/off`)
      }
      setForwarding(v === 'on')
      await reply(`📢 Channel forward ${v}.`)
    }
  },
  {
    name: 'joinsupport', category: 'Owner', owner: true, desc: 'Join the group and follow the channel now',
    async run({ sock, reply }) {
      await reply('⏳ Trying...')
      await autoJoin(sock)
      await reply('✅ Done. Check the Render logs for the result.')
    }
  }
]
