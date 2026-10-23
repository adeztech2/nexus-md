import fs from 'fs'
const FILE = './data/db.json'
let db = { groups: {} }
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch {}

function save() {
  try { fs.mkdirSync('./data', { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 2)) } catch {}
}
export const getGroup = (jid) => db.groups[jid] || {}
export function setGroup(jid, patch) {
  db.groups[jid] = { ...(db.groups[jid] || {}), ...patch }
  save()
}
