# Docker secret files (staging / production)

Compose production stacks expect **five plaintext files** (mode `0444` on the server) matching the filenames below. Typical layout:

```text
${SECRETS_DIR}/db_password
${SECRETS_DIR}/redis_password
${SECRETS_DIR}/jwt_secret
${SECRETS_DIR}/audit_log_hmac_key
${SECRETS_DIR}/seed_admin_password
```

`deploy.yml` materializes these paths from GitHub Environment secrets (`documentation/staging-deployment-plan.md`, section 6.1).

Local dev with `docker compose` + `compose.override.yaml` skips `compose.prod.yaml`, so Compose does **not** mount `/run/secrets/*`; passwords come from `.env` only (`REDIS_PASSWORD`, `JWT_SECRET`, etc.). If you deliberately test the staging-style stack locally, clone this directory:

```bash
mkdir -p secrets
openssl rand -base64 24 | tr -d '\n' > secrets/db_password
openssl rand -base64 24 | tr -d '\n' > secrets/redis_password
openssl rand -base64 48 | tr -d '\n' > secrets/jwt_secret
openssl rand -base64 32 | tr -d '\n' > secrets/audit_log_hmac_key
openssl rand -base64 16 | tr -d '\n' > secrets/seed_admin_password
chmod 444 secrets/*
docker compose -f compose.yaml -f compose.prod.yaml --env-file .env up -d
```

Keep `secrets/` out of Git (glob is ignored via repo `.gitignore`).
