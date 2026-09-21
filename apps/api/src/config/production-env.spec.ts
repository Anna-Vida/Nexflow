import { afterEach, describe, expect, it } from 'vitest';
import { validateProductionEnv } from './production-env.js';

const names = [
  'NODE_ENV', 'DATABASE_URL', 'REDIS_URL', 'WEB_ORIGIN', 'API_ORIGIN',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configureProduction() {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:password@database:5432/nexflow',
    REDIS_URL: 'redis://redis:6379',
    WEB_ORIGIN: 'https://nexflow.example',
    API_ORIGIN: 'https://nexflow.example',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
  });
}

describe('production environment', () => {
  it('accepts a complete same-origin HTTPS configuration', () => {
    configureProduction();
    expect(() => validateProductionEnv()).not.toThrow();
  });

  it('rejects missing Google credentials and split browser origins', () => {
    configureProduction();
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => validateProductionEnv()).toThrow('GOOGLE_CLIENT_SECRET');

    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.API_ORIGIN = 'https://api.example';
    expect(() => validateProductionEnv()).toThrow('same public origin');
  });
});
