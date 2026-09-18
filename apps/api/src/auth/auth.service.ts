import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import { hashPassword, verifyPassword } from './password.js'
import { createSessionToken, sessionCookie, clearCookie, readCookie, hashToken } from './session.js'

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const legacyOwnerId = '00000000-0000-4000-8000-000000000001'

function sessionExpiresAt() {
  return new Date(Date.now() + sessionLifetimeMs)
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(email: string, password: string, name?: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const passwordHash = await hashPassword(password)
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: normalizedEmail, passwordHash, name: name ?? null },
          select: { id: true, email: true, name: true },
        })
        // Workflows and executions that predate authentication belong to the
        // disabled legacy account; the first real account adopts them.
        await tx.workflow.updateMany({ where: { ownerId: legacyOwnerId }, data: { ownerId: created.id } })
        await tx.execution.updateMany({ where: { ownerId: legacyOwnerId }, data: { ownerId: created.id } })
        return created
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
    if (!user) throw new UnauthorizedException('Invalid email or password.')
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid email or password.')
    return this.createSession({ id: user.id, email: user.email, name: user.name })
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
}
