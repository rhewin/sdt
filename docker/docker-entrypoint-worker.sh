#!/bin/sh
set -e

echo "Starting worker initialization..."

# Wait a bit for app container to run migrations
echo "Waiting for migrations to complete..."
sleep 5

# Start the worker
echo "Starting worker..."
exec node dist/worker.js
