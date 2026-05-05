import { existsSync, readFileSync } from 'node:fs';

/* eslint-disable security/detect-non-literal-fs-filename -- *_FILE targets are Compose mounts */

const PAIRS = [
  ['DB_PASSWORD', 'DB_PASSWORD_FILE'],
  ['REDIS_PASSWORD', 'REDIS_PASSWORD_FILE'],
  ['JWT_SECRET', 'JWT_SECRET_FILE'],
  ['OTP_ENCRYPTION_KEY', 'OTP_ENCRYPTION_KEY_FILE'],
  ['AUDIT_LOG_HMAC_KEY', 'AUDIT_LOG_HMAC_KEY_FILE'],
  ['SEED_ADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD_FILE'],
  ['MAIL_HOST', 'MAIL_HOST_FILE'],
  ['MAIL_USER', 'MAIL_USER_FILE'],
  ['MAIL_PASSWORD', 'MAIL_PASSWORD_FILE'],
] as const;

/**
 * Mirrors Docker secret mounts into conventional env vars so existing validation and
 * TypeORM config stay unchanged. Intended to run immediately before Nest bootstrap and
 * before any standalone DB scripts instantiate DataSource.
 */
export function hydrateSecretsFromFiles(): void {
  for (const [dest, srcVar] of PAIRS) {
    const srcPath = process.env[srcVar];
    if (
      typeof srcPath !== 'string' ||
      srcPath.length === 0 ||
      (typeof process.env[dest] === 'string' && process.env[dest]?.length !== 0)
    )
      continue;
    try {
      if (!existsSync(srcPath)) continue;
      process.env[dest] = readFileSync(srcPath, 'utf8').trim();
    } catch {
      // Surfaced by validators or DB connection failures.
    }
  }

  if (
    typeof process.env.DATABASE_SSL === 'string' &&
    (process.env.DB_SSL === undefined || process.env.DB_SSL === '')
  ) {
    process.env.DB_SSL = process.env.DATABASE_SSL === 'true' ? 'true' : 'false';
  }
}

// Run on import so secrets are available before AppModule loads ConfigModule
// (validate runs at module decorator eval, which is before bootstrap()).
hydrateSecretsFromFiles();
