import { createClient } from '@supabase/supabase-js'

const TABLE = process.env.SESSION_TABLE || 'nexus_sessions'
const ROW = 'nexus_numbers'
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null

// Stays false if the list could not be read, so a failed read never overwrites the saved list
let loaded = false

export async function loadNumbers() {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.from(TABLE).select('data').eq('id', ROW).maybeSingle()
    if (error) throw error
    loaded = true
    return JSON.parse(data?.data || '[]')
  } catch (e) {
    console.log('⚠️ Could not load number list:', e.message)
    return []
  }
}

export async function saveNumbers(list) {
  if (!supabase || !loaded) return
  try {
    const { error } = await supabase.from(TABLE).upsert({ id: ROW, data: JSON.stringify(list) })
    if (error) throw error
  } catch (e) { console.log('⚠️ Could not save number list:', e.message) }
}
