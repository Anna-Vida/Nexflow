import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js'
import { AuthService } from './auth.service.js'
import { CurrentUser } from './current-user.decorator.js'
import type { OAuthProvider } from './oauth.js'

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(1024),
  name: z.string().max(128).optional(),
})

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const parsed = credentialsSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid email, name, and a password of at least 12 characters.')
    }

    const result = await this.auth.signup(parsed.data.email, parsed.data.password, parsed.data.name)
    response.setHeader('Set-Cookie', this.auth.getSessionCookie(result.token))
    return result.user
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const parsed = credentialsSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid email or password.')

    const result = await this.auth.login(parsed.data.email, parsed.data.password)
    response.setHeader('Set-Cookie', this.auth.getSessionCookie(result.token))
    return result.user
  }

  @Get('oauth/google')
  google(@Res() response: Response) {
    return this.beginOAuth('google', response)
  }

  @Get('oauth/google/callback')
  googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.completeOAuth('google', code, state, error, request, response)
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.headers.cookie)
    response.setHeader('Set-Cookie', this.auth.getClearCookie())
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return user
  }

  private beginOAuth(provider: OAuthProvider, response: Response) {
    try {
      const authorization = this.auth.oauthAuthorization(provider)

      response.setHeader(
        'Set-Cookie',
        this.auth.getOAuthStateCookie(provider, authorization.state),
      )

      return response.redirect(authorization.url)
    } catch {
      return response.redirect(
        `${this.auth.getWebOrigin()}/login?oauth=${provider}_not_configured`,
      )
    }
  }

  private async completeOAuth(
    provider: OAuthProvider,
    code: string | undefined,
    state: string | undefined,
    providerError: string | undefined,
    request: Request,
    response: Response,
  ) {
    const clearState = this.auth.getClearOAuthStateCookie(provider)
    const loginUrl = `${this.auth.getWebOrigin()}/login`

    if (
      providerError
      || !code
      || !this.auth.validOAuthState(provider, request.headers.cookie, state)
    ) {
      response.setHeader('Set-Cookie', clearState)
      return response.redirect(
        `${loginUrl}?oauth=${encodeURIComponent(providerError ?? 'invalid_state')}`,
      )
    }

    try {
      const result = await this.auth.oauthLogin(provider, code)

      response.setHeader('Set-Cookie', [
        clearState,
        this.auth.getSessionCookie(result.token),
      ])

      return response.redirect(`${this.auth.getWebOrigin()}/dashboard`)
    } catch {
      response.setHeader('Set-Cookie', clearState)
      return response.redirect(`${loginUrl}?oauth=failed`)
    }
  }
}
