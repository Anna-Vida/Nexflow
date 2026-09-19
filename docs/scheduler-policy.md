# Scheduler policy

PostgreSQL stores schedule definitions and fired-tick records. BullMQ stores scheduler registrations and delivers ticks to the separate worker.

## Configuration

- A schedule trigger must be a root node, with no incoming edges.
- Interval schedules accept whole minutes from 1 through 525,600.
- Cron schedules require a valid expression and an explicit IANA timezone.
- Interval schedules use elapsed-minute boundaries; their timezone does not change the interval duration.
- A fired schedule snapshots the current saved workflow version and starts execution at its schedule node.

## Registration and edits

The API and worker synchronize registrations on startup and every 30 seconds. Saving a workflow also attempts an immediate synchronization. Failed synchronization is retried by the periodic process.

Changing schedule configuration increments its generation. Synchronization removes obsolete registrations before adding replacements. Disabled, removed, or stale-generation ticks cannot create new executions. Disabling a schedule does not cancel executions already created.

## Missed ticks and delayed delivery

NexFlow does not enumerate or backfill every interval missed during an outage. When a missing registration is restored, its start date is set to the next future interval boundary or cron occurrence.

A tick already retained in Redis can still be processed late when a worker returns; there is no age-based rejection in the tick handler. A persisted scheduled execution that remains queued is eligible for delivery again during synchronization. These pending deliveries are distinct from reconstructing missed ticks.

## Overlap and duplicate delivery

The overlap policy is **ALLOW**. A schedule can create another execution while a previous execution is still running. There is no per-schedule serialization or overlap suppression.

Each BullMQ tick ID has a unique PostgreSQL fired-tick record, created transactionally with its execution. Repeated delivery of that tick reuses the execution. This does not promise exactly-once external side effects; workflow HTTP checkpoints and recovery handling govern those outcomes.

## Operations

Keep PostgreSQL, Redis, and at least one separate worker available. The API alone does not consume schedule ticks. Worker downtime can delay delivery, and recreating Redis registrations does not reconstruct missed schedule history.

Verification lives in `apps/api/test/schedules.contract.mjs` and the schedule integration tests. See [deployment.md](deployment.md) for process and environment setup.
