# DHIS2 Server Certification API

NestJS service for assessments, certification templates, certificate issuance, public verification by code, and audit logging.

## Requirements

- Node.js (see repo tooling)
- PostgreSQL
- Redis (optional for features that use it)

## Setup

```bash
npm install
cp ../.env.example ../.env   # or maintain env via compose; see root compose files
```

Apply migrations before starting against a new database:

```bash
npm run migration:run
```

Optional seed data:

```bash
npm run seed:template
```

## Run

```bash
npm run start:dev    # watch mode
npm run start:prod   # compiled `dist/`
```

## Certificates and verification

Certificates are stored in PostgreSQL with a unique **certificate number** and **verification code**. Verification endpoints check the registry and expiry/revocation state; there is **no** W3C VC issuance or embedded cryptographic proof on the payload.

Audit events (`CERTIFICATE_ISSUED`, `CERTIFICATE_REVOKED`, `CERTIFICATE_VERIFIED`) are recorded with HMAC-chained integrity when `AUDIT_LOG_HMAC_KEY` is configured (required in production per env validation).

## Configuration highlights

| Area | Variables (non-exhaustive) |
| --- | --- |
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` |
| Auth | `JWT_SECRET`, `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`, `JWT_TOKEN_AUDIENCE`, `JWT_TOKEN_ISSUER` |
| App | `APP_BASE_URL`, `CORS_ORIGIN`, `PORT`, `NODE_ENV` |
| Certificates | `CERTIFICATE_VALIDITY_DAYS`, `CERTIFICATE_RENEWAL_REMINDER_DAYS` |
| Audit | `AUDIT_LOG_HMAC_KEY` (base64; production requirement) |

Removed in the simplification release: all `VAULT_*`, `USE_VAULT`, `SIGNING_*`, `ISSUER_*` variables used for VC signing.

## Scripts

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
npm run migration:generate -- -n YourMigrationName
npm run migration:run
npm run migration:revert
```

OpenAPI / Swagger is served from the running app (path configured in `main.ts`).

## Documentation

- Workspace overview: `../AGENTS.md`
- DSCP template field parity: `../documentation/dscp-mustache-api-parity.md`
- Migration and VC removal plan: `../documentation/simplification-plan.md`
