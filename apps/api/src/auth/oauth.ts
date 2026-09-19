import { randomBytes, timingSafeEqual } from 'node:crypto'

export type OAuthProvider = 'google'

const stateLifetimeSeconds = 10 * 60

function stateCookieName(provider: OAuthProvider) {
  return `nf_oauth_state_${provider}`
}

export function createOAuthState() {
  return randomBytes(32).toString('base64url')
}

export function oauthStateCookie(provider: OAuthProvider, state: string) {
  return [
    `${stateCookieName(provider)}=${state}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${stateLifetimeSeconds}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function clearOAuthStateCookie(provider: OAuthProvider) {
  return [
    `${stateCookieName(provider)}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function readOAuthStateCookie(header: string | undefined, provider: OAuthProvider) {
  const name = stateCookieName(provider)
  const value = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return value?.slice(name.length + 1)
}

export function oauthStateMatches(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) return false

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)

  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function apiOrigin() {
  return (process.env.API_ORIGIN ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '')
}

export function webOrigin() {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')
}

export function oauthRedirectUri(provider: OAuthProvider) {
  return `${apiOrigin()}/api/auth/oauth/${provider}/callback`
}
