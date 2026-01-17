.PHONY: help install build clean dev-server dev-worker start-server start-worker migrate seed lint test docker-up docker-down docker-clean docker-logs

# Default target
help:
	@echo "Birthday Message Scheduler - Available Commands"
	@echo "================================================"
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev-server   - Run server in dev mode (with hot reload)"
	@echo "  make dev-worker   - Run worker in dev mode (with hot reload)"
	@echo "  make dev          - Run both server and worker in dev mode (parallel)"
	@echo ""
	@echo "Production:"
	@echo "  make build        - Build TypeScript to dist/"
	@echo "  make start-server - Start production server"
	@echo "  make start-worker - Start production worker"
	@echo "  make start        - Start both server and worker (parallel)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    - Start Docker containers (Postgres, Redis)"
	@echo "  make docker-down  - Stop Docker containers"
	@echo "  make docker-clean - Stop and remove containers, volumes, networks"
	@echo "  make docker-logs  - Show Docker container logs"
	@echo "  make docker-ps    - Show running Docker containers"
	@echo "  make fresh        - Clean Docker volumes + migrate (full reset)"
	@echo ""
	@echo "Database:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make migrate-revert - Revert last migration"
	@echo "  make seed         - Seed database with test users"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test         - Run tests"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make test-cov     - Run tests with coverage"
	@echo "  make lint         - Run ESLint"
	@echo "  make lint-fix     - Run ESLint and auto-fix"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Remove dist/ and node_modules/"
	@echo "  make clean-dist   - Remove dist/ only"
	@echo "  make logs-server  - Show server logs (if using PM2)"
	@echo "  make logs-worker  - Show worker logs (if using PM2)"
	@echo ""

# Installation
install:
	@echo "Installing dependencies..."
	npm install

# Build
build:
	@echo "Building project..."
	npm run build

# Clean
clean:
	@echo "Cleaning project..."
	rm -rf dist node_modules

clean-dist:
	@echo "Cleaning dist directory..."
	rm -rf dist

# Development
dev-server:
	@echo "Starting development server..."
	npm run dev:server

dev-worker:
	@echo "Starting development worker..."
	npm run dev:worker

dev:
	@echo "Starting both server and worker in development mode..."
	@echo "Note: Use Ctrl+C to stop both processes"
	@trap 'kill 0' EXIT; \
	npm run dev:server & \
	npm run dev:worker & \
	wait

# Production
start-server:
	@echo "Starting production server..."
	npm run start:server

start-worker:
	@echo "Starting production worker..."
	npm run start:worker

start:
	@echo "Starting both server and worker in production mode..."
	@trap 'kill 0' EXIT; \
	npm run start:server & \
	npm run start:worker & \
	wait

# Docker
docker-up:
	@echo "Starting Docker containers..."
	docker-compose -f docker/docker-compose.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 3
	@echo "Docker containers started!"
	@echo "Run 'make docker-ps' to check status"

docker-down:
	@echo "Stopping Docker containers..."
	docker-compose -f docker/docker-compose.yml down
	@echo "Docker containers stopped!"

docker-clean:
	@echo "Cleaning up Docker (containers, volumes, networks)..."
	docker-compose -f docker/docker-compose.yml down -v --remove-orphans
	@echo "Docker cleanup complete!"

docker-logs:
	@echo "Showing Docker container logs..."
	docker-compose -f docker/docker-compose.yml logs -f

docker-logs-db:
	@echo "Showing PostgreSQL logs..."
	docker-compose -f docker/docker-compose.yml logs -f postgres

docker-logs-redis:
	@echo "Showing Redis logs..."
	docker-compose -f docker/docker-compose.yml logs -f redis

docker-ps:
	@echo "Docker containers status:"
	docker-compose -f docker/docker-compose.yml ps

docker-restart:
	@echo "Restarting Docker containers..."
	docker-compose -f docker/docker-compose.yml restart
	@echo "Docker containers restarted!"

# Database
migrate:
	@echo "Running database migrations (development)..."
	npm run migrate:run

migrate-prod:
	@echo "Running database migrations (production - from dist/)..."
	npm run migrate:run:prod

migrate-revert:
	@echo "Reverting last migration..."
	npm run migrate:revert

seed:
	@echo "Seeding database with test users..."
	npm run seed:users

# Testing
test:
	@echo "Running tests..."
	npm test

test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

test-cov:
	@echo "Running tests with coverage..."
	npm run test:coverage

# Linting
lint:
	@echo "Running ESLint..."
	npm run lint

lint-fix:
	@echo "Running ESLint with auto-fix..."
	npm run lint:fix

# Logs (for PM2 or other process managers)
logs-server:
	@echo "Showing server logs..."
	@if command -v pm2 > /dev/null; then \
		pm2 logs birthday-server; \
	else \
		echo "PM2 not installed. Use 'npm run dev:server' or check your process manager."; \
	fi

logs-worker:
	@echo "Showing worker logs..."
	@if command -v pm2 > /dev/null; then \
		pm2 logs birthday-worker; \
	else \
		echo "PM2 not installed. Use 'npm run dev:worker' or check your process manager."; \
	fi

# Quick setup for new environment
setup: install migrate
	@echo "Setup complete! Run 'make dev' to start development."

# Full setup with Docker
setup-docker: docker-up install
	@echo "Waiting for database to be ready..."
	@sleep 5
	@$(MAKE) migrate
	@echo "Docker setup complete! Run 'make dev' to start development."

# Full rebuild
rebuild: clean install build
	@echo "Rebuild complete!"

# Check project status
status:
	@echo "Project Status:"
	@echo "==============="
	@echo ""
	@echo "Dependencies:"
	@if [ -d "node_modules" ]; then \
		echo "  ✓ node_modules exists"; \
	else \
		echo "  ✗ node_modules missing (run 'make install')"; \
	fi
	@echo ""
	@echo "Build:"
	@if [ -d "dist" ]; then \
		echo "  ✓ dist/ exists"; \
	else \
		echo "  ✗ dist/ missing (run 'make build')"; \
	fi
	@echo ""
	@echo "Database:"
	@if [ -f ".env" ]; then \
		echo "  ✓ .env file exists"; \
	else \
		echo "  ✗ .env file missing"; \
	fi
	@echo ""

# Database connection test
db-test:
	@echo "Testing database connection..."
	@node -e "require('dotenv').config(); console.log('DB_HOST:', process.env.DB_HOST); console.log('DB_PORT:', process.env.DB_PORT); console.log('DB_NAME:', process.env.DB_DATABASE);"

# Redis connection test
redis-test:
	@echo "Testing Redis connection..."
	@node -e "require('dotenv').config(); console.log('REDIS_HOST:', process.env.REDIS_HOST); console.log('REDIS_PORT:', process.env.REDIS_PORT);"

# Quick development workflow
quick-start: docker-up
	@echo "Starting development environment..."
	@sleep 3
	@$(MAKE) dev

# Stop everything
stop-all: docker-down
	@echo "Stopping all processes..."
	@pkill -f "ts-node" || true
	@echo "All processes stopped!"

# Fresh start - clean everything and start over
fresh: docker-clean docker-up
	@echo "Waiting for database to be ready..."
	@sleep 5
	@echo "Running migrations with ts-node (development mode)..."
	@$(MAKE) migrate
	@echo "Fresh start complete! Database reset with latest migrations."
