# NexFlow Deployment Guide

NexFlow has three runtime components:

1. **Web** — React/Vite frontend
2. **API** — NestJS HTTP + Socket.IO server
3. **Worker** — BullMQ workflow worker and crash reconciler

It also requires PostgreSQL and Redis.

## Vercel frontend + Railway backend

This repository includes `apps/web/vercel.mjs` and `apps/api/Dockerfile` for a split deployment. Use the public Vercel URL as the **single browser origin**. Vercel rewrites `/api/*` and `/socket.io/*` to the Railway API; the browser continues to use the Vercel host for cookies and Google OAuth.

1. Create Railway PostgreSQL and Redis services. Create two services from this repository, both with root directory `/apps/api` and the included Dockerfile. Use `node dist/main.js` for the API and `node dist/worker.js` for the worker. Only the API needs a public Railway domain.
2. Set `DATABASE_URL` and `REDIS_URL` on both Railway services using references to the managed databases. Set `NODE_ENV=production`, `WEB_ORIGIN=https://<vercel-domain>`, `API_ORIGIN=https://<vercel-domain>`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` on both. The production processes reject missing values or non-HTTPS origins.
3. Run `npx prisma migrate deploy` against the production database before starting the new API version. Railway's API pre-deploy command can run it from the built image.
4. Create a Vercel project with root directory `apps/web`. Set `NEXFLOW_API_ORIGIN=https://<railway-api-domain>` in the Vercel build environment, then deploy. The included Vercel configuration fails the build if this URL is missing.
5. Add `https://<vercel-domain>/api/auth/oauth/google/callback` to the Google OAuth client's authorized redirect URIs. Redeploy the API if the public Vercel domain changes.
6. Set the Railway API health check to `GET /api/ready`, which checks PostgreSQL and Redis. Then test a browser sign-in, saving a workflow, a manual run, a webhook POST, and a scheduled run. The last two require the Railway worker and Redis to be healthy.

Do not put a Railway database URL or Google client secret into a `VITE_` frontend variable. `NEXFLOW_API_ORIGIN` is a public host name used only to generate rewrites.

Production login, registration, and webhook routes use Redis-backed request limits. If Redis is unavailable, those routes return a service error rather than accepting unbounded requests.

## Recommended production topology

The current authentication model is intentionally **same-origin**. The browser uses relative `/api` and `/socket.io` URLs and the session cookie is `HttpOnly; SameSite=Lax`.

Use one public application origin and route traffic like this:

```text
https://nexflow.example.com
        │
        ├── /              → built React app
        ├── /api/*         → NestJS API
        └── /socket.io/*   → NestJS API / Socket.IO

Private infrastructure
        ├── PostgreSQL
        ├── Redis
        └── BullMQ worker
```

The worker should not expose a public HTTP port.

If the frontend and API are deployed on different browser origins later, add explicit CORS configuration, credentialed frontend requests, a configurable API/WebSocket base URL, and a production cross-site cookie policy before using that topology.

## Required API environment

Copy `apps/api/.env.example` as a starting point.

Required:

```text
DATABASE_URL=
REDIS_URL=
NODE_ENV=production
PORT=3000
WEB_ORIGIN=https://<vercel-domain>
API_ORIGIN=https://<vercel-domain>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Use provider-generated PostgreSQL and Redis connection strings in production. Do not commit them.

## Database migration

Run migrations before starting a new API version:

```bash
cd apps/api
npm ci
npx prisma migrate deploy
npm run build
```

Never use `prisma migrate dev` as the production deployment command.

## API process

Start the compiled NestJS API with:

```bash
cd apps/api
npm run start:prod
```

Health check:

```text
GET /api/health
```

`GET /api/health` reports only API process liveness. Use `GET /api/ready` for deployment readiness; it returns `503` if PostgreSQL or Redis is unavailable.

Expected shape:

```json
{
  "status": "ok",
  "service": "nexflow-api",
  "timestamp": "..."
}
```

## Worker process

Run a separate long-lived process from the same API build:

```bash
cd apps/api
npm run start:worker
```

The worker and API must use the same `DATABASE_URL` and `REDIS_URL`.

NexFlow intentionally keeps BullMQ `maxStalledCount: 0`. Worker crash recovery is handled through PostgreSQL execution leases, heartbeats, idempotent HTTP checkpoints, and the crash reconciler.

## Web build

Build the frontend with:

```bash
cd apps/web
npm ci
npm run build
```

Serve `apps/web/dist` from the public application origin and proxy `/api` and `/socket.io` to the NestJS API.

## Scheduler requirements

At least one worker process must stay online for scheduled workflow execution and crash reconciliation.

Current scheduler behavior:

- PostgreSQL is the schedule source of truth.
- BullMQ delivers scheduled ticks.
- Missed ticks during a full scheduler outage are not backfilled.
- Overlapping scheduled executions are allowed.
- Startup synchronization restores Redis scheduler registrations from PostgreSQL.

Ticks already retained in Redis may execute late after worker recovery; missed-tick backfill is separate from pending delivery. See [the scheduler policy](scheduler-policy.md) for details.

## Pre-deployment verification

From `apps/api`:

```bash
npm ci
npx prisma migrate deploy
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run test:webhooks
npm run test:schedules
npm run test:recovery
```

From `apps/web`:

```bash
npm ci
npm run lint
npm run build
```

The GitHub Actions CI workflow runs the same core verification against temporary PostgreSQL and Redis services.

## Production checklist

- PostgreSQL backups are enabled.
- Redis uses an appropriate durability policy and `noeviction` behavior for the queue workload.
- API and worker use the same database and Redis deployment.
- `NODE_ENV=production`.
- TLS/HTTPS is enabled at the public origin.
- The API health endpoint is monitored.
- Real secrets exist only in the hosting platform's secret/environment store.
- Database migrations complete before API/worker rollout.
- Webhook URLs use HTTPS.
- Worker process is configured to restart after process or host failure.
