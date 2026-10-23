import os from 'os'
import { getAllCommands } from '../lib/router.js'
import { formatUptime } from '../lib/utils.js'

const BOT_NAME = process.env.BOT_NAME || 'NEXUS'
const DEV_NAME = 'Arnold Adez'
const DEV_NUMBER = '254111783552'

export default [
  {
    name: 'menu', aliases: ['help', 'commands'], category: 'General', desc: 'Show all commands',
    async run({ reply, prefix }) {
      const groups = {}
      for (const c of getAllCommands()) (groups[c.category || 'Other'] ||= []).push(c)
      let out = `╭─── *${BOT_NAME}* ───\n│ Prefix: [ ${prefix} ]\n│ Commands: ${getAllCommands().length}\n╰──────────────\n`
      for (const [cat, cmds] of Object.entries(groups)) {
        out += `\n*${cat.toUpperCase()}*\n` + cmds.map((c) => `› ${prefix}${c.name} — ${c.desc}`).join('\n') + '\n'
      }
      out += `\n_Developer: ${DEV_NAME}_`
      await reply(out.trim())
    }
  },
  {
    name: 'ping', category: 'General', desc: 'Check bot speed',
    async run({ sock, jid, m }) {
      const t = Date.now()
      const sent = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: m })
      await sock.sendMessage(jid, { text: `🏓 Pong! ${Date.now() - t} ms`, edit: sent.key })
    }
  },
  {
    name: 'alive', aliases: ['runtime', 'uptime'], category: 'General', desc: 'Uptime and status',
    async run({ reply }) {
      const mem = (process.memoryUsage().rss / 1048576).toFixed(0)
      await reply(`✅ *${BOT_NAME}* is running\n⏱ Uptime: ${formatUptime(process.uptime())}\n💾 Memory: ${mem} MB\n🖥 Platform: ${os.platform()}`)
    }
  },
  {
    name: 'owner', aliases: ['dev', 'developer'], category: 'General', desc: 'Show the developer contact',
    async run({ reply }) {
      await reply(`👨‍💻 *Developer:* ${DEV_NAME}\n📞 +${DEV_NUMBER}\n💬 wa.me/${DEV_NUMBER}`)
    }
  }
]
