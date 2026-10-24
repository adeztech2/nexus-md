import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { createClient } from '@supabase/supabase-js'

const TABLE = process.env.SESSION_TABLE || 'nexus_sessions'
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null

export const cloudEnabled = !!supabase

// One session per WhatsApp number. Each has its own folder and its own Supabase row.
export function createSession(id) {
  const DIR = path.join('./session', id)
  let timer = null

  async function restore() {
    if (!supabase) return console.log(`ℹ️ [${id}] Supabase not set: login will not survive redeploys`)
    if (fs.existsSync(path.join(DIR, 'creds.json'))) return
    try {
      const { data, error } = await supabase.from(TABLE).select('data').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data?.data) return console.log(`ℹ️ [${id}] No saved session in Supabase yet`)
      fs.rmSync(DIR, { recursive: true, force: true })
      fs.mkdirSync(DIR, { recursive: true })
      new AdmZip(Buffer.from(data.data, 'base64')).extractAllTo(DIR, true)
      console.log(`✅ [${id}] Session restored from Supabase`)
    } catch (e) { console.log(`⚠️ [${id}] Could not restore session:`, e.message) }
  }

  async function upload() {
    if (!supabase || !fs.existsSync(path.join(DIR, 'creds.json'))) return
    try {
      const zip = new AdmZip()
      zip.addLocalFolder(DIR)
      const { error } = await supabase.from(TABLE).upsert({ id, data: zip.toBuffer().toString('base64') })
      if (error) throw error
      console.log(`☁️ [${id}] Session saved to Supabase`)
    } catch (e) { console.log(`⚠️ [${id}] Session upload failed:`, e.message) }
  }

  // Save at most once every 30 seconds while credentials change
  function scheduleUpload() {
    if (!supabase || timer) return
    timer = setTimeout(async () => { timer = null; await upload() }, 30000)
  }

  async function clearCloud() {
    fs.rmSync(DIR, { recursive: true, force: true })
    if (!supabase) return
    try { await supabase.from(TABLE).delete().eq('id', id) } catch {}
  }

  return { id, dir: DIR, restore, upload, scheduleUpload, clearCloud }
}
