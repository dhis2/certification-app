# DHIS2 Server Certification — Client

React (Vite) SPA using DHIS2 UI. Authenticated flows (assessments, templates, certificates) and a **public** certificate verification route (`/verify/:code`).

## Requirements

- Node.js (see `package.json` engines if specified)

## Setup

```bash
npm install
```

Point the client at the API (same-origin in production; development often uses a full URL):

```bash
# .env.local (example)
VITE_API_URL=http://127.0.0.1:8080/api/v1
```

## Run

```bash
npm run start           # Vite dev server (default port 3000)
npm run build
npm run start:e2e       # production preview for Playwright
```

## Tests

```bash
npm run lint
npm run test            # unit (Vitest)
npm run test:e2e        # Playwright — starts web server from config unless CI/reuse
```

E2E notes:

- `PLAYWRIGHT_BASE_URL` overrides the app origin (default `http://localhost:3000`).
- Template preview and some flows call the real API login; ensure the API is running with seeded admin credentials (see `e2e/fixtures/test-fixtures.ts`) or tests that require auth will skip.
- `npm run test:e2e -- --grep @smoke` — runs **mocked** public verification checks only (no live API). Full `npm run test:e2e` still needs API + seeded admin for login- and preview-based specs.

Verification UI does not display or download W3C Verifiable Credentials; it reflects registry lookup results from the API.

## Documentation

- Workspace overview: `../AGENTS.md`
- API and breaking changes: `../CHANGELOG.md`, `../api/README.md`
