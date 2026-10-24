import { sleep } from './utils.js'

const BOT_NAME = process.env.BOT_NAME || 'NEXUS MD'
export const GROUP_CODE = process.env.GROUP_INVITE_CODE || 'CvpcZcqPckCCIFT1QpQsqs'
export const CHANNEL_CODE = process.env.CHANNEL_CODE || '0029Vb8N0xYLikgHxdGh790m'
export const GROUP_LINK = `https://chat.whatsapp.com/${GROUP_CODE}`
export const CHANNEL_LINK = `https://whatsapp.com/channel/${CHANNEL_CODE}`

const AUTO_JOIN = String(process.env.AUTO_JOIN ?? 'true').toLowerCase() !== 'false'
let forwardOn = String(process.env.CHANNEL_FORWARD ?? 'true').toLowerCase() !== 'false'

// Filled in after the channel is looked up (or set CHANNEL_JID / CHANNEL_NAME in Render)
const channel = { jid: process.env.CHANNEL_JID || null, name: process.env.CHANNEL_NAME || BOT_NAME }
export const getChannel = () => ({ ...channel })
export const isForwarding = () => forwardOn
export const setForwarding = (v) => { forwardOn = !!v }

// Join the group and follow the channel (safe to run on every connect)
export async function autoJoin(sock) {
  if (!AUTO_JOIN) return
  await sleep(6000)

  try {
    await sock.groupAcceptInvite(GROUP_CODE)
    console.log('✅ Joined the support group')
  } catch (e) {
    const msg = String(e?.message || e)
    if (/conflict|already|409/i.test(msg)) console.log('ℹ️ Already in the support group')
    else console.log('⚠️ Could not join the group:', msg)
  }

  try {
    if (!channel.jid) {
      const meta = await sock.newsletterMetadata('invite', CHANNEL_CODE)
      channel.jid = meta?.id || null
      const n = meta?.name
      const name = typeof n === 'string' ? n : n?.text
      if (name) channel.name = name
    }
    if (channel.jid) {
      await sock.newsletterFollow(channel.jid)
      console.log(`✅ Following channel: ${channel.name}`)
    }
  } catch (e) {
    console.log('⚠️ Channel follow/lookup failed:', String(e?.message || e))
  }
}

// Make every message the bot sends show "Forwarded from <channel>"
export function enableChannelForward(sock) {
  const orig = sock.sendMessage.bind(sock)
  sock.sendMessage = (jid, content, opts) => {
    try {
      const skip = !forwardOn || !channel.jid || !content || typeof content !== 'object' ||
        content.delete || content.react || content.edit || content.forward ||
        String(jid).endsWith('@newsletter') || jid === 'status@broadcast'
      if (!skip) {
        content = {
          ...content,
          contextInfo: {
            ...(content.contextInfo || {}),
            isForwarded: true,
            forwardingScore: 999,
            forwardedNewsletterMessageInfo: {
              newsletterJid: channel.jid,
              newsletterName: channel.name,
              serverMessageId: -1
            }
          }
        }
      }
    } catch {}
    return orig(jid, content, opts)
  }
}
