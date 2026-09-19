import { describe, expect, it } from 'vitest'
import {
  clearOAuthStateCookie,
  createOAuthState,
  oauthStateCookie,
  oauthStateMatches,
  readOAuthStateCookie,
} from './oauth.js'

describe('OAuth state helpers', () => {
  it('creates a random state and round-trips it through the cookie', () => {
    const state = createOAuthState()
    const cookie = oauthStateCookie('google', state)

    expect(state.length).toBeGreaterThan(20)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(readOAuthStateCookie(cookie, 'google')).toBe(state)
    expect(oauthStateMatches(state, state)).toBe(true)
  })

  it('rejects missing or different OAuth state values', () => {
    const first = createOAuthState()
    const second = createOAuthState()

    expect(oauthStateMatches(first, second)).toBe(false)
    expect(oauthStateMatches(undefined, first)).toBe(false)
  })

  it('clears the provider state cookie', () => {
    expect(clearOAuthStateCookie('github')).toContain('Max-Age=0')
  })
})
