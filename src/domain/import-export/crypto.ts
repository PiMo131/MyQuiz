/**
 * Passphrase encryption for exports and backups: AES-256-GCM with a PBKDF2-SHA256 derived key.
 *
 * Binary container layout:
 *   magic "MQZENC\x01" (7 bytes) | iterations u32 BE | salt (16) | iv (12) | ciphertext (AES-GCM, tag included)
 */

const MAGIC = new Uint8Array([0x4d, 0x51, 0x5a, 0x45, 0x4e, 0x43, 0x01]) // "MQZENC\x01"
const SALT_LEN = 16
const IV_LEN = 12
export const DEFAULT_ITERATIONS = 310_000

function subtle(): SubtleCrypto {
  const c = globalThis.crypto
  if (!c?.subtle) throw new Error('cryptoUnavailable')
  return c.subtle
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const s = subtle()
  const base = await s.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return s.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length + 4 + SALT_LEN + IV_LEN) return false
  return MAGIC.every((b, i) => bytes[i] === b)
}

export async function encryptBytes(plain: Uint8Array, passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<Uint8Array> {
  if (!passphrase) throw new Error('emptyPassphrase')
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const key = await deriveKey(passphrase, salt, iterations)
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
  const out = new Uint8Array(MAGIC.length + 4 + SALT_LEN + IV_LEN + cipher.length)
  let o = 0
  out.set(MAGIC, o)
  o += MAGIC.length
  new DataView(out.buffer).setUint32(o, iterations)
  o += 4
  out.set(salt, o)
  o += SALT_LEN
  out.set(iv, o)
  o += IV_LEN
  out.set(cipher, o)
  return out
}

export async function decryptBytes(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!isEncrypted(data)) throw new Error('notEncrypted')
  let o = MAGIC.length
  const iterations = new DataView(data.buffer, data.byteOffset).getUint32(o)
  o += 4
  const salt = data.slice(o, o + SALT_LEN)
  o += SALT_LEN
  const iv = data.slice(o, o + IV_LEN)
  o += IV_LEN
  const cipher = data.slice(o)
  const key = await deriveKey(passphrase, salt, iterations)
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource))
  } catch {
    throw new Error('wrongPassphrase')
  }
}

export async function encryptText(text: string, passphrase: string): Promise<Uint8Array> {
  return encryptBytes(new TextEncoder().encode(text), passphrase)
}

export async function decryptText(data: Uint8Array, passphrase: string): Promise<string> {
  return new TextDecoder().decode(await decryptBytes(data, passphrase))
}
