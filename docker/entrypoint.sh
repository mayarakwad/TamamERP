#!/bin/sh
# Prepares a Tamam container on every start: a secret that survives restarts,
# the database migrations, and on first start either the demo data or the
# setup wizard (whose link and one-time key are printed in the logs).
set -e
cd /app
mkdir -p data storage

if [ -z "$APP_SECRET" ]; then
  if [ ! -s data/.app-secret ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > data/.app-secret
    chmod 600 data/.app-secret
    echo "[tamam] Generated APP_SECRET and saved it in the data volume (data/.app-secret). Back it up with the database: saved AI keys can't be read without it."
  fi
  APP_SECRET="$(cat data/.app-secret)"
  export APP_SECRET
fi

npx prisma migrate deploy

if [ "${TAMAM_DEMO:-0}" = "1" ] && [ ! -f data/.demo-loaded ]; then
  echo "[tamam] Loading the demo workspaces…"
  npx tsx prisma/seed.ts && touch data/.demo-loaded
fi

exec npx next start -p "${PORT:-3000}"
