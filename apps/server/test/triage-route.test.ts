import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDeterministicFallback, TriageRequestSchema } from '../src/routes/ai.ts'
import { ORIGIN } from './helpers.ts'

// High heart rate with SpO2 91, sensor verified: the rules escalate.
const PAYLOAD = {
  crew_id: 'C001',
  environment: 'iss_leo',
  vitals: { hr_bpm: 96, preflight_hr_median: 60, spo2_pct: 91, sensor_verified: true },
  available_tools: ['Pulse Oximeter', 'Blood Pressure Cuff'],
}
const rules = buildDeterministicFallback(TriageRequestSchema.parse(PAYLOAD))
const modelAnswer = JSON.stringify({ ...rules, common_causes: ['written by the model'] })
const SYSTEM_PROMPT = readFileSync(resolve(import.meta.dirname, '../../../ai/training/system_prompt.txt'), 'utf8').trim()

/** Stands in for the model server: records each request and answers with `reply`, or fails like a server that is not running. */
function modelServer(reply?: unknown) {
  const asked: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    asked.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
    if (reply === undefined) throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:8080')
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return asked
}

/** Signs in on a fresh app and runs one triage. The app is imported here so a test can set the environment first. */
async function triage() {
  const { makeTestContext } = await import('./helpers.ts')
  const agent = request.agent(makeTestContext().app)
  await agent.post('/api/auth/register').set('Origin', ORIGIN).send({ email: 'crew@example.com', password: 'correct-horse-battery' }).expect(201)
  const res = await agent.post('/api/ai/triage').set('Origin', ORIGIN).send(PAYLOAD).expect(200)
  return res.body as { source: string; triage: typeof rules }
}

describe('triage route and the model', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('asks the fine-tuned model on mlx_lm exactly as it was scored, and says so on the badge', async () => {
    const asked = modelServer({ choices: [{ message: { role: 'assistant', content: modelAnswer } }] })
    const res = await triage()
    expect(asked).toHaveLength(1)
    expect(asked[0]!.url).toBe('http://localhost:8080/v1/chat/completions')
    expect(asked[0]!.body).toMatchObject({ temperature: 0, max_tokens: 1100, chat_template_kwargs: { enable_thinking: false } })
    expect(asked[0]!.body.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: expect.stringContaining('"computed_facts"') },
    ])
    expect(res.source).toBe('Fine-tuned Qwen3-8B explanation, decisions by onboard rules')
    expect(res.triage.common_causes).toEqual(['written by the model'])
    expect(res.triage.overall_status).toBe('alert')
    expect(res.triage.contact_ground_support).toBe(true)
  })

  it('answers with the rule engine when the model server is not running', async () => {
    const asked = modelServer()
    const res = await triage()
    expect(asked).toHaveLength(1)
    expect(res.source).toBe('Onboard rule engine')
    expect(res.triage).toEqual(rules)
  })

  it('asks Ollama instead when TRIAGE_BACKEND=ollama', async () => {
    vi.stubEnv('TRIAGE_BACKEND', 'ollama')
    vi.resetModules()
    const asked = modelServer({ message: { role: 'assistant', content: modelAnswer } })
    const res = await triage()
    expect(asked).toHaveLength(1)
    expect(asked[0]!.url).toBe('http://localhost:11434/api/chat')
    expect(asked[0]!.body).toMatchObject({ model: 'astrovitals-triage', think: false })
    expect(asked[0]!.body).toHaveProperty('format')
    expect(res.source).toBe('Qwen3-8B explanation, decisions by onboard rules')
    expect(res.triage.common_causes).toEqual(['written by the model'])
  })
})
