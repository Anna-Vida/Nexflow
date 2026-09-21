const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'WEB_ORIGIN',
  'API_ORIGIN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

export function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  for (const name of required) {
    if (!process.env[name]?.trim()) throw new Error(`${name} must be configured in production.`);
  }

  const webOrigin = new URL(process.env.WEB_ORIGIN!);
  const apiOrigin = new URL(process.env.API_ORIGIN!);
  if (webOrigin.protocol !== 'https:' || apiOrigin.protocol !== 'https:') {
    throw new Error('WEB_ORIGIN and API_ORIGIN must use HTTPS in production.');
  }
  for (const origin of [webOrigin, apiOrigin]) {
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('WEB_ORIGIN and API_ORIGIN must be HTTPS origins without paths or credentials.');
    }
  }
  if (webOrigin.origin !== apiOrigin.origin) {
    throw new Error('WEB_ORIGIN and API_ORIGIN must be the same public origin.');
  }
}
