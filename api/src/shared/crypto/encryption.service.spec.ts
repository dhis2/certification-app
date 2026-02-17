import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';
import encryptionConfig from './encryption.config';
import { randomBytes } from 'crypto';
import { VaultService } from '../../modules/vault';

describe('EncryptionService', () => {
  const testKey = randomBytes(32);

  async function createService(vaultMock?: Partial<VaultService>) {
    const providers: any[] = [
      EncryptionService,
      { provide: encryptionConfig.KEY, useValue: { key: testKey } },
    ];
    if (vaultMock) {
      providers.push({ provide: VaultService, useValue: vaultMock });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<EncryptionService>(EncryptionService);
  }

  describe('local encryption (no vault)', () => {
    let service: EncryptionService;

    beforeEach(async () => {
      service = await createService();
    });

    it('should encrypt and decrypt a string correctly', async () => {
      const plaintext = 'JBSWY3DPEHPK3PXP';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (unique IV)', async () => {
      const plaintext = 'test-secret';
      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(await service.decrypt(encrypted1)).toBe(plaintext);
      expect(await service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const encrypted = await service.encrypt('');
      expect(await service.decrypt(encrypted)).toBe('');
    });

    it('should handle unicode characters', async () => {
      const plaintext = 'Secret with émojis and spëcial çhars!';
      const encrypted = await service.encrypt(plaintext);
      expect(await service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle long strings', async () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = await service.encrypt(plaintext);
      expect(await service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should throw on tampered ciphertext', async () => {
      const encrypted = await service.encrypt('secret');
      const tampered = encrypted.slice(0, -2) + 'XX';
      await expect(service.decrypt(tampered)).rejects.toThrow();
    });

    it('should throw on invalid base64', async () => {
      await expect(service.decrypt('not-valid-base64!!!')).rejects.toThrow();
    });

    it('should produce base64 output', async () => {
      const encrypted = await service.encrypt('test');
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
    });
  });

  describe('vault-enabled encryption', () => {
    let service: EncryptionService;
    let mockVault: {
      isEnabled: jest.Mock;
      transitEncrypt: jest.Mock;
      transitDecrypt: jest.Mock;
    };

    beforeEach(async () => {
      mockVault = {
        isEnabled: jest.fn().mockReturnValue(true),
        transitEncrypt: jest
          .fn()
          .mockResolvedValue('vault:v1:encrypted-payload'),
        transitDecrypt: jest.fn().mockResolvedValue('decrypted-text'),
      };
      service = await createService(mockVault as unknown as VaultService);
    });

    it('should delegate encrypt to vault transit', async () => {
      const result = await service.encrypt('my-secret');

      expect(result).toBe('vault:v1:encrypted-payload');
      expect(mockVault.transitEncrypt).toHaveBeenCalledWith('my-secret');
    });

    it('should delegate decrypt of vault ciphertext to vault transit', async () => {
      const result = await service.decrypt('vault:v1:encrypted-payload');

      expect(result).toBe('decrypted-text');
      expect(mockVault.transitDecrypt).toHaveBeenCalledWith(
        'vault:v1:encrypted-payload',
      );
    });

    it('should fall through to local decrypt for non-vault ciphertext', async () => {
      // Encrypt locally (vault is "enabled" but the ciphertext is local format)
      const localService = await createService();
      const localCiphertext = await localService.encrypt('local-secret');

      // Service with vault should still decrypt local format
      const result = await service.decrypt(localCiphertext);
      expect(result).toBe('local-secret');
      expect(mockVault.transitDecrypt).not.toHaveBeenCalled();
    });
  });

  describe('ciphertext format auto-detection', () => {
    it('should throw when vault ciphertext found but vault disabled', async () => {
      const service = await createService({
        isEnabled: () => false,
      } as unknown as VaultService);

      await expect(service.decrypt('vault:v1:some-ciphertext')).rejects.toThrow(
        'Vault ciphertext found but Vault is not enabled',
      );
    });

    it('should throw when vault ciphertext found but no vault injected', async () => {
      const service = await createService();

      await expect(service.decrypt('vault:v1:some-ciphertext')).rejects.toThrow(
        'Vault ciphertext found but Vault is not enabled',
      );
    });

    it('should decrypt local ciphertext even when vault is enabled', async () => {
      // First encrypt with local
      const localService = await createService();
      const ciphertext = await localService.encrypt('mixed-era-data');

      // Then decrypt with vault-enabled service
      const vaultService = await createService({
        isEnabled: () => true,
        transitEncrypt: jest.fn(),
        transitDecrypt: jest.fn(),
      } as unknown as VaultService);

      const result = await vaultService.decrypt(ciphertext);
      expect(result).toBe('mixed-era-data');
    });
  });

  describe('vault disabled but injected', () => {
    it('should use local encryption when vault is disabled', async () => {
      const mockVault = {
        isEnabled: jest.fn().mockReturnValue(false),
        transitEncrypt: jest.fn(),
        transitDecrypt: jest.fn(),
      };

      const service = await createService(mockVault as unknown as VaultService);
      const encrypted = await service.encrypt('test');

      expect(mockVault.transitEncrypt).not.toHaveBeenCalled();
      expect(await service.decrypt(encrypted)).toBe('test');
    });
  });
});
