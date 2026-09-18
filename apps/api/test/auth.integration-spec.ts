import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('account sessions with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `auth-${randomUUID()}@example.test`;
  const password = 'a-long-test-password';
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule, AuthModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await app?.close();
  });

  it('signs up, stores a password hash and opaque session hash, and authenticates by cookie', async () => {
    const signup = await request(app.getHttpServer()).post('/api/auth/register')
      .send({ email: email.toUpperCase(), password }).expect(201);
    userId = signup.body.id;
    expect(signup.body.id).toBe(userId);
    expect(signup.body.email).toBe(email);
    cookie = signup.headers['set-cookie'][0].split(';')[0];
    expect(signup.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(signup.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toContain(password);
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    const session = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(cookie).not.toContain(session.tokenHash);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.id).toBe(userId);
    expect(me.body.email).toBe(email);
  });

  it('rejects a duplicate account and bad password, then revokes a logged-in session', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send({ email, password }).expect(409);
    await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: 'incorrect-password' }).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password }).expect(200);
    const secondCookie = login.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', secondCookie).expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', secondCookie).expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', secondCookie).expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
  });
});
