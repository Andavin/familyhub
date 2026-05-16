#!/bin/sh
set -e

# Apply pending migrations before starting the app. The migrator
# creates the data dir itself if it's missing.
node /app/migrate.mjs

exec "$@"
