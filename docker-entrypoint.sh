#!/bin/sh
set -e

# The SQLite database lives on a mounted volume (see docker-compose).
mkdir -p /data

echo "Applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "Starting the bot..."
exec node dist/index.js
