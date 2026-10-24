import { findMedia, download, ffmpeg, getArgs } from '../lib/fx.js'

const AUDIO = ['audioMessage', 'videoMessage']
const IMG = ['imageMessage', 'stickerMessage']
const VIDEO = ['videoMessage']

// Make sure video size is even (needed by the H.264 encoder)
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
const VID_ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-movflags', '+faststart']

// Read a number from the command text, keep it between lo and hi
const num = (v, d, lo, hi) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

const defs = []

// build(args, target) returns { ext, args, msg(out) }
function add(name, desc, category, kinds, usage, build, aliases = []) {
  defs.push({ name, desc, category, kinds, usage, build, aliases })
}

const audioFx = (name, desc, filter, aliases) =>
  add(name, desc, 'Audio', AUDIO, 'an audio, voice note or video', (a) => ({
    ext: 'mp3',
    args: ['-vn', '-af', typeof filter === 'function' ? filter(a) : filter, '-c:a', 'libmp3lame', '-b:a', '128k'],
    msg: (out) => ({ audio: out, mimetype: 'audio/mpeg' }),
  }), aliases)

const imageFx = (name, desc, filter, aliases) =>
  add(name, desc, 'Image', IMG, 'an image or sticker', () => ({
    ext: 'jpg',
    args: ['-vf', filter, '-frames:v', '1', '-q:v', '2'],
    msg: (out) => ({ image: out, caption: `✅ ${name}` }),
  }), aliases)

const videoFx = (name, desc, vf, af, aliases, maxSeconds = 60) =>
  add(name, desc, 'Video', VIDEO, 'a video', () => ({
    ext: 'mp4',
    args: ['-t', String(maxSeconds), '-vf', `${vf},${EVEN}`, ...(af ? ['-af', af] : []), ...VID_ENC],
    msg: (out) => ({ video: out, caption: `✅ ${name}`, mimetype: 'video/mp4' }),
  }), aliases)

// ---------- AUDIO ----------
audioFx('volume', 'Change loudness, e.g. .volume 2', (a) => `volume=${num(a[0], 2, 0.1, 10)},alimiter=limit=0.95`, ['vol'])
audioFx('echo', 'Add an echo', 'aecho=0.8:0.88:60|1000:0.4|0.3')
audioFx('chipmunk', 'Fast squeaky voice', 'aresample=44100,asetrate=66150,aresample=44100')
audioFx('telephone', 'Old phone call sound', 'highpass=f=400,lowpass=f=3000,volume=1.5')
audioFx('loud', 'Make the audio much louder', 'volume=3,alimiter=limit=0.9')
audioFx('muffle', 'Muffled, underwater sound', 'lowpass=f=700')
audioFx('wobble', 'Wobbly vibrato effect', 'vibrato=f=6:d=0.7')

// ---------- IMAGE ----------
imageFx('mirror', 'Flip an image left to right', 'hflip', ['hflip'])
imageFx('vflip', 'Flip an image upside down', 'vflip')
imageFx('rotate', 'Rotate an image 90 degrees', 'transpose=1')
imageFx('pixelate', 'Pixelate an image', 'scale=iw/20:ih/20,scale=iw*20:ih*20:flags=neighbor')
imageFx('sharpen', 'Make an image sharper', 'unsharp=5:5:1.5:5:5:0')
imageFx('bright', 'Make an image brighter', 'eq=brightness=0.15:saturation=1.1')
imageFx('dark', 'Make an image darker', 'eq=brightness=-0.2')
imageFx('contrast', 'Boost the contrast', 'eq=contrast=1.5')
imageFx('edge', 'Edge detection look', 'edgedetect=low=0.1:high=0.4')
imageFx('sketch', 'Pencil sketch look', 'edgedetect=low=0.08:high=0.3,negate')
imageFx('vignette', 'Dark corners look', 'vignette=PI/4')
imageFx('warm', 'Warm color tone', 'colorbalance=rs=.2:gs=.05:bs=-.2')
imageFx('cool', 'Cool color tone', 'colorbalance=rs=-.2:bs=.2')
imageFx('noise', 'Add film grain', 'noise=alls=40:allf=t+u')
imageFx('upscale', 'Make an image bigger (2x)', 'scale=min(iw*2\\,3000):-2:flags=lanczos,unsharp=3:3:0.8')
imageFx('tosquare', 'Crop an image to a square', 'crop=min(iw\\,ih):min(iw\\,ih)')
add('compress', 'Shrink an image file size', 'Image', IMG, 'an image or sticker', () => ({
  ext: 'jpg',
  args: ['-vf', 'scale=trunc(iw/2):trunc(ih/2)', '-frames:v', '1', '-q:v', '12'],
  msg: (out) => ({ image: out, caption: '✅ compressed' }),
}))

// ---------- VIDEO ----------
videoFx('vfast', 'Speed a video up 2x', 'setpts=0.5*PTS', 'atempo=2')
videoFx('vslow', 'Slow a video down 2x', 'setpts=2*PTS', 'atempo=0.5', [], 30)
videoFx('vgrey', 'Black and white video', 'hue=s=0')
videoFx('vmirror', 'Mirror a video', 'hflip')
videoFx('vreverse', 'Play a video backwards (max 15s)', 'reverse', 'areverse', [], 15)

add('removeaudio', 'Remove the sound from a video', 'Video', VIDEO, 'a video', () => ({
  ext: 'mp4', args: ['-an', '-c:v', 'copy'],
  msg: (out) => ({ video: out, caption: '✅ sound removed', mimetype: 'video/mp4' }),
}), ['vmute'])

add('togif', 'Video → GIF style video (max 15s)', 'Video', VIDEO, 'a video', () => ({
  ext: 'mp4',
  args: ['-an', '-t', '15', '-vf', EVEN, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  msg: (out) => ({ video: out, gifPlayback: true, mimetype: 'video/mp4' }),
}))

add('thumb', 'Get a picture from a video', 'Video', VIDEO, 'a video', () => ({
  ext: 'jpg', args: ['-frames:v', '1', '-q:v', '2'],
  msg: (out) => ({ image: out, caption: '✅ thumbnail' }),
}))

add('tovoice', 'Audio/video → voice note', 'Audio', AUDIO, 'an audio or video', () => ({
  ext: 'ogg', args: ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-ar', '48000'],
  msg: (out) => ({ audio: out, mimetype: 'audio/ogg; codecs=opus', ptt: true }),
}), ['ptt'])

add('tovid', 'Audio → video with a black screen', 'Video', ['audioMessage'], 'an audio or voice note', () => ({
  ext: 'mp4',
  args: ['-f', 'lavfi', '-i', 'color=c=black:s=480x480:r=15', '-shortest', '-c:v', 'libx264',
    '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
  msg: (out) => ({ video: out, mimetype: 'video/mp4' }),
}))

add('trim', 'Cut audio or video, e.g. .trim 5 20', 'Audio', AUDIO, 'an audio or video', (a, target) => {
  const start = num(a[0], 0, 0, 3600)
  const end = num(a[1], start + 30, start + 1, 3600)
  const range = ['-ss', String(start), '-to', String(end)]
  if (target.message.audioMessage) {
    return {
      ext: 'mp3',
      args: [...range, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k'],
      msg: (out) => ({ audio: out, mimetype: 'audio/mpeg' }),
    }
  }
  return {
    ext: 'mp4',
    args: [...range, '-vf', EVEN, ...VID_ENC],
    msg: (out) => ({ video: out, caption: `✅ ${start}s to ${end}s`, mimetype: 'video/mp4' }),
  }
})

export default defs.map((d) => ({
  name: d.name,
  aliases: d.aliases,
  category: d.category,
  desc: d.desc,
  async run({ sock, jid, m, reply, prefix }) {
    const target = findMedia(m, d.kinds)
    if (!target) return reply(`📎 Reply to ${d.usage} with *${prefix}${d.name}*`)
    try {
      const input = await download(sock, target)
      const b = d.build(getArgs(m), target)
      const out = await ffmpeg(input, b.ext, b.args)
      await sock.sendMessage(jid, b.msg(out), { quoted: m })
    } catch (e) {
      console.log(`❌ ${d.name} failed:`, e.message)
      await reply(`❌ Could not process that file. ${d.name === 'vreverse' ? 'Try a shorter video.' : ''}`.trim())
    }
  },
}))
