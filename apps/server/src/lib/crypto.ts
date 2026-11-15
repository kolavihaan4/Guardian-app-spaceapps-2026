import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM envelope for secrets at rest (OAuth tokens, PKCE verifiers).
 * Format: "v1.<iv b64url>.<ciphertext b64url>.<tag b64url>". The version prefix
 * allows key rotation later. `aad` binds a ciphertext to its row (user+provider)
 * so a token copied into another user's row fails to decrypt.
 */
export class SecretBox {
  readonly #key: Buffer

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64')
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes')
    this.#key = key
  }

  encrypt(plaintext: string, aad: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv)
    cipher.setAAD(Buffer.from(aad, 'utf8'))
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return ['v1', iv.toString('base64url'), ct.toString('base64url'), tag.toString('base64url')].join('.')
  }

  decrypt(envelope: string, aad: string): string {
    const [version, iv, ct, tag] = envelope.split('.')
    if (version !== 'v1' || !iv || !ct || !tag) throw new Error('Unsupported ciphertext format')
    const decipher = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
  }
}

/** Keyed hash for values we must look up but never store in clear (session ids, device tokens). */
export function hmac(pepperBase64: string, value: string): string {
  return createHmac('sha256', Buffer.from(pepperBase64, 'base64')).update(value).digest('base64url')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomId(): string {
  return randomBytes(16).toString('hex')
}

/** RFC 7636 S256 code challenge. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}
