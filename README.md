# NexFlow

**NexFlow** is a visual workflow automation engine built with React, NestJS, PostgreSQL, Redis, and BullMQ.

It lets users design workflows as directed graphs, trigger them through webhooks or schedules, execute HTTP actions, inspect execution history, and recover safely from worker failures without blindly repeating uncertain external side effects.

> Status: **deployed**. Live at [https://nexflow-one.vercel.app](https://nexflow-one.vercel.app) — frontend on Vercel, API + Worker on Railway.
> Verified on September 22, 2026: the site returns HTTP 200 and `/api/ready` returns `{"status":"ready"}`.

## Live Demo

🌐 **[https://nexflow-one.vercel.app](https://nexflow-one.vercel.app)**

Hosted on Vercel (frontend) + Railway (NestJS API, BullMQ Worker, PostgreSQL, Redis).

## What NexFlow can do

- Visual drag-and-drop workflow editor
- Trigger, logic, delay, condition, and HTTP action nodes
- Directed-graph validation and execution
- Saved workflow versions in PostgreSQL
- Real webhook triggers
- Scheduled interval and cron triggers with explicit IANA timezones
- Background execution with Redis + BullMQ
- Automatic retries with execution attempt history
- Idempotent HTTP action persistence
- Worker leases and heartbeat fencing
- Crash reconciliation for abandoned executions
- Safe `RECOVERY_REQUIRED` handling when an external outcome is uncertain
- Execution history, retry lineage, and final per-node results for manual runs
- User registration, login, logout, and session-based authentication
- Google OAuth sign-in
- Per-user workflow and execution ownership
- Authenticated Socket.IO execution subscriptions
- A runnable starter workflow and visual results for manual test runs

## Architecture

```text
React + Vite
    │
    │ REST / Socket.IO
    ▼
NestJS API
    │
    ├── PostgreSQL
    │     ├── users + sessions
    │     ├── workflows + versions
    │     ├── executions + events
    │     ├── HTTP action checkpoints
    │     └── schedules + fired ticks
    │
    └── Redis / BullMQ
              │
              ▼
         Separate Worker
              │
              ├── Workflow Engine
              ├── HTTP Actions
              ├── Retry Handling
              └── Crash Reconciliation
```

## Reliability model

NexFlow treats PostgreSQL as the durable source of truth and Redis/BullMQ as the delivery layer.

For HTTP actions, each logical node execution receives a stable idempotency identity. A successful response is persisted before workflow execution continues. If a worker crashes after an external request may have been sent but before the result can be proven durable, NexFlow does **not** blindly resend it. The execution moves to `RECOVERY_REQUIRED`.

Queued workers also use execution leases and heartbeats. A stale leased execution can be reconciled and safely requeued only when its external action state is known.

BullMQ automatic stalled-job replay remains intentionally disabled:

```text
maxStalledCount: 0
```

Crash recovery is handled by NexFlow's own lease-aware reconciliation path instead.

## Scheduler behavior

Schedule nodes support:

- Interval schedules
- Cron expressions
- Explicit IANA timezones
- Startup synchronization from PostgreSQL
- Immediate registration updates after schedule edits or disablement
- Unique fired-tick persistence

Current misfire policy:

```text
Scheduler unavailable during scheduled time
        ↓
tick is missed
        ↓
service returns
        ↓
future ticks resume normally
```

Missed ticks are **not backfilled**. Ticks already retained in Redis may execute late after a worker returns.

Current overlap policy is **ALLOW**. If a workflow runs longer than its schedule interval, multiple executions may overlap.

See [the scheduler policy](docs/scheduler-policy.md) for the full policy.

## Authentication and ownership

NexFlow uses server-side sessions backed by PostgreSQL.

- Passwords are hashed with Node.js `scrypt`
- Session tokens are random 32-byte values
- Only a SHA-256 hash of the session token is stored in PostgreSQL
- Browser sessions use an `HttpOnly`, `SameSite=Lax` cookie
- Production session cookies also use `Secure`; logout revokes the session in PostgreSQL
- Authenticated users are redirected away from the login page, including after browser Back navigation
- Auth and workflow API responses set `Cache-Control: no-store`
- Production login, registration, and public webhook requests use Redis-backed rate limits
- Private workflow routes are owner-scoped
- Cross-account resource access returns `404`
- Public webhook triggering remains separate from dashboard authentication
- Socket.IO execution subscriptions validate the authenticated execution owner

Public webhook URLs continue to use each workflow's random webhook token:

```text
/api/hooks/<webhook-token>/...
```

External webhook senders do not need a NexFlow user account.

Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and matching `API_ORIGIN`/`WEB_ORIGIN` values. Register `${API_ORIGIN}/api/auth/oauth/google/callback` as an authorized redirect URI in Google Cloud. Use `localhost` consistently during local OAuth testing; switching between `localhost` and `127.0.0.1` can break the state cookie.

## Tech stack

### Frontend
- React 19
- TypeScript
- Vite
- React Router
- XYFlow / React Flow
- Socket.IO Client

### Backend
- NestJS 12
- TypeScript
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Zod
- cron-parser

### Testing and quality
- Vitest
- Node test runner for real-process contract tests
- Supertest
- oxlint
- TypeScript builds

## Verification

The repository includes unit, integration, E2E, webhook, scheduler, and worker recovery tests. Run the commands below against your own local PostgreSQL and Redis services before deployment. API and web production builds were verified during the latest local update.

## Repository structure

```text
Nexflow/
├── apps/
│   ├── api/        # NestJS API, worker, Prisma schema, queues, tests
│   └── web/        # React + Vite frontend
├── docs/
│   ├── deployment.md
│   └── scheduler-policy.md
└── README.md
```

## Local development

### Requirements

- Node.js
- npm
- PostgreSQL
- Redis

The example API environment uses PostgreSQL port `5433`. The root `docker-compose.yml` exposes PostgreSQL on `5432`; if using that container, change `DATABASE_URL` to port `5432`. Redis is not included in that Compose file and must be started separately.

### API

```bash
cd apps/api
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:dev
```

Run the worker in a separate terminal:

```bash
cd apps/api
npm run start:worker
```

### Web

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/socket.io` to the API on port `3000`. Keep the API running for login, saving, and manual runs.

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` for local development, then provide your own PostgreSQL and Redis connection strings. Set the Google OAuth values if you want Google sign-in.

Secrets and local `.env` files are not committed to the repository. See `docs/deployment.md` for the production topology and rollout checklist.

## Try the starter workflow

1. Sign in and open **New workflow** from the dashboard.
2. The starter graph is **Webhook → Condition → Delay**, with a Delay on each condition branch. Open **Test data** and set `{"amount":12500}` for the true branch or `{"amount":500}` for the false branch.
3. Click **Run workflow**. Manual runs execute through the API and show each node's final result. They require PostgreSQL but do not enqueue a BullMQ job.
4. Click **Save** to create a version and show the save confirmation banner. Select the Webhook node to copy its live endpoint.

Sending a request to the saved webhook endpoint is different from a manual run: webhook and scheduled executions require Redis and the separate worker process. The starter Delays demonstrate branching; add and configure an HTTP Request with a real destination when you want an external action. Example URLs such as `api.example.com` are placeholders and cannot be executed.

## Deployment note

Vercel can host the built frontend, but this app also needs a long-running NestJS API, a separate worker, PostgreSQL, Redis, and same-origin routing for `/api` and `/socket.io`. The current cookie and browser request setup assumes that topology. Follow [the deployment guide](docs/deployment.md) before publishing the app.

## Useful test commands

From `apps/api`:

```bash
npm test
npm run test:integration
npm run test:e2e
npm run test:webhooks
npm run test:recovery
npm run test:schedules
npm run lint
npm run build
```

From `apps/web`:

```bash
npm run lint
npm run build
```

## Roadmap

Completed major milestones include:

- Visual workflow workspace
- Typed node configuration and persistence
- Workflow execution engine
- PostgreSQL persistence
- Final per-node results for manual runs
- Real HTTP actions with SSRF protections
- Real webhooks
- BullMQ background processing
- Automatic retry controls
- HTTP idempotency
- Worker leases and heartbeat
- Crash reconciliation
- Scheduler / cron triggers
- Authentication and workflow ownership
- Protected real-time execution subscriptions

Next areas:

- Deployment to a public environment
- Production monitoring and observability
- Additional trigger/action integrations
- Optional AI-assisted workflow features

## Author

Built by **Anna Patricia B. Vida** as a portfolio project demonstrating full-stack development, distributed job processing, database design, reliability engineering, authentication, and workflow orchestration.
