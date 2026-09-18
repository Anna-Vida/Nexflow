<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Background webhook execution

Configure `DATABASE_URL` for PostgreSQL and `REDIS_URL` for Redis in the API's
local `.env` file. Redis defaults to `redis://127.0.0.1:6379`; use the same URL
for both API and worker. Configure Redis with `maxmemory-policy noeviction` and
persistence appropriate for your durability requirements.

For the Windows/WSL development setup, keep a WSL terminal open while using Redis
(WSL may shut down idle distributions, stopping their services):

```powershell
wsl -d Ubuntu -u root --exec sh -c 'service redis-server start; exec bash'
# In another terminal:
wsl -d Ubuntu --exec redis-cli ping
```

From the API directory, build once, then run the API and worker in separate terminals:

```bash
npm run build
npm run start:prod
# Separate terminal:
npm run start:worker
```

Webhooks return HTTP 202 after enqueueing; manual Run remains synchronous. Redis
holds execution IDs, while PostgreSQL holds workflow snapshots, inputs, results,
events, trigger IDs, and attempt history. Jobs waiting while the worker is stopped
are processed when it starts again. Failed jobs retry automatically up to 3 times
with exponential backoff (1s, 2s); the execution row records every attempt
(`attemptCount` / `maxAttempts` / `lastError`, event rows tagged per attempt) and
moves through QUEUED → RUNNING → RETRYING → FAILED. `POST
/api/workflows/executions/:id/retry` creates a fresh QUEUED execution linked
through `retriedFromId` (only FAILED executions, 409 otherwise); the dashboard
shows attempts, groups events per attempt, and offers Retry for failed runs.
BullMQ stalled-job replay stays disabled (`maxStalledCount: 0`). The worker
reconciler scans leased RUNNING executions whose heartbeat is over 30 seconds
old. It enqueues a one-attempt recovery job when HTTP actions are PENDING or
SUCCEEDED and marks uncertain outcomes RECOVERY_REQUIRED without resending.
Enqueue timeouts return 503 but cannot cancel a Redis command already in flight;
a job already claimed by the worker may still finish. Automatic retries reuse
durably saved HTTP results for the same execution and node. An HTTP request whose
outcome is uncertain stops in RECOVERY_REQUIRED instead of being resent.

To test this persistence boundary against PostgreSQL, start a disposable local
database, set `DATABASE_URL` to its connection string, then run from `apps/api`:

```bash
npx prisma migrate deploy
npm run test:integration
```

The integration suite fails when PostgreSQL or the HTTP action migration is
unavailable. It uses a local HTTP server and cleans up its execution rows.

Run `npm run test:webhooks` with PostgreSQL and Redis available. It launches its
own worker and uses Redis database 15 by default. Set `TEST_REDIS_URL` to override
this with a dedicated test database; do not run another worker against it.
Run `npm run test:recovery` for the real worker kill/restart contract. It uses
the same dedicated Redis test database and a local HTTP server.

## Saved schedules

Add a root Schedule node to a saved workflow, choose an interval or cron
expression, and set an explicit IANA timezone. Saving creates or updates the
schedule definition in PostgreSQL. BullMQ stores the corresponding job
scheduler and delivers ticks; each tick creates a normal QUEUED execution from
the workflow's current saved version. Repeated tick delivery uses one
`ScheduledFire` row and one execution. Disabling or removing a Schedule node
removes its BullMQ scheduler. API and worker startup restore scheduler metadata
from PostgreSQL, and a periodic sync repairs a missed Redis update.
Ticks missed while the scheduler is unavailable are not backfilled; future
ticks resume when service returns. Overlapping scheduled executions are allowed.

```text
Scheduler unavailable during a scheduled time
        ↓
the tick is missed
        ↓
service returns
        ↓
future scheduled ticks resume normally

No automatic historical backfill
```

Saving a workflow with an unchanged schedule keeps its BullMQ generation, while
editing or disabling the Schedule node removes the old registration before the
replacement is added. Concurrency is intentionally open: a 20-minute run on a
10-minute schedule may leave two active executions until overlap policies
(`ALLOW`, `SKIP_IF_RUNNING`, `QUEUE_ONE`) are added.

Run `npm run test:schedules` with PostgreSQL and Redis available to verify
registration, restart restoration, delivery, history, and disablement. It
uses Redis database 14 by default; set `TEST_REDIS_URL` to choose another
dedicated test database.

## Accounts and workflow ownership

`POST /api/auth/register` and `POST /api/auth/login` return the account and set an
HttpOnly, SameSite=Lax `nf_session` cookie with a seven-day lifetime. Passwords
are stored as `scrypt` hashes with a per-account salt and the database stores only
a SHA-256 hash of the opaque session token, so a leaked row cannot be replayed.
`GET /api/auth/me` reports the current account and `POST /api/auth/logout` revokes
the session.

Every dashboard route under `/api/workflows` requires that session and is
owner-scoped. Workflows, their versions, schedules, executions, retry history, and
webhook tokens are only visible to `ownerId`. Requests for another account's
workflow, execution, or schedule return `404 Not Found` rather than `403`, so
resource existence is never leaked.

Public webhook triggering stays separate from dashboard authentication:
`/api/hooks/<token>/...` keeps using the workflow's random `webhookToken`, so
external senders need no NexFlow account. The trigger creates the execution under
the workflow owner and the dashboard never reveals another account's token.

Socket.IO clients on the `/executions` namespace present the session cookie before
they may join an execution room, and `execution:subscribe` verifies the execution's
owner. Knowing an execution ID is not enough.

Workflows and executions created before authentication existed belong to a
disabled `legacy@nexflow.invalid` account; the first signup adopts them in the same
transaction that creates the account.

Run `npm run test:integration` with PostgreSQL to verify account sessions and the
ownership matrix (load, save, history, execution detail, retry, schedule
manipulation, live subscription, unauthenticated access, and public webhook
triggering). The web client signs in through `/login`; `RequireSession` keeps the
dashboard and workspace behind that session.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
