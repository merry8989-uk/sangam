#!/bin/sh
# Applies the Prisma schema on startup, then starts the server.
#
# `db push` is non-destructive by default: it will refuse a change that would
# drop data. For production, prefer committed migrations:
#   npx prisma migrate deploy
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[sangam] applying database schema (prisma db push)..."
  npx prisma db push --skip-generate || echo "[sangam] schema push failed - starting anyway"
fi

exec node server.js
