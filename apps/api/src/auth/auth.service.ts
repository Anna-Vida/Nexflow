import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import { hashPassword, verifyPassword } from './password.js'
import {
  createSessionToken,
  sessionCookie,
  clearCookie,
  readCookie,
  hashToken,
} from './session.js'
import {
  apiOrigin,
  clearOAuthStateCookie,
  createOAuthState,
  oauthRedirectUri,
  oauthStateCookie,
  oauthStateMatches,
  readOAuthStateCookie,
  webOrigin,
  type OAuthProvider,
} from './oauth.js'

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000

function sessionExpiresAt() {
  return new Date(Date.now() + sessionLifetimeMs)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(email: string, password: string, name?: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const passwordHash = await hashPassword(password)
    try {
      const user = await this.prisma.user.create({
        data: { email: normalizedEmail, passwordHash, name: name ?? null },
        select: { id: true, email: true, name: true },
      })
      return this.createSession(user)
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Email is already registered.')
      }
      throw error
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid email or password.')

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid email or password.')

    return this.createSession({ id: user.id, email: user.email, name: user.name })
  }

  oauthAuthorization(provider: OAuthProvider) {
    const state = createOAuthState()
    const redirectUri = oauthRedirectUri(provider)

    const clientId = this.requiredOAuthEnv('GOOGLE_CLIENT_ID')
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      include_granted_scopes: 'true',
    })

    return {
      state,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    }
  }

  async oauthLogin(provider: OAuthProvider, code: string) {
    const identity = await this.googleIdentity(code)

    return this.signInWithOAuth(
      provider,
      identity.providerAccountId,
      identity.email,
      identity.name,
    )
  }

  private async googleIdentity(code: string) {
    const clientId = this.requiredOAuthEnv('GOOGLE_CLIENT_ID')
    const clientSecret = this.requiredOAuthEnv('GOOGLE_CLIENT_SECRET')

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: oauthRedirectUri('google'),
      }),
    })

    const tokenData: unknown = await tokenResponse.json().catch(() => null)
    const accessToken = isRecord(tokenData) && typeof tokenData.access_token === 'string'
      ? tokenData.access_token
      : null

    if (!tokenResponse.ok || !accessToken) {
      throw new UnauthorizedException('Google sign-in could not be completed.')
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile: unknown = await profileResponse.json().catch(() => null)

    if (
      !profileResponse.ok
      || !isRecord(profile)
      || typeof profile.sub !== 'string'
      || typeof profile.email !== 'string'
      || profile.email_verified !== true
    ) {
      throw new UnauthorizedException('Google did not provide a verified email address.')
    }

    return {
      providerAccountId: profile.sub,
      email: profile.email.trim().toLowerCase(),
      name: typeof profile.name === 'string' ? profile.name : null,
    }
  }

  private async signInWithOAuth(
    provider: OAuthProvider,
    providerAccountId: string,
    email: string,
    name: string | null,
  ) {
    const user = await this.prisma.$transaction(async (tx) => {
      const linked = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId,
          },
        },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      })

      if (linked) return linked.user

      let user = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      })

      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash: null,
          },
          select: { id: true, email: true, name: true },
        })

      } else if (!user.name && name) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { name },
          select: { id: true, email: true, name: true },
        })
      }

      const existingProvider = await tx.oAuthAccount.findUnique({
        where: {
          userId_provider: {
            userId: user.id,
            provider,
          },
        },
      })

      if (existingProvider && existingProvider.providerAccountId !== providerAccountId) {
        throw new ConflictException(`A different ${provider} account is already linked to this NexFlow user.`)
      }

      if (!existingProvider) {
        await tx.oAuthAccount.create({
          data: {
            userId: user.id,
            provider,
            providerAccountId,
          },
        })
      }

      return user
    })

    return this.createSession(user)
  }

  private requiredOAuthEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured.`)
    }
    return value
  }

  private async createSession(user: { id: string; email: string; name?: string | null }) {
    const token = createSessionToken()
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: sessionExpiresAt() },
    })
    return { user, token }
  }

  async userFromCookie(header: string | undefined) {
    const token = readCookie(header)
    if (!token) return null

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true } } },
    })

    return session && session.expiresAt > new Date() ? session.user : null
  }

  async logout(header: string | undefined) {
    const token = readCookie(header)
    if (token) {
      await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
    }
  }

  getSessionCookie(token: string) {
    return sessionCookie(token)
  }

  getClearCookie() {
    return clearCookie()
  }

  getOAuthStateCookie(provider: OAuthProvider, state: string) {
    return oauthStateCookie(provider, state)
  }

  getClearOAuthStateCookie(provider: OAuthProvider) {
    return clearOAuthStateCookie(provider)
  }

  validOAuthState(
    provider: OAuthProvider,
    cookieHeader: string | undefined,
    receivedState: string | undefined,
  ) {
    return oauthStateMatches(
      readOAuthStateCookie(cookieHeader, provider),
      receivedState,
    )
  }

  getWebOrigin() {
    return webOrigin()
  }

  getApiOrigin() {
    return apiOrigin()
  }
}
