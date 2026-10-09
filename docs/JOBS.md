docs/JOBS.md

## Backups

`POST /api/internal/run-backups` (header `x-internal-secret`) runs every user
backup that is due. Call it hourly; it decides internally who is due, so a
missed tick is harmless.

```
0 * * * * curl -fsS -X POST -H "x-internal-secret: $INTERNAL_SECRET" \
  http://web:3000/api/internal/run-backups
```
