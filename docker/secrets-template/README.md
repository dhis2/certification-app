# Docker secret files (staging / production)

Compose production stacks expect **five plaintext files** on the host (mode `0444` typical) matching the filenames below.

Paths resolve as `${SECRETS_DIR:-./secrets}/<filename>` (see `compose.prod.yaml`).

```text
${SECRETS_DIR}/db_password
${SECRETS_DIR}/redis_password
${SECRETS_DIR}/jwt_secret
${SECRETS_DIR}/audit_log_hmac_key
${SECRETS_DIR}/seed_admin_password
```

`deploy.yml` writes the same paths from GitHub **Environment** secrets (`staging` / `production`).

## Per-file reference

| File | Purpose | Format | Generate (one-time) |
|------|---------|--------|---------------------|
| `db_password` | PostgreSQL app user password (`DB_PASSWORD_FILE` / `POSTGRES_PASSWORD_FILE`) | Single line, no newline preferred | `openssl rand -base64 32 \| tr -d '\n' > secrets/db_password` |
| `redis_password` | Redis `requirepass` | Single line | `openssl rand -base64 32 \| tr -d '\n' > secrets/redis_password` |
| `jwt_secret` | HS256 signing key for JWTs (API enforces ≥ 32 bytes) | Single line, base64 or long random string | `openssl rand -base64 48 \| tr -d '\n' > secrets/jwt_secret` |
| `audit_log_hmac_key` | HMAC key for audit log integrity chain | Single line | `openssl rand -base64 32 \| tr -d '\n' > secrets/audit_log_hmac_key` |
| `seed_admin_password` | Bootstrap admin (`RUN_SEEDS=true`); omit file if seeds disabled | Single line | `openssl rand -base64 24 \| tr -d '\n' > secrets/seed_admin_password` |

Use `tr -d '\n'` so the file does not include a trailing newline that could break auth comparisons.

## Rotation

1. Generate a new value into a **temporary** file (e.g. `secrets/jwt_secret.new`).
2. On the deploy host: replace the live file, `chmod 444` the secret files, recycle the services that read it (`docker compose up -d --force-recreate <service>` or full stack redeploy).
3. Update the matching secret in the GitHub **environment** so the next `deploy.yml` run does not overwrite the file with the old value.
4. For **database password** rotation: change Postgres password (superuser or `\password`), update the secret file and GitHub, recreate `dhis2-cert-db` only if your runbook requires it; migrations/API must use the same file content as the database.
5. Shred temporary files: `shred -u secrets/*.new` (or `rm` on systems without `shred`).

JWT rotation invalidates existing access/refresh tokens. Plan a short maintenance window or accept forced re-login.

## Local dev vs production compose

- **Default:** `docker compose` merges `compose.override.yaml` — no Docker `secrets:` block; use plaintext entries from `.env` (see `.env.example`, “Local development only”).
- **Prod-style locally:** copy this layout into `./secrets/`, set `SECRETS_DIR`, and run:

```bash
mkdir -p secrets
openssl rand -base64 32 | tr -d '\n' > secrets/db_password
openssl rand -base64 32 | tr -d '\n' > secrets/redis_password
openssl rand -base64 48 | tr -d '\n' > secrets/jwt_secret
openssl rand -base64 32 | tr -d '\n' > secrets/audit_log_hmac_key
openssl rand -base64 24 | tr -d '\n' > secrets/seed_admin_password
chmod 444 secrets/*
docker compose -f compose.yaml -f compose.prod.yaml --env-file .env up -d
```

Keep `secrets/` out of Git (repo `.gitignore`).
