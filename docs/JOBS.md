docs/JOBS.md

## Backups

`POST /api/internal/run-backups` (header `x-internal-secret`) runs every user
backup that is due. Call it hourly; it decides internally who is due, so a
missed tick is harmless.

```
0 * * * * curl -fsS -X POST -H "x-internal-secret: $INTERNAL_SECRET" \
  http://web:3000/api/internal/run-backups
```

## History pruning

`POST /api/internal/prune-history` (header `x-internal-secret`) applies each
user's history policy. Run it daily.

Both history types are handled, and the policy decides the outcome:

| Mode | What the job does |
| --- | --- |
| keep | nothing - rows stay until the user clears them |
| auto | deletes rows older than the period |
| archive | moves rows older than the period to the archive |
| off | nothing - it stops new rows being written, it does not remove old ones |

`off` is deliberately not a deletion. Removing what someone already has, the
moment they flip a switch, is not what that switch says it does; clearing is a
separate, explicit action.

Watch and search are pruned independently, so a user can keep one and drop the
other.

```
0 4 * * * curl -fsS -X POST -H "x-internal-secret: $INTERNAL_SECRET" \
  http://web:3000/api/internal/prune-history
```

The job is idempotent: it only archives rows whose `archivedAt` is still null,
so running it twice does not reset an archive date or move the same row again.

## Log retention

`POST /api/internal/prune-logs` (header `x-internal-secret`) applies the log
retention policy. Run it daily.

Each category is kept for its own period - an audit trail for a year, trace
lines for three days - because they are not equally valuable and not equally
large. The periods are the defaults in `apps/web/src/lib/logger.ts`, overridable
with `LOG_RETENTION_JSON`:

```
0 4 * * * curl -fsS -X POST -H "x-internal-secret: $INTERNAL_SECRET" \
  http://web:3000/api/internal/prune-logs

LOG_RETENTION_JSON={"ERROR":180,"AUDIT":730}
```

A category set to `0` is kept forever and skipped. `GET` on the same path
returns the policy without deleting anything.

## Recovering stuck transcodes

`POST /api/internal/recover-transcodes` (header `x-internal-secret`). Run every
few minutes.

A post is created at `PROCESSING` when it has media. With
`MEDIA_QUEUE_ENABLED=true` the worker finishes it. With it **off**, the work runs
inside the request process, and a restart mid-encode leaves the post at
`PROCESSING` forever: the composer polls a status that will never change and the
user watches a spinner with no way out.

This job finds posts stuck longer than fifteen minutes and either puts them back
on the queue, or - when there is no queue to put them on - marks them `FAILED`,
so the composer can stop polling and say something true.

```
*/5 * * * * curl -fsS -X POST -H "x-internal-secret: $INTERNAL_SECRET" \
  http://web:3000/api/internal/recover-transcodes
```

`GET` on the same path reports how many would be recovered without touching
anything.
