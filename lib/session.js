import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { createClient } from '@supabase/supabase-js'

const DIR = './session'
const TABLE = process.env.SESSION_TABLE || 'nexus_sessions'
const ID = process.env.SESSION_ID || 'nexus_md'
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null

export const cloudEnabled = !!supabase

// Download the saved login (only when there is no local one yet)
export async function restore() {
  if (!supabase) return console.log('ℹ️ Supabase not set: login will not survive redeploys')
  if (fs.existsSync(path.join(DIR, 'creds.json'))) return
  try {
    const { data, error } = await supabase.from(TABLE).select('data').eq('id', ID).maybeSingle()
    if (error) throw error
    if (!data?.data) return console.log('ℹ️ No saved session in Supabase yet')
    fs.rmSync(DIR, { recursive: true, force: true })
    fs.mkdirSync(DIR, { recursive: true })
    new AdmZip(Buffer.from(data.data, 'base64')).extractAllTo(DIR, true)
    console.log('✅ Session restored from Supabase')
  } catch (e) { console.log('⚠️ Could not restore session:', e.message) }
}

// Upload the login folder
export async function upload() {
  if (!supabase || !fs.existsSync(path.join(DIR, 'creds.json'))) return
  try {
    const zip = new AdmZip()
    zip.addLocalFolder(DIR)
    const { error } = await supabase.from(TABLE).upsert({ id: ID, data: zip.toBuffer().toString('base64') })
    if (error) throw error
    console.log('☁️ Session saved to Supabase')
  } catch (e) { console.log('⚠️ Session upload failed:', e.message) }
}

// Save at most once every 30 seconds while credentials change
let timer = null
export function scheduleUpload() {
  if (!supabase || timer) return
  timer = setTimeout(async () => { timer = null; await upload() }, 30000)
}

export async function clearCloud() {
  fs.rmSync(DIR, { recursive: true, force: true })
  if (!supabase) return
  try { await supabase.from(TABLE).delete().eq('id', ID) } catch {}
  }
