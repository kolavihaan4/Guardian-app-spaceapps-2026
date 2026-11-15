/**
 * Sign-in for the health app. It is the same Supabase client the home site uses, made once by
 * public/home/js/auth.js (index.html loads it before this app); this file only gives it types.
 * Errors it rejects with are already in plain words, ready to show.
 */
export interface GuardianUser {
  id: string
  email: string
}

export interface CardRow {
  id: string
  body: Record<string, unknown>
}

interface GuardianAuthApi {
  MIN_PASSWORD: number
  user(): Promise<GuardianUser | null>
  token(): Promise<string | null>
  signUp(email: string, password: string): Promise<GuardianUser | null>
  signIn(email: string, password: string): Promise<GuardianUser | null>
  signOut(): Promise<void>
  deleteAccount(): Promise<GuardianUser | null>
  cards: { list(): Promise<CardRow[]>; removeAll(): Promise<void> }
}

declare global {
  interface Window {
    GuardianAuth?: GuardianAuthApi
  }
}

/** The shortest password Supabase accepts for this project. */
export const MIN_PASSWORD = 8

const shared = (): GuardianAuthApi | undefined => (typeof window === 'undefined' ? undefined : window.GuardianAuth)
const need = (): GuardianAuthApi => {
  const a = shared()
  if (!a) throw new Error('Sign-in is not available right now. Please reload the page.')
  return a
}

export const auth = {
  /** The signed-in person, from the Supabase session, or null. */
  user: (): Promise<GuardianUser | null> => shared()?.user() ?? Promise.resolve(null),
  /** The access token sent to /api as a bearer token, or null when nobody is signed in. */
  token: (): Promise<string | null> => shared()?.token() ?? Promise.resolve(null),
  /** Why a new password is refused before it is sent, or null when it is long enough. */
  passwordProblem: (password: string): string | null => (password.length < MIN_PASSWORD ? `Use a password of at least ${MIN_PASSWORD} characters.` : null),
  signUp: async (email: string, password: string) => need().signUp(email, password),
  signIn: async (email: string, password: string) => need().signIn(email, password),
  signOut: async (): Promise<void> => {
    await shared()?.signOut()
  },
  /** Deletes the server's copy of the account, then the Supabase account and its cards, then signs out. */
  deleteAccount: async () => need().deleteAccount(),
  /** The person's cards, as the home site keeps them: each card's fields with its id. */
  cards: async (): Promise<Record<string, unknown>[]> => (await need().cards.list()).map((r) => ({ ...r.body, id: r.id })),
  deleteAllCards: async (): Promise<void> => need().cards.removeAll(),
}
