# NexFlow

**NexFlow** is a visual workflow automation engine built with React, NestJS, PostgreSQL, Redis, and BullMQ.

It lets users design workflows as directed graphs, trigger them through webhooks or schedules, execute HTTP actions, inspect execution history, and recover safely from worker failures without blindly repeating uncertain external side effects.

> Status: portfolio release candidate. Authentication, workflow ownership, reliability controls, scheduling, and CI are implemented; deployment readiness is documented.

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
- Execution history, retry lineage, and live status updates
- User registration, login, logout, and session-based authentication
- Per-user workflow and execution ownership
- Authenticated Socket.IO execution subscriptions

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

Missed ticks are **not backfilled**.

Current overlap policy is **ALLOW**. If a workflow runs longer than its schedule interval, multiple executions may overlap.

See `docs/scheduler-policy.md` for the full policy.

## Authentication and ownership

NexFlow uses server-side sessions backed by PostgreSQL.

- Passwords are hashed with Node.js `scrypt`
- Session tokens are random 32-byte values
- Only a SHA-256 hash of the session token is stored in PostgreSQL
- Browser sessions use an `HttpOnly`, `SameSite=Lax` cookie
- Private workflow routes are owner-scoped
- Cross-account resource access returns `404`
- Public webhook triggering remains separate from dashboard authentication
- Socket.IO execution subscriptions validate the authenticated execution owner

Public webhook URLs continue to use each workflow's random webhook token:

```text
/api/hooks/<webhook-token>/...
```

External webhook senders do not need a NexFlow user account.

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

## Current verification

At the authentication + ownership checkpoint:

- Unit tests: **18/18**
- PostgreSQL integration tests: **21/21**
- E2E tests: **1/1**
- Scheduler integration tests: **12/12** at the scheduler checkpoint
- Webhook contract tests: **11/11**
- Real worker crash/restart tests: **2/2**
- Real schedule contract: **1/1**
- API and web builds pass
- Lint passes
- Prisma migration status is up to date

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

The Vite development server runs the NexFlow frontend locally.

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` for local development, then provide your own PostgreSQL and Redis connection strings.

Secrets and local `.env` files are not committed to the repository. See `docs/deployment.md` for the production topology and rollout checklist.

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
- Live execution updates
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
