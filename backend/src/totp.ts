import crypto from 'node:crypto'

/**
 * TOTP (RFC 6238) implemented with node:crypto only — no native deps.
 * SHA1/6 digits/30s — compatible with Google Authenticator & friends.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const c of clean) {
    const idx = B32.indexOf(c)
    if (idx === -1) throw new Error('invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function totpCode(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', key).update(buf).digest()
  const off = h[h.length - 1] & 0xf
  const code = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1_000_000
  return String(code).padStart(6, '0')
}

export function verifyTotp(secretB32: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const step = Math.floor(Date.now() / 30_000)
  const given = Buffer.from(code)
  for (let i = -window; i <= window; i++) {
    const expect = Buffer.from(totpCode(secretB32, step + i))
    if (expect.equals(given)) return true
  }
  return false
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

export function otpauthUrl(secret: string, account: string, issuer = 'Panel'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
