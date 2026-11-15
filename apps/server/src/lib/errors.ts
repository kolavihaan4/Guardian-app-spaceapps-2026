export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details)
export const unauthorized = (message = 'Sign in required') => new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'forbidden', message)
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message)
export const conflict = (message: string) => new HttpError(409, 'conflict', message)

/** Upstream (NASA / wearable platform) failures. Never includes upstream bodies (may contain user data). */
export class UpstreamError extends Error {
  constructor(
    readonly upstream: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message)
  }
}
