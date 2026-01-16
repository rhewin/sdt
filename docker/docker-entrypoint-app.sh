#!/bin/sh
set -e

echo "Starting application initialization..."

# Run database migrations
echo "Running database migrations..."
npm run migrate:run:prod

# Start the application
echo "Starting server..."
exec node dist/server.js
