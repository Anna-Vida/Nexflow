# NexFlow Deployment Guide

NexFlow has three runtime components:

1. **Web** — React/Vite frontend
2. **API** — NestJS HTTP + Socket.IO server
3. **Worker** — BullMQ workflow worker and crash reconciler

It also requires PostgreSQL and Redis.

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

See `scheduler-policy.md` for details.

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
