import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { hmac, pkceChallenge, SecretBox } from '../src/lib/crypto.ts'

const key = () => randomBytes(32).toString('base64')

describe('SecretBox (AES-256-GCM)', () => {
  it('round-trips and never produces the plaintext', () => {
    const box = new SecretBox(key())
    const ct = box.encrypt('ya29.secret-refresh-token', 'user1:google-health')
    expect(ct).toMatch(/^v1\./)
    expect(ct).not.toContain('secret')
    expect(box.decrypt(ct, 'user1:google-health')).toBe('ya29.secret-refresh-token')
  })

  it('uses a fresh IV each time', () => {
    const box = new SecretBox(key())
    expect(box.encrypt('x', 'a')).not.toBe(box.encrypt('x', 'a'))
  })

  it('rejects tampering, a different row (AAD) and a different key', () => {
    const box = new SecretBox(key())
    const ct = box.encrypt('token', 'user1:google-health')
    const parts = ct.split('.')
    const flipped = Buffer.from(parts[2]!, 'base64url')
    flipped[0] = flipped[0]! ^ 1
    parts[2] = flipped.toString('base64url')
    expect(() => box.decrypt(parts.join('.'), 'user1:google-health')).toThrow()
    expect(() => box.decrypt(ct, 'user2:google-health')).toThrow()
    expect(() => new SecretBox(key()).decrypt(ct, 'user1:google-health')).toThrow()
  })

  it('refuses keys that are not 32 bytes', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow()
  })
})

describe('HMAC, PKCE', () => {
  it('computes RFC 7636 S256 challenges (appendix B vector)', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('hmac is keyed', () => {
    expect(hmac(key(), 'abc')).not.toBe(hmac(key(), 'abc'))
  })
})

describe('config', () => {
  it('fails fast with a helpful message when secrets are missing', () => {
    expect(() => loadConfig({})).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it('requires https APP_ORIGIN in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.org', TOKEN_ENCRYPTION_KEY: key(), DEVICE_TOKEN_PEPPER: key(), SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }),
    ).toThrow(/https/)
  })

  it('needs the Supabase project, and refuses a secret key in place of the publishable one', () => {
    const base = { TOKEN_ENCRYPTION_KEY: key(), DEVICE_TOKEN_PEPPER: key() }
    expect(() => loadConfig(base)).toThrow(/SUPABASE_URL/)
    expect(() => loadConfig({ ...base, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/publishable/)
    expect(loadConfig({ ...base, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).SUPABASE_URL).toBe('https://x.supabase.co')
  })
})
