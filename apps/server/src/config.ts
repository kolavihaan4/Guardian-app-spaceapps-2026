import { z } from 'zod'

const base64Key = z
  .string()
  .min(1, 'is required — generate one with `npm run gen:key`')
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes encoded as base64 (`npm run gen:key`)')

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./data/astrovitals.sqlite'),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),

  TOKEN_ENCRYPTION_KEY: base64Key,
  DEVICE_TOKEN_PEPPER: base64Key,

  RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),

  NASA_API_KEY: z.string().default('DEMO_KEY'),
  NASA_DONKI_BASE: z.url().default('https://ccmc.gsfc.nasa.gov/DONKI-API/get'),
  NASA_EONET_BASE: z.url().default('https://eonet.gsfc.nasa.gov/api/v3'),
  NASA_POWER_BASE: z.url().default('https://power.larc.nasa.gov/api/temporal'),
  NASA_APOD_BASE: z.url().default('https://science.nasa.gov/wp-json/wp/v2/apod-basic'),
  NASA_APOD_LEGACY_BASE: z.url().default('https://api.nasa.gov/planetary/apod'),
  NOAA_SWPC_BASE: z.url().default('https://services.swpc.noaa.gov'),
  DEFAULT_LATITUDE: z.coerce.number().min(-90).max(90).default(29.5502),
  DEFAULT_LONGITUDE: z.coerce.number().min(-180).max(180).default(-95.097),

  GOOGLE_HEALTH_CLIENT_ID: optional,
  GOOGLE_HEALTH_CLIENT_SECRET: optional,
  GOOGLE_HEALTH_REDIRECT_URI: z.url().default('http://localhost:8787/api/providers/google-health/callback'),

  GARMIN_CLIENT_ID: optional,
  GARMIN_CLIENT_SECRET: optional,

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type Config = z.infer<typeof schema> & { isProduction: boolean }

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid configuration (check your .env, see .env.example):\n${problems}`)
  }
  const cfg = parsed.data
  if (cfg.NODE_ENV === 'production' && !cfg.APP_ORIGIN.startsWith('https://')) {
    throw new Error('APP_ORIGIN must be https:// in production (session cookies are Secure).')
  }
  return { ...cfg, isProduction: cfg.NODE_ENV === 'production' }
}
