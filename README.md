# DHIS2 Server Certification App

NestJS API + React client for DHIS2 server certification assessments and W3C Verifiable Credential issuance.

## Prerequisites

- Docker and Docker Compose v2+
- Node.js 24+ (for running tests or scripts outside Docker)

## Development Setup

### 1. Create `.env`

```sh
cp .env.example .env
```

The defaults work as-is for local development. The seed creates an admin user with credentials printed to the migration container logs.

### 2. Start everything

```sh
docker compose up --build -d
```

This runs:

| Service | Port | What it does |
|---|---|---|
| `dhis2-cert-db` | 5432 | PostgreSQL 18 |
| `dhis2-cert-redis` | 6379 | Redis 7 |
| `dhis2-cert-migrations` | — | Runs TypeORM migrations + seeds, then exits |
| `dhis2-cert-api` | 3001 | NestJS API with hot reload (`nest start --debug --watch`) |
| `dhis2-cert-client` | 3000 | Vite dev server with HMR |

The `compose.override.yaml` is auto-merged by Docker Compose — it swaps production images for local builds, mounts source code for hot reload, and exposes ports on `127.0.0.1`.

### 3. Verify

```sh
# API health
curl http://localhost:3001/health/live

# Client
open http://localhost:3000
```

API docs (Swagger): http://localhost:3001/api/v1/docs

### Vault (optional)

For testing Vault-backed signing instead of ephemeral keys:

```sh
docker compose --profile vault up --build -d
```

Set `USE_VAULT=true` in `.env`. The dev Vault runs in `-dev` mode with a root token of `dev-root-token` and auto-initializes the transit engine.

## Running Without Docker

If you prefer running the API and client natively (DB and Redis still in Docker):

```sh
# Start only the infrastructure
docker compose up -d dhis2-cert-db dhis2-cert-redis

# API
cd api
npm ci
npm run migration:run
npm run seed
npm run start:dev

# Client (separate terminal)
cd client
npm ci
npm start
```

## Common Commands

```sh
# Logs
docker compose logs -f dhis2-cert-api
docker compose logs dhis2-cert-migrations

# Rebuild after Dockerfile changes
docker compose up --build -d

# Stop
docker compose down

# Stop and wipe volumes (full reset)
docker compose down -v

# Skip migrations on restart
SKIP_MIGRATIONS=true docker compose up -d

# Re-run seeds only
docker compose run --rm dhis2-cert-migrations sh -c "npm run seed"
```

## Tests

```sh
# API unit tests
cd api && npm test

# Client unit tests
cd client && npm test

# E2E (requires dev stack running)
cd client && npm run test:e2e
```

## Project Structure

```
api/             NestJS backend (TypeORM, JWT auth, W3C VCs)
client/          React frontend (DHIS2 UI, Vite)
docker/          Init scripts, Vault config, nginx config
compose.yaml     Base config (production-oriented)
compose.override.yaml  Dev overrides (auto-merged)
compose.prod.yaml      Production security hardening
```
