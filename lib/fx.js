import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { B } from './baileys.js'
import { unwrap, getText, ctxInfo } from './utils.js'

// ffmpeg binary: bundled package first, then FFMPEG_PATH, then system ffmpeg
let FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
try {
  const ff = await import('@ffmpeg-installer/ffmpeg')
  FFMPEG = (ff.default || ff).path || FFMPEG
} catch {}

// Find a media message of one of `kinds`, in the message itself or in the one it replies to.
// Returns { key, message } (message holds e.g. message.audioMessage) or null.
export function findMedia(m, kinds) {
  const content = unwrap(m.message)
  for (const k of kinds) if (content?.[k]) return { key: m.key, message: content }
  const info = ctxInfo(content)
  const q = unwrap(info.quotedMessage)
  if (!q) return null
  for (const k of kinds) {
    if (q[k]) {
      return {
        key: { remoteJid: m.key.remoteJid, id: info.stanzaId, participant: info.participant },
        message: q
      }
    }
  }
  return null
}

// Download the media of a found target as a Buffer
export function download(sock, target) {
  return B.downloadMediaMessage(target, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })
}

// Words typed after the command, e.g. ".trim 5 20" -> ['5', '20']
export function getArgs(m) {
  const text = getText(unwrap(m.message))
  return text.trim().split(/\s+/).slice(1)
}

// Run ffmpeg: input Buffer -> output Buffer with the given extension
export async function ffmpeg(input, ext, args = []) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const inFile = path.join(os.tmpdir(), `fx_${id}.in`)
  const outFile = path.join(os.tmpdir(), `fx_${id}.${ext}`)
  fs.writeFileSync(inFile, input)
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', inFile, ...args, outFile])
      let err = ''
      const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timed out')) }, 120000)
      p.stderr.on('data', (d) => { err += d })
      p.on('error', (e) => { clearTimeout(timer); reject(e) })
      p.on('close', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.split('\n').slice(-4).join(' ').trim()))
      })
    })
    return fs.readFileSync(outFile)
  } finally {
    fs.rmSync(inFile, { force: true })
    fs.rmSync(outFile, { force: true })
  }
                                                   }
