import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import vaultConfig from './vault.config';

interface VaultAuthResponse {
  auth: { client_token: string; lease_duration: number };
}

interface VaultKvResponse {
  data: { data: Record<string, string> };
}

interface VaultTransitSignResponse {
  data: { signature: string };
}

interface VaultTransitKeyResponse {
  data: { keys: Record<string, { public_key: string }> };
}

interface VaultTransitEncryptResponse {
  data: { ciphertext: string };
}

interface VaultTransitDecryptResponse {
  data: { plaintext: string };
}

interface VaultTransitHmacResponse {
  data: { hmac: string };
}

interface VaultHealthResponse {
  sealed: boolean;
  initialized: boolean;
}

// Keys that Vault KV is allowed to inject into process.env.
// Prevents overwriting critical env vars (PATH, NODE_ENV, etc.).
const KV_ENV_ALLOWLIST = new Set([
  'JWT_SECRET',
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'OTP_ENCRYPTION_KEY',
  'AUDIT_LOG_HMAC_KEY',
  'SIGNING_KEY_PASSPHRASE',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
]);

// Max payload size for Transit operations (1 MiB)
const MAX_TRANSIT_PAYLOAD_BYTES = 1_048_576;

// Max length for error body included in thrown errors
const MAX_ERROR_BODY_LENGTH = 256;

@Injectable()
export class VaultService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultService.name);
  private token = '';
  private renewInterval: ReturnType<typeof setInterval> | null = null;
  private kvSecrets: Record<string, string> = {};
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private renewing = false;

  constructor(
    @Inject(vaultConfig.KEY)
    private readonly config: ConfigType<typeof vaultConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) return;

    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    if (!this.config.address) {
      throw new Error('Vault is enabled but VAULT_ADDR is not configured');
    }
    if (!this.config.roleId || !this.config.secretId) {
      throw new Error(
        'Vault is enabled but VAULT_ROLE_ID / VAULT_SECRET_ID are not configured',
      );
    }

    await this.appRoleLogin();
    await this.fetchKvSecrets();
    this.startTokenRenewal();
    this.initialized = true;
    this.logger.log('Vault integration initialized');
  }

  /** Wait for initialization to complete. Throws if Vault is disabled. */
  async waitForReady(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Vault is not enabled');
    }
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    throw new Error('Vault initialization has not started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }

    if (this.token) {
      try {
        await this.vaultRequest('POST', '/v1/auth/token/revoke-self');
        this.logger.log('Vault token revoked on shutdown');
      } catch {
        this.logger.warn('Failed to revoke Vault token on shutdown');
      }
      this.token = '';
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getSecret(key: string): string | undefined {
    return this.kvSecrets[key];
  }

  async transitSign(data: Uint8Array): Promise<Uint8Array> {
    this.validateTransitPayload(data.byteLength, 'transitSign');

    const input = Buffer.from(data).toString('base64');
    const res = await this.vaultRequest<VaultTransitSignResponse>(
      'POST',
      `/v1/transit/sign/${this.config.transitSigningKey}`,
      { input, marshaling_algorithm: 'asn1' },
    );

    const parts = res.data.signature.split(':');
    return Buffer.from(parts[2], 'base64');
  }

  async transitGetPublicKey(): Promise<Uint8Array> {
    const res = await this.vaultRequest<VaultTransitKeyResponse>(
      'GET',
      `/v1/transit/keys/${this.config.transitSigningKey}`,
    );

    const latestVersion = Object.keys(res.data.keys)
      .map(Number)
      .sort((a, b) => b - a)[0];
    const publicKeyB64 = res.data.keys[String(latestVersion)].public_key;
    return Buffer.from(publicKeyB64, 'base64');
  }

  async transitEncrypt(plaintext: string): Promise<string> {
    this.validateTransitPayload(
      Buffer.byteLength(plaintext, 'utf8'),
      'transitEncrypt',
    );

    const encoded = Buffer.from(plaintext, 'utf8').toString('base64');
    const res = await this.vaultRequest<VaultTransitEncryptResponse>(
      'POST',
      `/v1/transit/encrypt/${this.config.transitEncryptionKey}`,
      { plaintext: encoded },
    );
    return res.data.ciphertext;
  }

  async transitDecrypt(ciphertext: string): Promise<string> {
    this.validateTransitPayload(
      Buffer.byteLength(ciphertext, 'utf8'),
      'transitDecrypt',
    );

    const res = await this.vaultRequest<VaultTransitDecryptResponse>(
      'POST',
      `/v1/transit/decrypt/${this.config.transitEncryptionKey}`,
      { ciphertext },
    );
    return Buffer.from(res.data.plaintext, 'base64').toString('utf8');
  }

  async transitHmac(data: string): Promise<string> {
    this.validateTransitPayload(Buffer.byteLength(data, 'utf8'), 'transitHmac');

    const input = Buffer.from(data, 'utf8').toString('base64');
    const res = await this.vaultRequest<VaultTransitHmacResponse>(
      'POST',
      `/v1/transit/hmac/${this.config.transitHmacKey}`,
      { input },
    );

    const b64 = res.data.hmac.split(':')[2];
    return Buffer.from(b64, 'base64').toString('hex');
  }

  async checkHealth(): Promise<{ sealed: boolean; initialized: boolean }> {
    const res = await fetch(
      `${this.config.address}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200`,
      { signal: AbortSignal.timeout(this.config.requestTimeoutMs) },
    );
    const body = (await res.json()) as VaultHealthResponse;
    return { sealed: body.sealed, initialized: body.initialized };
  }

  private async vaultRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.address}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'X-Vault-Token': this.token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!res.ok) {
      const text = await res.text();
      const sanitized = text.slice(0, MAX_ERROR_BODY_LENGTH);
      throw new Error(
        `Vault ${method} ${path} failed (${String(res.status)}): ${sanitized}`,
      );
    }

    return res.json() as Promise<T>;
  }

  private validateTransitPayload(byteLength: number, method: string): void {
    if (byteLength === 0) {
      throw new Error(`${method}: payload must not be empty`);
    }
    if (byteLength > MAX_TRANSIT_PAYLOAD_BYTES) {
      throw new Error(
        `${method}: payload exceeds maximum size of ${MAX_TRANSIT_PAYLOAD_BYTES.toString()} bytes`,
      );
    }
  }

  private async appRoleLogin(): Promise<void> {
    const res = await this.vaultRequest<VaultAuthResponse>(
      'POST',
      '/v1/auth/approle/login',
      { role_id: this.config.roleId, secret_id: this.config.secretId },
    );
    this.token = res.auth.client_token;
    this.logger.log('Authenticated with Vault via AppRole');
  }

  private async renewToken(): Promise<void> {
    if (this.renewing) return;
    this.renewing = true;
    try {
      await this.vaultRequest('POST', '/v1/auth/token/renew-self');
    } catch {
      this.logger.warn('Token renewal failed, re-authenticating');
      await this.appRoleLogin();
    } finally {
      this.renewing = false;
    }
  }

  private startTokenRenewal(): void {
    this.renewInterval = setInterval(() => {
      void this.renewToken();
    }, this.config.tokenRenewIntervalMs);
  }

  private async fetchKvSecrets(): Promise<void> {
    try {
      const res = await this.vaultRequest<VaultKvResponse>(
        'GET',
        '/v1/secret/data/dhis2-cert',
      );
      const allSecrets = res.data.data;

      // Only retain allowlisted keys in memory
      this.kvSecrets = {};
      let injected = 0;
      for (const [key, value] of Object.entries(allSecrets)) {
        if (KV_ENV_ALLOWLIST.has(key)) {
          this.kvSecrets[key] = value;
          process.env[key] = value;
          injected++;
        } else {
          this.logger.warn(`Skipping KV key "${key}" — not in env allowlist`);
        }
      }

      this.logger.log(
        `Loaded ${injected.toString()} of ${Object.keys(allSecrets).length.toString()} KV secrets into env`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          `Failed to fetch KV secrets in production: ${message}. ` +
            'Downstream services may fail due to missing credentials.',
        );
      } else {
        this.logger.warn(`Failed to fetch KV secrets: ${message}`);
      }
    }
  }
}
