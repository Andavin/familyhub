#!/bin/sh
set -e
mkdir -p "$(dirname "${DATABASE_URL:-./data/familyhub.db}")"
node --import tsx ./src/lib/server/migrate.ts
exec "$@"
