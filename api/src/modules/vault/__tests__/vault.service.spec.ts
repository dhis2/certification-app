import { Test, TestingModule } from '@nestjs/testing';
import { VaultService } from '../vault.service';
import vaultConfig from '../vault.config';

function mockResponse(data: Record<string, unknown>): Response {
  return data as unknown as Response;
}

describe('VaultService', () => {
  const baseConfig = {
    enabled: false,
    address: 'http://127.0.0.1:8200',
    roleId: 'test-role-id',
    secretId: 'test-secret-id',
    transitSigningKey: 'vc-signing',
    transitEncryptionKey: 'otp-encryption',
    transitHmacKey: 'audit-hmac',
    tokenRenewIntervalMs: 300_000,
    requestTimeoutMs: 5_000,
    publicKeyCacheTtlMs: 3_600_000,
  };

  async function createService(configOverrides = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        {
          provide: vaultConfig.KEY,
          useValue: { ...baseConfig, ...configOverrides },
        },
      ],
    }).compile();

    return module.get<VaultService>(VaultService);
  }

  function mockLoginAndKv(fetchSpy: jest.SpyInstance) {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            auth: { client_token: 'test-token', lease_duration: 3600 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { data: { JWT_SECRET: 'from-vault', DB_PASSWORD: 'pw123' } },
          }),
      });
  }

  describe('when disabled', () => {
    it('should report as not enabled', async () => {
      const service = await createService({ enabled: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should skip initialization', async () => {
      const service = await createService({ enabled: false });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      await service.onModuleInit();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should return undefined for secrets', async () => {
      const service = await createService({ enabled: false });
      expect(service.getSecret('JWT_SECRET')).toBeUndefined();
    });
  });

  describe('when enabled', () => {
    let service: VaultService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      service = await createService({ enabled: true });
      fetchSpy = jest.spyOn(globalThis, 'fetch');
    });

    afterEach(async () => {
      // Mock a successful response for any remaining calls (including revoke-self)
      fetchSpy.mockResolvedValue(
        mockResponse({ ok: true, json: () => Promise.resolve({}) }),
      );
      await service.onModuleDestroy();
      fetchSpy.mockRestore();
    });

    it('should report as enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should authenticate via AppRole on init', async () => {
      mockLoginAndKv(fetchSpy);

      await service.onModuleInit();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toContain('/v1/auth/approle/login');
      expect(service.getSecret('JWT_SECRET')).toBe('from-vault');
    });

    it('should send role_id and secret_id in AppRole login body', async () => {
      mockLoginAndKv(fetchSpy);

      await service.onModuleInit();

      const loginCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(loginCall[1].body as string) as Record<
        string,
        string
      >;
      expect(body.role_id).toBe('test-role-id');
      expect(body.secret_id).toBe('test-secret-id');
    });

    it('should use token from AppRole login for subsequent requests', async () => {
      mockLoginAndKv(fetchSpy);
      await service.onModuleInit();

      // KV fetch should use the token
      const kvCall = fetchSpy.mock.calls[1];
      expect(kvCall[1].headers['X-Vault-Token']).toBe('test-token');
    });

    it('should inject allowlisted KV secrets into process.env', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: { client_token: 'tok', lease_duration: 3600 },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { data: { JWT_SECRET: 'vault-jwt-value' } },
            }),
        });

      await service.onModuleInit();

      expect(process.env.JWT_SECRET).toBe('vault-jwt-value');
      delete process.env.JWT_SECRET;
    });

    it('should reject non-allowlisted KV keys from process.env and memory', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: { client_token: 'tok', lease_duration: 3600 },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                data: {
                  JWT_SECRET: 'allowed',
                  PATH: '/malicious',
                  NODE_ENV: 'development',
                },
              },
            }),
        });

      const originalPath = process.env.PATH;
      const originalNodeEnv = process.env.NODE_ENV;

      await service.onModuleInit();

      // Allowlisted key should be injected
      expect(service.getSecret('JWT_SECRET')).toBe('allowed');
      // Non-allowlisted keys must NOT be injected into env
      expect(process.env.PATH).toBe(originalPath);
      expect(process.env.NODE_ENV).toBe(originalNodeEnv);
      // Non-allowlisted keys must NOT be stored in memory
      expect(service.getSecret('PATH')).toBeUndefined();
      expect(service.getSecret('NODE_ENV')).toBeUndefined();

      delete process.env.JWT_SECRET;
    });

    it('should load multiple KV secrets', async () => {
      mockLoginAndKv(fetchSpy);
      await service.onModuleInit();

      expect(service.getSecret('JWT_SECRET')).toBe('from-vault');
      expect(service.getSecret('DB_PASSWORD')).toBe('pw123');
      expect(service.getSecret('NONEXISTENT')).toBeUndefined();
    });

    it('should continue when KV fetch fails', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: { client_token: 'tok', lease_duration: 3600 },
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve('permission denied'),
        });

      // Should not throw — KV failure is non-fatal
      await service.onModuleInit();
      expect(service.getSecret('JWT_SECRET')).toBeUndefined();
    });

    it('should call transit sign endpoint', async () => {
      const signatureB64 = Buffer.from('fake-sig').toString('base64');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { signature: `vault:v1:${signatureB64}` },
          }),
      });

      const result = await service.transitSign(new Uint8Array([1, 2, 3]));

      expect(result).toEqual(Buffer.from('fake-sig'));
      expect(fetchSpy.mock.calls[0][0]).toContain(
        '/v1/transit/sign/vc-signing',
      );
    });

    it('should send marshaling_algorithm in sign request', async () => {
      const signatureB64 = Buffer.from('sig').toString('base64');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { signature: `vault:v1:${signatureB64}` },
          }),
      });

      await service.transitSign(new Uint8Array([1]));

      const body = JSON.parse(
        fetchSpy.mock.calls[0][1].body as string,
      ) as Record<string, string>;
      expect(body.marshaling_algorithm).toBe('asn1');
    });

    it('should get latest transit public key version', async () => {
      const pubkey = Buffer.from('a'.repeat(32)).toString('base64');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              keys: {
                '1': { public_key: 'old-key' },
                '3': { public_key: pubkey },
                '2': { public_key: 'mid-key' },
              },
            },
          }),
      });

      const result = await service.transitGetPublicKey();

      expect(result).toEqual(Buffer.from(pubkey, 'base64'));
    });

    it('should call transit encrypt endpoint', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { ciphertext: 'vault:v1:encrypted-data' },
          }),
      });

      const result = await service.transitEncrypt('hello');

      expect(result).toBe('vault:v1:encrypted-data');
      expect(fetchSpy.mock.calls[0][0]).toContain(
        '/v1/transit/encrypt/otp-encryption',
      );
    });

    it('should base64-encode plaintext for transit encrypt', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { ciphertext: 'vault:v1:ct' } }),
      });

      await service.transitEncrypt('hello world');

      const body = JSON.parse(
        fetchSpy.mock.calls[0][1].body as string,
      ) as Record<string, string>;
      expect(body.plaintext).toBe(
        Buffer.from('hello world', 'utf8').toString('base64'),
      );
    });

    it('should call transit decrypt endpoint', async () => {
      const plaintextB64 = Buffer.from('decrypted').toString('base64');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { plaintext: plaintextB64 } }),
      });

      const result = await service.transitDecrypt('vault:v1:ciphertext');

      expect(result).toBe('decrypted');
    });

    it('should handle unicode in transit encrypt/decrypt roundtrip', async () => {
      const plaintext = 'émojis and spëcial çhars 🔐';
      const encoded = Buffer.from(plaintext, 'utf8').toString('base64');

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { ciphertext: 'vault:v1:enc' } }),
      });

      await service.transitEncrypt(plaintext);

      const body = JSON.parse(
        fetchSpy.mock.calls[0][1].body as string,
      ) as Record<string, string>;
      expect(body.plaintext).toBe(encoded);

      // Verify decrypt decodes base64 back to UTF-8
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { plaintext: encoded } }),
      });

      const result = await service.transitDecrypt('vault:v1:enc');
      expect(result).toBe(plaintext);
    });

    it('should call transit hmac endpoint and return hex', async () => {
      const hmacB64 = Buffer.from('hmac-result').toString('base64');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { hmac: `vault:v1:${hmacB64}` },
          }),
      });

      const result = await service.transitHmac('some-data');

      expect(result).toBe(Buffer.from('hmac-result').toString('hex'));
    });

    it('should throw on non-ok response with status and body', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('permission denied'),
      });

      await expect(service.transitEncrypt('test')).rejects.toThrow(
        /Vault POST.*failed.*403.*permission denied/,
      );
    });

    it('should truncate long error response bodies', async () => {
      const longBody = 'x'.repeat(1000);
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(longBody),
      });

      await expect(service.transitEncrypt('test')).rejects.toThrow(
        /Vault POST.*failed.*500/,
      );

      try {
        await service.transitEncrypt('test');
      } catch (err) {
        // Error message should be truncated to 256 chars
        expect((err as Error).message.length).toBeLessThan(
          longBody.length + 100,
        );
      }
    });

    it('should throw on non-ok response for GET', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('not found'),
      });

      await expect(service.transitGetPublicKey()).rejects.toThrow(
        /Vault GET.*failed.*404/,
      );
    });

    it('should reject empty payload for transitSign', async () => {
      await expect(service.transitSign(new Uint8Array(0))).rejects.toThrow(
        'transitSign: payload must not be empty',
      );
    });

    it('should reject empty payload for transitEncrypt', async () => {
      await expect(service.transitEncrypt('')).rejects.toThrow(
        'transitEncrypt: payload must not be empty',
      );
    });

    it('should reject empty payload for transitHmac', async () => {
      await expect(service.transitHmac('')).rejects.toThrow(
        'transitHmac: payload must not be empty',
      );
    });

    it('should reject oversized payload for transitEncrypt', async () => {
      const oversized = 'a'.repeat(1_048_577);
      await expect(service.transitEncrypt(oversized)).rejects.toThrow(
        /payload exceeds maximum size/,
      );
    });

    it('should reject oversized payload for transitDecrypt', async () => {
      const oversized = 'a'.repeat(1_048_577);
      await expect(service.transitDecrypt(oversized)).rejects.toThrow(
        /payload exceeds maximum size/,
      );
    });

    it('should check health endpoint', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: () => Promise.resolve({ sealed: false, initialized: true }),
      });

      const health = await service.checkHealth();

      expect(health.sealed).toBe(false);
      expect(health.initialized).toBe(true);
    });

    it('should report sealed vault', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: () => Promise.resolve({ sealed: true, initialized: true }),
      });

      const health = await service.checkHealth();
      expect(health.sealed).toBe(true);
    });

    it('should report uninitialized vault', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: () => Promise.resolve({ sealed: false, initialized: false }),
      });

      const health = await service.checkHealth();
      expect(health.initialized).toBe(false);
    });

    it('should use correct health endpoint URL with query params', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: () => Promise.resolve({ sealed: false, initialized: true }),
      });

      await service.checkHealth();

      expect(fetchSpy.mock.calls[0][0]).toBe(
        'http://127.0.0.1:8200/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200',
      );
    });
  });

  describe('token renewal', () => {
    let service: VaultService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      jest.useFakeTimers();
      service = await createService({
        enabled: true,
        tokenRenewIntervalMs: 1000,
      });
      fetchSpy = jest.spyOn(globalThis, 'fetch');
    });

    afterEach(async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ ok: true, json: () => Promise.resolve({}) }),
      );
      await service.onModuleDestroy();
      fetchSpy.mockRestore();
      jest.useRealTimers();
    });

    it('should start token renewal interval after init', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () =>
              Promise.resolve({
                auth: { client_token: 'tok', lease_duration: 3600 },
              }),
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () => Promise.resolve({ data: { data: {} } }),
          }),
        );

      await service.onModuleInit();
      const callsAfterInit = fetchSpy.mock.calls.length;

      // Renewal succeeds
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // flush microtasks

      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterInit);
      const renewCall = fetchSpy.mock.calls[callsAfterInit];
      expect(renewCall[0]).toContain('/v1/auth/token/renew-self');
    });

    it('should re-authenticate when renewal fails', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () =>
              Promise.resolve({
                auth: { client_token: 'tok1', lease_duration: 3600 },
              }),
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () => Promise.resolve({ data: { data: {} } }),
          }),
        );

      await service.onModuleInit();
      const callsAfterInit = fetchSpy.mock.calls.length;

      // Renewal fails
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 403,
          text: () => Promise.resolve('forbidden'),
        }),
      );
      // Re-auth succeeds
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: { client_token: 'tok2', lease_duration: 3600 },
            }),
        }),
      );

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Verify re-login was attempted
      const reLoginCall = fetchSpy.mock.calls[callsAfterInit + 1];
      expect(reLoginCall[0]).toContain('/v1/auth/approle/login');
    });
  });

  describe('initialization guard', () => {
    it('should throw on waitForReady when disabled', async () => {
      const service = await createService({ enabled: false });
      await expect(service.waitForReady()).rejects.toThrow(
        'Vault is not enabled',
      );
    });

    it('should resolve waitForReady after init completes', async () => {
      const service = await createService({ enabled: true });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () =>
              Promise.resolve({
                auth: { client_token: 'tok', lease_duration: 3600 },
              }),
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () => Promise.resolve({ data: { data: {} } }),
          }),
        );

      await service.onModuleInit();
      await expect(service.waitForReady()).resolves.toBeUndefined();

      fetchSpy.mockResolvedValue(
        mockResponse({ ok: true, json: () => Promise.resolve({}) }),
      );
      await service.onModuleDestroy();
      fetchSpy.mockRestore();
    });

    it('should throw on waitForReady before init starts', async () => {
      const service = await createService({ enabled: true });
      await expect(service.waitForReady()).rejects.toThrow(
        'Vault initialization has not started',
      );
    });

    it('should throw when enabled with empty roleId', async () => {
      const service = await createService({ enabled: true, roleId: '' });
      await expect(service.onModuleInit()).rejects.toThrow(
        /VAULT_ROLE_ID.*VAULT_SECRET_ID.*not configured/,
      );
    });

    it('should throw when enabled with empty secretId', async () => {
      const service = await createService({ enabled: true, secretId: '' });
      await expect(service.onModuleInit()).rejects.toThrow(
        /VAULT_ROLE_ID.*VAULT_SECRET_ID.*not configured/,
      );
    });

    it('should throw when enabled with empty address', async () => {
      const service = await createService({ enabled: true, address: '' });
      await expect(service.onModuleInit()).rejects.toThrow(
        /VAULT_ADDR.*not configured/,
      );
    });
  });

  describe('cleanup', () => {
    it('should clear renewal interval on destroy', async () => {
      const service = await createService({ enabled: false });
      await service.onModuleDestroy();
    });

    it('should revoke token on destroy', async () => {
      const service = await createService({ enabled: true });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      mockLoginAndKv(fetchSpy);
      await service.onModuleInit();

      // Mock the revoke-self call
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      await service.onModuleDestroy();

      const revokeCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
      expect(revokeCall[0]).toContain('/v1/auth/token/revoke-self');
      fetchSpy.mockRestore();
    });

    it('should handle token revocation failure gracefully', async () => {
      const service = await createService({ enabled: true });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      mockLoginAndKv(fetchSpy);
      await service.onModuleInit();

      // Mock revoke failure
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 403,
          text: () => Promise.resolve('forbidden'),
        }),
      );

      // Should not throw
      await service.onModuleDestroy();
      fetchSpy.mockRestore();
    });

    it('should clear active interval after init+destroy', async () => {
      jest.useFakeTimers();
      const service = await createService({
        enabled: true,
        tokenRenewIntervalMs: 60_000,
      });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () =>
              Promise.resolve({
                auth: { client_token: 'tok', lease_duration: 3600 },
              }),
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () => Promise.resolve({ data: { data: {} } }),
          }),
        );

      await service.onModuleInit();

      // Mock revoke-self for destroy
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );
      await service.onModuleDestroy();
      const callsAfterDestroy = fetchSpy.mock.calls.length;

      // Advance past the renewal interval — no new fetch calls beyond revoke
      jest.advanceTimersByTime(120_000);
      expect(fetchSpy.mock.calls.length).toBe(callsAfterDestroy);

      fetchSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('renewal mutex', () => {
    it('should skip concurrent renewal attempts', async () => {
      jest.useFakeTimers();
      const service = await createService({
        enabled: true,
        tokenRenewIntervalMs: 100,
      });
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      // Init: login + KV
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () =>
              Promise.resolve({
                auth: { client_token: 'tok', lease_duration: 3600 },
              }),
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: () => Promise.resolve({ data: { data: {} } }),
          }),
        );

      await service.onModuleInit();
      const callsAfterInit = fetchSpy.mock.calls.length;

      // Make renewal slow (never resolves during test)
      let resolveRenewal: () => void;
      const slowRenewal = new Promise<Response>((resolve) => {
        resolveRenewal = () =>
          resolve(
            mockResponse({
              ok: true,
              json: () => Promise.resolve({}),
            }),
          );
      });
      fetchSpy.mockReturnValueOnce(slowRenewal);

      // Fire first renewal
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Fire second renewal while first is in progress
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Only 1 renewal call should have been made (mutex skipped the second)
      expect(fetchSpy.mock.calls.length).toBe(callsAfterInit + 1);

      resolveRenewal!();
      await Promise.resolve();

      fetchSpy.mockRestore();
      await service.onModuleDestroy();
      jest.useRealTimers();
    });
  });
});
