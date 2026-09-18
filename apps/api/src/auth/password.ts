import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import {
  promisify,
} from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64) as Buffer
  return ['scrypt', salt, derived.toString('hex')].join('$')
}

export function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scrypt(password, parts[1], expected.length) as Promise<Buffer>
  return actual.then((result) => {
    if (expected.length !== result.length) return false
    return timingSafeEqual(expected, result)
  })
}
