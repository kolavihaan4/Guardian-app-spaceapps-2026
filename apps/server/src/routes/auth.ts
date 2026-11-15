import { Router } from 'express'
import { z } from 'zod'
import { endSession, parse, startSession } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { hashPassword, randomId, verifyPassword } from '../lib/crypto.ts'
import { conflict, unauthorized } from '../lib/errors.ts'

const credentials = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
})

// Used to equalize timing when the email does not exist (avoids account enumeration by timing).
let dummyHash: Promise<string> | undefined

export function authRoutes(ctx: AppContext): Router {
  const r = Router()

  r.post('/register', async (req, res) => {
    const { email, password } = parse(credentials, req.body)
    if (ctx.repo.userByEmail(email)) throw conflict('An account with this email already exists.')
    const id = randomId()
    ctx.repo.createUser({ id, email, passwordHash: await hashPassword(password) })
    ctx.repo.audit(id, 'user.register')
    startSession(ctx, res, id)
    res.status(201).json({ ok: true })
  })

  r.post('/login', async (req, res) => {
    const { email, password } = parse(credentials.extend({ password: z.string().min(1).max(200) }), req.body)
    const user = ctx.repo.userByEmail(email)
    dummyHash ??= hashPassword('timing-equalizer-not-a-real-password')
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash))
    if (!user || !ok) throw unauthorized('Email or password is incorrect.')
    ctx.repo.audit(user.id, 'user.login')
    startSession(ctx, res, user.id)
    res.json({ ok: true })
  })

  r.post('/logout', (req, res) => {
    endSession(ctx, req, res)
    res.json({ ok: true })
  })

  return r
}
