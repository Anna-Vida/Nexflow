import { createHash, randomBytes } from 'node:crypto'

const cookieName = 'nf_session'
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function sessionCookie(token: string) {
  return [
    `${cookieName}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${sessionLifetimeMs / 1000}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].join('; ')
}

export function clearCookie() {
  return [
    `${cookieName}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].join('; ')
}

export function readCookie(header: string | undefined) {
  const value = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
  return value?.slice(cookieName.length + 1)
}
