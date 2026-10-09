# Background jobs

Two periodic jobs keep the app healthy. Both are plain HTTP endpoints protected
by a shared secret (`INTERNAL_SECRET`), so any scheduler can drive them -
cron, a Kubernetes CronJob, or a platform scheduler.

## 1. Flush counters (every few minutes)

View counts are buffered in Redis and written to Postgres in batches.

```bash
*/5 * * * * curl -fsS -X POST http://localhost:3000/api/internal/flush-counters \
  -H "x-internal-secret: $INTERNAL_SECRET"
```

## 2. Run scheduled agent tasks (every minute)

Executes each agent's due `scheduledTasks` and stores the result as a chat
session. Cron expressions support minute and hour fields, e.g. `0 9 * * *`.

```bash
* * * * * curl -fsS -X POST http://localhost:3000/api/internal/run-scheduled \
  -H "x-internal-secret: $INTERNAL_SECRET"
```

## 3. Media enrichment worker

Video posts are handed to a Redis queue (`queue:media`) and processed by the
standalone worker in `apps/worker`. Enable it with `MEDIA_QUEUE_ENABLED=true`
and run the worker service (it is already in docker-compose). The worker calls
the internal enrich endpoint and re-queues on failure, up to three attempts.

## 4. Sweep expired stories (every 15 minutes)

Stories expire 24 hours after posting. Expiry is enforced on read, but this job
deletes the rows and their stored objects so they do not accumulate.

```bash
*/15 * * * * curl -fsS -X POST http://localhost:3000/api/internal/sweep-stories \
  -H "x-internal-secret: $INTERNAL_SECRET"
```

## 5. Reindex search (one-off, after enabling Meilisearch)

```bash
curl -fsS -X POST http://localhost:3000/api/internal/reindex \
  -H "x-internal-secret: $INTERNAL_SECRET"
```

## Notes

- Both endpoints are idempotent per run window: the counter flush takes a Redis
  lock, and the scheduler de-duplicates per agent/task/minute.
- Neither should be exposed publicly; keep them behind the secret and, in
  production, an internal network.
