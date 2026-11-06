# Setup guide

## Local environment

Use the commands in the repository README. Backend working directory is the repository root; running from another directory changes the relative SQLite database location. Frontend working directory is `frontend`. The backend binds to loopback for local development. Vite proxies `/api` and `/ws`; opening the frontend at localhost:5173 avoids cross-origin setup. The frontend does not need an environment secret.

Python 3.11+ is required by type annotations and asyncio behavior; 3.12 was tested. Node 22+ is supported; Node 24 was tested. npm or pnpm can install the frontend. The committed pnpm lockfile is used by Docker and CI. On this managed machine the installed package manager entry point was `node C:/Users/N.ASRITHAREDDY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs --dir frontend install`; this machine-specific path is not required on a normal installation.

Environment:

- `DATABASE_URL`: SQLAlchemy URL; defaults to `sqlite:///./grocery.db`.
- `JWT_SECRET`: random stable signing value, minimum 32 characters. Required for production. Do not commit it.
- `ENVIRONMENT`: `production` enforces the secret requirement.
- `CORS_ORIGINS`: comma-separated exact origins; defaults to localhost ports 5173 and 8080.
- `REDIS_URL`: optional; if configured, Redis must be reachable at startup. Without it, WebSocket event transport is in-process. Redis latest-state entries expire after 300 seconds.
- `RECOMMENDATION_WEIGHTS`: JSON list of five nonnegative weights summing to 1.

Example PowerShell local configuration (substitute your own random value):

```powershell
$env:JWT_SECRET = 'your-own-random-value-with-at-least-32-characters'
$env:CORS_ORIGINS = 'http://localhost:5173'
```

Use `python -c "import secrets; print(secrets.token_hex(32))"` to generate a secret privately. No credentials need to be sent to an external AI service.

## Migrations and seed data

Run `python -m alembic upgrade head` before startup for a versioned schema. Startup also initializes a fresh schema and idempotently inserts the catalog if products are absent. `python -m data.seed_data` can seed manually. Nutrition remains unknown in the sample seed. To reset demo data, stop the backend and deliberately choose a new database path; the app never automatically deletes your database. Back up production data before migrations.

## PostgreSQL and Redis

Docker Compose supplies service DNS names `db` and `redis`. For locally installed PostgreSQL, set a `postgresql+psycopg://...` URL and run migrations. No SQLite-specific queries are used for application updates; SQLite-only PRAGMA configuration is conditional. Database compatibility is implemented but PostgreSQL runtime was not verified on this host. Redis has no exposed host port in Compose. For local installation use a reachable Redis URL and install the Python requirements.

## Docker and hosting

Copy `.env.example` to `.env`, replace placeholder secrets, and run `docker compose config` to validate interpolation, then `docker compose up --build`. Nginx listens on host loopback port 8080. Healthchecks gate service ordering. PostgreSQL data persists in a named volume. Frontend and backend images use separate build stages/services. Backend runs as a non-root user. The backend Docker command migrates before serving.

Docker was not available for runtime validation here. Before production, run the complete suite against PostgreSQL/Redis, verify WebSocket fan-out, put HTTPS in front of Nginx, and use an appropriate shared limiter and job queue if adding multiple workers. Do not expose sample accounts or reuse development secrets.
