# HTTP action idempotency and crash recovery

The queued worker now uses these records for HTTP nodes. Stalled-job recovery
remains disabled until a later checkpoint.

## Identity and scope

- `HttpAction` is unique on `(executionId, nodeId)`. A BullMQ redelivery or an
  automatic workflow retry uses the same row and the same `idempotencyKey`.
- Generate a cryptographically random key when the row is created. Send it as
  `Idempotency-Key` on every outbound attempt. Reserve that header in HTTP node
  configuration so users cannot override it.
- Hash the node configuration and incoming context into `requestFingerprint`
  before sending. A different fingerprint for the same action is an error;
  never reuse a key for changed request content. A later refinement can hash
  only the fully interpolated outbound request.
- A manual retry creates a new execution and a new key. It is only available
  for `FAILED` executions; uncertain HTTP outcomes use `RECOVERY_REQUIRED`.

## State transitions

| Stored state | Meaning | Recovery behavior |
| --- | --- | --- |
| No row | No action has been prepared | Create action and attempt in a transaction |
| `PENDING` | No send has begun | Safe to send with the stored key |
| `IN_FLIGHT` | A send began; its outcome may be unknown | Stop and require reconciliation |
| `SUCCEEDED` | Response and result were committed | Reuse the saved response; do not send |
| `UNKNOWN_EXTERNAL_OUTCOME` | Outcome cannot be established safely | Pause execution for operator review; do not send |

Each outbound send has an `HttpActionAttempt` row. Create it before sending,
mark it `SENT` immediately before the call, and commit the successful response
and `SUCCEEDED` status in one database transaction. The engine must save each
HTTP result before executing the next node; saving only at workflow completion
leaves the current crash gap open. The execution context can be rebuilt from
saved node results in DAG order after recovery.

## Limits of the guarantee

The database and an external HTTP service cannot share an atomic transaction.
The `SENT` state is therefore ambiguous after a crash. A key only prevents a
duplicate effect when the destination honors idempotency keys with adequate
retention and matches repeated requests to the original result. For arbitrary
HTTP endpoints, fail closed in `UNKNOWN` rather than silently issue another
request. Do not assume GET, PUT, or DELETE is harmless to replay; the existing
in-process HTTP retries need the same policy.

## Worker reconciliation sequence

1. On startup, inspect old `RUNNING` executions and their BullMQ job state.
   Never reclaim a live job merely because its database timestamp is old.
2. Mark abandoned executions `RECOVERING` with a compare-and-set update.
   Rebuild prior node outputs from `SUCCEEDED` action rows.
3. For each `SENT` action, query a provider reconciliation endpoint if one is
   configured. Otherwise replay only when that provider explicitly supports
   the stored key; move to `UNKNOWN` if neither path is available.
4. Resume a job under a single worker claim. A repeated delivery must observe
   `SUCCEEDED` and reuse its result, or observe `UNKNOWN` and stop.
5. Enable a bounded positive BullMQ `maxStalledCount` only after startup scan,
   claim fencing, and the ambiguous-action path are tested with a killed worker.

The dashboard should show `RECOVERING` and `UNKNOWN` separately from ordinary
`RETRYING` and `FAILED`, including the action key and attempt history for
operator investigation. Avoid displaying the raw request body or secrets.

## Required tests before activating recovery

- Kill the worker after the remote side effect but before the local success
  commit; confirm redelivery does not cause a second effect.
- Kill it after the success commit but before the next node; confirm the saved
  response is reused and downstream variables are reconstructed.
- Deliver the same BullMQ job concurrently and verify only one worker claims it.
- Change the interpolated request under a reused key and verify rejection.
- Test providers both with and without idempotency support, automatic retries,
  manual retry, and a startup scan with live and abandoned jobs.
