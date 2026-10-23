import * as ns from '@whiskeysockets/baileys'
export const B = ns.useMultiFileAuthState ? ns : (ns.default ?? ns)
export const makeWASocket =
  ns.makeWASocket ||
  (typeof ns.default === 'function' ? ns.default : ns.default?.default) ||
  B.makeWASocket
