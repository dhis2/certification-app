import { registerAs } from '@nestjs/config';

export interface VaultConfig {
  enabled: boolean;
  address: string;
  roleId: string;
  secretId: string;
  transitSigningKey: string;
  transitEncryptionKey: string;
  transitHmacKey: string;
  tokenRenewIntervalMs: number;
  requestTimeoutMs: number;
  publicKeyCacheTtlMs: number;
}

export default registerAs(
  'vault',
  (): VaultConfig => ({
    enabled: process.env.USE_VAULT === 'true',
    address: process.env.VAULT_ADDR ?? 'http://127.0.0.1:8200',
    roleId: process.env.VAULT_ROLE_ID ?? '',
    secretId: process.env.VAULT_SECRET_ID ?? '',
    transitSigningKey: process.env.VAULT_TRANSIT_SIGNING_KEY ?? 'vc-signing',
    transitEncryptionKey:
      process.env.VAULT_TRANSIT_ENCRYPTION_KEY ?? 'otp-encryption',
    transitHmacKey: process.env.VAULT_TRANSIT_HMAC_KEY ?? 'audit-hmac',
    tokenRenewIntervalMs: 5 * 60 * 1000,
    requestTimeoutMs: 5_000,
    publicKeyCacheTtlMs: 60 * 60 * 1000, // 1 hour
  }),
);
