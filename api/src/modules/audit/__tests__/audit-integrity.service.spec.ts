import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuditIntegrityService } from '../services/audit-integrity.service';
import type { AuditLog } from '../entities/audit-log.entity';
import type { VaultService } from '../../vault';

function createMockConfigService(
  overrides: Record<string, string | undefined> = {},
) {
  return {
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

function createEntry(partial: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'entry-1',
    eventType: 'USER_CREATED',
    action: 'CREATE',
    entityType: 'User',
    entityId: 'user-123',
    actorId: 'actor-1',
    actorIp: '127.0.0.1',
    oldValues: null,
    newValues: { email: 'test@example.com' },
    prevHash: null,
    currHash: 'abc123',
    signature: '',
    ...partial,
  } as AuditLog;
}

describe('AuditIntegrityService', () => {
  const validHmacKey = crypto.randomBytes(32).toString('base64');

  describe('local HMAC (no vault)', () => {
    let service: AuditIntegrityService;

    beforeEach(() => {
      service = new AuditIntegrityService(
        createMockConfigService({ AUDIT_LOG_HMAC_KEY: validHmacKey }),
      );
      service.onModuleInit();
    });

    it('should be configured with valid key', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should generate deterministic signatures', async () => {
      const entry = createEntry();
      const sig1 = await service.generateSignature(entry);
      const sig2 = await service.generateSignature(entry);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex output
    });

    it('should produce different signatures for different entries', async () => {
      const entry1 = createEntry({ entityId: 'user-1' });
      const entry2 = createEntry({ entityId: 'user-2' });

      const sig1 = await service.generateSignature(entry1);
      const sig2 = await service.generateSignature(entry2);

      expect(sig1).not.toBe(sig2);
    });

    it('should verify valid signature', async () => {
      const entry = createEntry();
      const signature = await service.generateSignature(entry);
      entry.signature = signature;

      const result = await service.verifySignature(entry);
      expect(result.valid).toBe(true);
      expect(result.entryId).toBe('entry-1');
    });

    it('should reject tampered signature', async () => {
      const entry = createEntry();
      entry.signature = 'a'.repeat(64);

      const result = await service.verifySignature(entry);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('tampered');
    });

    it('should reject entry with no signature', async () => {
      const entry = createEntry({ signature: undefined });

      const result = await service.verifySignature(entry);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('no signature');
    });

    it('should verify batch of entries', async () => {
      const entries = [createEntry({ id: '1' }), createEntry({ id: '2' })];

      for (const entry of entries) {
        entry.signature = await service.generateSignature(entry);
      }

      const result = await service.verifyBatch(entries);
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(2);
      expect(result.invalidEntries).toHaveLength(0);
    });

    it('should report invalid entries in batch', async () => {
      const entries = [createEntry({ id: '1' }), createEntry({ id: '2' })];
      entries[0].signature = await service.generateSignature(entries[0]);
      entries[1].signature = 'tampered';

      const result = await service.verifyBatch(entries);
      expect(result.valid).toBe(false);
      expect(result.invalidEntries).toHaveLength(1);
      expect(result.invalidEntries[0].entryId).toBe('2');
    });

    it('should return key fingerprint', () => {
      const fingerprint = service.getKeyFingerprint();
      expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('no key configured', () => {
    it('should use ephemeral key in development', () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'development' }),
      );
      service.onModuleInit();

      expect(service.isConfigured()).toBe(true);
    });

    it('should not be configured in production without key', () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'production' }),
      );
      service.onModuleInit();

      expect(service.isConfigured()).toBe(false);
    });

    it('should return empty signature when no key available', async () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'production' }),
      );
      service.onModuleInit();

      const sig = await service.generateSignature(createEntry());
      expect(sig).toBe('');
    });

    it('should fail verification when no key available', async () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'production' }),
      );
      service.onModuleInit();

      const result = await service.verifySignature(
        createEntry({ signature: 'abc' }),
      );
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('HMAC key not available');
    });

    it('should fail batch verification when no key available', async () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'production' }),
      );
      service.onModuleInit();

      const result = await service.verifyBatch([createEntry()]);
      expect(result.valid).toBe(false);
      expect(result.entriesChecked).toBe(0);
    });

    it('should return null key fingerprint when not configured', () => {
      const service = new AuditIntegrityService(
        createMockConfigService({ NODE_ENV: 'production' }),
      );
      service.onModuleInit();

      expect(service.getKeyFingerprint()).toBeNull();
    });
  });

  describe('short key warning', () => {
    it('should accept short key with warning', () => {
      const shortKey = crypto.randomBytes(16).toString('base64');
      const service = new AuditIntegrityService(
        createMockConfigService({ AUDIT_LOG_HMAC_KEY: shortKey }),
      );
      service.onModuleInit();

      // Still configured, just with a warning
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('invalid key', () => {
    it('should handle non-base64 key gracefully', () => {
      // Buffer.from(str, 'base64') doesn't throw, it just produces a buffer
      // So this should still work (albeit with a potentially odd key)
      const service = new AuditIntegrityService(
        createMockConfigService({ AUDIT_LOG_HMAC_KEY: '!!!not-base64!!!' }),
      );
      service.onModuleInit();

      // Buffer.from('!!!not-base64!!!', 'base64') produces empty/garbage buffer
      // but it doesn't throw, so the service should still work
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('vault-enabled HMAC', () => {
    let service: AuditIntegrityService;
    let mockVault: {
      isEnabled: jest.Mock;
      transitHmac: jest.Mock;
    };

    beforeEach(() => {
      mockVault = {
        isEnabled: jest.fn().mockReturnValue(true),
        transitHmac: jest.fn().mockResolvedValue('aabbccdd' + '00'.repeat(28)),
      };
      service = new AuditIntegrityService(
        createMockConfigService(),
        mockVault as unknown as VaultService,
      );
      service.onModuleInit();
    });

    it('should delegate to vault transitHmac', async () => {
      const entry = createEntry();
      const sig = await service.generateSignature(entry);

      expect(mockVault.transitHmac).toHaveBeenCalledTimes(1);
      expect(sig).toBe('aabbccdd' + '00'.repeat(28));
    });

    it('should pass JSON payload to vault HMAC', async () => {
      const entry = createEntry();
      await service.generateSignature(entry);

      const payload = mockVault.transitHmac.mock.calls[0][0] as string;
      const parsed = JSON.parse(payload) as Record<string, unknown>;

      expect(parsed.eventType).toBe('USER_CREATED');
      expect(parsed.entityId).toBe('user-123');
    });

    it('should verify via vault HMAC', async () => {
      const vaultSig = 'aabbccdd' + '00'.repeat(28);
      mockVault.transitHmac.mockResolvedValue(vaultSig);

      const entry = createEntry({ signature: vaultSig });
      const result = await service.verifySignature(entry);

      expect(result.valid).toBe(true);
    });

    it('should reject mismatched vault HMAC', async () => {
      mockVault.transitHmac.mockResolvedValue('aa'.repeat(32));

      const entry = createEntry({ signature: 'bb'.repeat(32) });
      const result = await service.verifySignature(entry);

      expect(result.valid).toBe(false);
    });

    it('should skip local key check when vault enabled', async () => {
      // No AUDIT_LOG_HMAC_KEY configured, but vault is enabled
      const entry = createEntry();
      const result = await service.verifyBatch([entry]);

      // Should not return "HMAC key not available" error
      expect(result.entriesChecked).toBe(1);
    });
  });
});
