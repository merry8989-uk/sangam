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
