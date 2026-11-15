import pino, { type DestinationStream, type Logger } from 'pino'

/**
 * Logging policy: logs carry operational metadata only (method, route, status,
 * duration, provider id, counts). They never carry request/response bodies,
 * query strings (OAuth codes live there), cookies, tokens, emails or any health
 * value. The redact list is a second line of defence for accidental objects.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.email',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.code',
  '*.code_verifier',
  '*.value',
  '*.values',
  '*.metrics',
  '*.body',
]

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      base: { app: 'astrovitals' },
    },
    destination,
  )
}

/** Strip the query string: "/api/x?code=abc" -> "/api/x". */
export function safePath(url: string): string {
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}
