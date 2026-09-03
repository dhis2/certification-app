import { envValidationSchema, parseEnvBoolean } from '../env.validation';

const JWT_SECRET = 'j'.repeat(64);
const AUDIT_LOG_HMAC_KEY = Buffer.alloc(32, 7).toString('base64');

function productionEnv(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    JWT_SECRET,
    APP_BASE_URL: 'https://certification.dhis2.org',
    DB_HOST: 'dhis2-cert-db',
    DB_PASSWORD: 'not-postgres',
    AUDIT_LOG_HMAC_KEY,
    MAIL_ENABLED: 'false',
    ...overrides,
  };
}

describe('parseEnvBoolean', () => {
  it('treats the string false as false', () => {
    expect(parseEnvBoolean('false')).toBe(false);
    expect(parseEnvBoolean('FALSE')).toBe(false);
    expect(parseEnvBoolean('0')).toBe(false);
    expect(parseEnvBoolean('no')).toBe(false);
  });

  it('treats the string true as true', () => {
    expect(parseEnvBoolean('true')).toBe(true);
    expect(parseEnvBoolean('1')).toBe(true);
    expect(parseEnvBoolean('yes')).toBe(true);
  });

  it('does not use Boolean() on non-empty strings', () => {
    expect(Boolean('false')).toBe(true);
    expect(parseEnvBoolean('false')).toBe(false);
  });
});

describe('envValidationSchema', () => {
  it('accepts MAIL_ENABLED=false without SMTP credentials', () => {
    const result = envValidationSchema(productionEnv());
    expect(result.MAIL_ENABLED).toBe(false);
  });

  it('rejects MAIL_ENABLED=true when SMTP credentials are missing', () => {
    expect(() =>
      envValidationSchema(
        productionEnv({
          MAIL_ENABLED: 'true',
        }),
      ),
    ).toThrow('Production configuration invalid');
  });

  it('accepts MAIL_ENABLED=true when SMTP credentials are present', () => {
    const result = envValidationSchema(
      productionEnv({
        MAIL_ENABLED: 'true',
        MAIL_HOST: 'smtp.example.com',
        MAIL_USER: 'mailer',
        MAIL_PASSWORD: 'secret',
      }),
    );
    expect(result.MAIL_ENABLED).toBe(true);
  });

  it('parses MAIL_SECURE=false as boolean false', () => {
    const result = envValidationSchema(productionEnv({ MAIL_SECURE: 'false' }));
    expect(result.MAIL_SECURE).toBe(false);
  });

  it('parses DATABASE_SSL=false as DB_SSL false', () => {
    const result = envValidationSchema(
      productionEnv({ DATABASE_SSL: 'false' }),
    );
    expect(result.DB_SSL).toBe(false);
  });

  it('defaults MAIL_ENABLED to true when unset and then requires SMTP', () => {
    const withoutMailFlag = productionEnv();
    delete withoutMailFlag.MAIL_ENABLED;
    expect(() => envValidationSchema(withoutMailFlag)).toThrow(
      'Production configuration invalid',
    );
  });
});
