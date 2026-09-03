import { z } from 'zod';

const BOOLEAN_ENV_KEYS = [
  'DB_SSL',
  'MAIL_ENABLED',
  'MAIL_SECURE',
  'AUDIT_RETENTION_ARCHIVE',
  'AUDIT_RETENTION_AUTO_CLEANUP',
  'MONITORING_ENABLED',
] as const;

/** `Boolean("false")` is true — do not use `z.coerce.boolean()` for env strings. */
export function parseEnvBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  ) {
    return true;
  }
  if (
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === 'off'
  ) {
    return false;
  }
  return undefined;
}

function normalizeEnvBooleans(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...config };
  for (const key of BOOLEAN_ENV_KEYS) {
    if (!(key in next)) continue;
    const parsed = parseEnvBoolean(next[key]);
    if (parsed !== undefined) next[key] = parsed;
  }
  return next;
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3001),

  // Database configuration
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('dhis2_certification'),
  DATABASE_SSL: z.enum(['true', 'false']).optional(),
  DB_SSL: z.boolean().default(false),

  // JWT configuration
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),
  JWT_TOKEN_AUDIENCE: z.string().default('localhost'),
  JWT_TOKEN_ISSUER: z.string().default('localhost'),
  JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('HS256'),

  // Application configuration
  APP_BASE_URL: z.string().url().optional(),

  // Upload configuration
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB
  ALLOWED_MIME_TYPES: z.string().optional(),

  // Rate limiting configuration
  THROTTLE_TTL: z.coerce.number().default(60000),
  THROTTLE_LIMIT: z.coerce.number().default(100),
  THROTTLE_AUTH_LIMIT: z.coerce.number().default(5),

  // Mail configuration
  MAIL_ENABLED: z.boolean().default(true),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().default(587),
  MAIL_SECURE: z.boolean().default(false),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('DHIS2 Server Certification'),
  MAIL_FROM_ADDRESS: z.string().email().default('no-reply@dhis2.org'),

  // Redis configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Audit log HMAC key (base64-encoded, 256+ bits recommended)
  AUDIT_LOG_HMAC_KEY: z.string().optional(),

  // Retention policy configuration
  AUDIT_RETENTION_DEFAULT_DAYS: z.coerce.number().default(90),
  AUDIT_RETENTION_SECURITY_DAYS: z.coerce.number().default(365), // Auth events
  AUDIT_RETENTION_CERTIFICATE_DAYS: z.coerce.number().default(730), // 2 years
  AUDIT_RETENTION_ARCHIVE: z.boolean().default(true),
  AUDIT_RETENTION_BATCH_SIZE: z.coerce.number().default(1000),
  AUDIT_RETENTION_AUTO_CLEANUP: z.boolean().default(true),

  // Certificate validity (days)
  CERTIFICATE_VALIDITY_DAYS: z.coerce.number().min(30).max(1825).default(730),
  CERTIFICATE_RENEWAL_REMINDER_DAYS: z.coerce.number().default(60),

  // Monitoring and alerting
  MONITORING_ENABLED: z.boolean().default(true),
  MONITORING_CERT_EXPIRY_WARNING_DAYS: z.coerce.number().default(30),
  MONITORING_ERROR_RATE_THRESHOLD: z.coerce.number().min(0).max(100).default(5),
  MONITORING_METRICS_INTERVAL_MS: z.coerce.number().default(60000),
  MONITORING_ALERT_WEBHOOK_URL: z.string().url().optional(),
  MONITORING_SLACK_WEBHOOK_URL: z.string().url().optional(),
});

interface ProductionValidationError {
  field: string;
  message: string;
  reference?: string;
}

function validateProductionSecrets(
  config: z.infer<typeof envSchema>,
): ProductionValidationError[] {
  const errors: ProductionValidationError[] = [];

  if (!config.JWT_SECRET) {
    errors.push({
      field: 'JWT_SECRET',
      message: 'JWT_SECRET must be set in production (min 32 characters)',
      reference: 'OWASP Session Management Cheat Sheet',
    });
  } else if (config.JWT_SECRET.length < 64) {
    errors.push({
      field: 'JWT_SECRET',
      message:
        'JWT_SECRET should be at least 64 characters for production security',
      reference: 'NIST SP 800-132',
    });
  }

  if (!config.APP_BASE_URL) {
    errors.push({
      field: 'APP_BASE_URL',
      message:
        'APP_BASE_URL must be set in production for public links and integrations',
      reference: 'OWASP Secure Configuration',
    });
  } else if (!config.APP_BASE_URL.startsWith('https://')) {
    errors.push({
      field: 'APP_BASE_URL',
      message: 'APP_BASE_URL must use HTTPS in production',
      reference: 'OWASP Transport Layer Security Cheat Sheet',
    });
  }

  if (config.DB_PASSWORD === 'postgres' || config.DB_PASSWORD === '') {
    errors.push({
      field: 'DB_PASSWORD',
      message: 'DB_PASSWORD must not use default or empty value in production',
      reference: 'OWASP Database Security Cheat Sheet',
    });
  }

  const postgresInDockerNetwork =
    config.DB_HOST === 'dhis2-cert-db' ||
    config.DB_HOST === 'localhost' ||
    config.DB_HOST === '127.0.0.1';

  if (!config.DB_SSL && !postgresInDockerNetwork) {
    errors.push({
      field: 'DB_SSL',
      message:
        'DB_SSL/DATABASE_SSL should be enabled in production unless the DB is trusted (e.g. internal compose service)',
      reference: 'OWASP Database Security Cheat Sheet',
    });
  }

  if (config.MAIL_ENABLED) {
    if (!config.MAIL_HOST) {
      errors.push({
        field: 'MAIL_HOST',
        message: 'MAIL_HOST must be set when mail is enabled in production',
        reference: 'OWASP Secure Configuration',
      });
    }
    if (!config.MAIL_USER || !config.MAIL_PASSWORD) {
      errors.push({
        field: 'MAIL_USER / MAIL_PASSWORD',
        message:
          'Mail credentials should be configured when mail is enabled in production',
        reference: 'OWASP Secure Configuration',
      });
    }
    if (!config.MAIL_SECURE && config.MAIL_PORT !== 587) {
      errors.push({
        field: 'MAIL_SECURE',
        message: 'MAIL_SECURE should be true or use port 587 with STARTTLS',
        reference: 'OWASP Transport Layer Security',
      });
    }
  }

  if (!config.AUDIT_LOG_HMAC_KEY) {
    errors.push({
      field: 'AUDIT_LOG_HMAC_KEY',
      message:
        'AUDIT_LOG_HMAC_KEY must be set in production for audit log integrity (base64-encoded, 256+ bits)',
      reference: 'NIST SP 800-92 - Guide to Computer Security Log Management',
    });
  } else {
    try {
      const keyBytes = Buffer.from(config.AUDIT_LOG_HMAC_KEY, 'base64');
      if (keyBytes.length < 32) {
        errors.push({
          field: 'AUDIT_LOG_HMAC_KEY',
          message:
            'AUDIT_LOG_HMAC_KEY should be at least 256 bits (32 bytes) for production security',
          reference:
            'FIPS 198-1 - The Keyed-Hash Message Authentication Code (HMAC)',
        });
      }
    } catch {
      errors.push({
        field: 'AUDIT_LOG_HMAC_KEY',
        message: 'AUDIT_LOG_HMAC_KEY must be valid base64-encoded data',
        reference: 'NIST SP 800-92',
      });
    }
  }

  if (config.AUDIT_RETENTION_DEFAULT_DAYS < 90) {
    errors.push({
      field: 'AUDIT_RETENTION_DEFAULT_DAYS',
      message:
        'AUDIT_RETENTION_DEFAULT_DAYS should be at least 90 days per NIST SP 800-92',
      reference: 'NIST SP 800-92 - Guide to Computer Security Log Management',
    });
  }

  return errors;
}

function validateStagingSecrets(
  config: z.infer<typeof envSchema>,
): ProductionValidationError[] {
  const errors: ProductionValidationError[] = [];

  if (!config.JWT_SECRET) {
    errors.push({
      field: 'JWT_SECRET',
      message: 'JWT_SECRET must be set in staging environment',
      reference: 'OWASP Session Management',
    });
  }

  return errors;
}

export function envValidationSchema(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const merged = normalizeEnvBooleans({ ...config });
  if (merged.DB_SSL === undefined && merged.DATABASE_SSL !== undefined) {
    merged.DB_SSL =
      merged.DATABASE_SSL === 'true' || merged.DATABASE_SSL === true;
  }

  const result = envSchema.safeParse(merged);

  if (!result.success) {
    const errors = result.error.format();
    console.error('[EnvValidation] Environment validation failed:');
    console.error(JSON.stringify(errors, null, 2));
    throw new Error('Invalid environment configuration');
  }

  const data = result.data;

  if (data.NODE_ENV === 'production') {
    const productionErrors = validateProductionSecrets(data);

    if (productionErrors.length > 0) {
      console.error('[EnvValidation] Production secrets validation failed:');
      console.error('');
      for (const error of productionErrors) {
        console.error(`  ✗ ${error.field}: ${error.message}`);
        if (error.reference) {
          console.error(`    Reference: ${error.reference}`);
        }
      }
      console.error('');
      console.error(
        'For production deployment guidance, see: docs/deployment/production-secrets.md',
      );

      throw new Error(
        `Production configuration invalid: ${productionErrors.length.toString()} secret(s) missing or insecure. ` +
          'See error log above for details.',
      );
    }

    console.log('[EnvValidation] Production secrets validation passed');
  }

  if (data.NODE_ENV === 'staging') {
    const stagingErrors = validateStagingSecrets(data);

    if (stagingErrors.length > 0) {
      console.error('[EnvValidation] Staging secrets validation failed:');
      for (const error of stagingErrors) {
        console.error(`  ✗ ${error.field}: ${error.message}`);
      }
      throw new Error(
        `Staging configuration invalid: ${stagingErrors.length.toString()} issue(s) found.`,
      );
    }
  }

  return data;
}

export { envSchema };

export type ValidatedEnvConfig = z.infer<typeof envSchema>;
