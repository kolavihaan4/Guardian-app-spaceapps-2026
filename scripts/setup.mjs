// Creates .env from .env.example with freshly generated secrets (never overwrites an existing .env).
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, '.env')
if (existsSync(target)) {
  console.log('.env already exists — leaving it untouched.')
  process.exit(0)
}
const key = () => randomBytes(32).toString('base64')
const env = readFileSync(resolve(root, '.env.example'), 'utf8')
  .replace(/^TOKEN_ENCRYPTION_KEY=.*$/m, `TOKEN_ENCRYPTION_KEY=${key()}`)
  .replace(/^DEVICE_TOKEN_PEPPER=.*$/m, `DEVICE_TOKEN_PEPPER=${key()}`)
writeFileSync(target, env, { mode: 0o600 })
console.log('Created .env with new random secrets. Keep it private (it is git-ignored).')
