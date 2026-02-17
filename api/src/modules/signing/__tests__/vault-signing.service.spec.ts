import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { VaultSigningService } from '../services/vault-signing.service';
import { CanonicalizationService } from '../services/canonicalization.service';
import { base58Decode } from '../services/software-signing.service';
import type { VaultService } from '../../vault';
import type { VaultConfig } from '../../vault/vault.config';

describe('VaultSigningService', () => {
  let service: VaultSigningService;
  let mockVaultService: {
    transitSign: jest.Mock;
    transitGetPublicKey: jest.Mock;
    isEnabled: jest.Mock;
  };

  // Generate a real Ed25519 keypair for sign/verify roundtrip tests
  const testKeypair = crypto.generateKeyPairSync('ed25519');
  const realPublicKeyRaw = (() => {
    const spki = testKeypair.publicKey.export({ type: 'spki', format: 'der' });
    // Ed25519 SPKI is 44 bytes: 12-byte prefix + 32-byte raw key
    return new Uint8Array(spki.subarray(12));
  })();

  // 32-byte static test key for non-crypto tests
  const mockPublicKey = new Uint8Array(32).fill(0xab);

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string | number | undefined> = {
        ISSUER_DID: 'did:web:test.example.com',
        SIGNING_KEY_VERSION: 1,
      };
      return config[key];
    }),
  } as unknown as ConfigService;

  const mockVaultConfig: VaultConfig = {
    enabled: true,
    address: 'http://127.0.0.1:8200',
    roleId: '',
    secretId: '',
    transitSigningKey: 'vc-signing',
    transitEncryptionKey: 'otp-encryption',
    transitHmacKey: 'audit-hmac',
    tokenRenewIntervalMs: 300_000,
    requestTimeoutMs: 5_000,
    publicKeyCacheTtlMs: 3_600_000,
  };

  beforeEach(() => {
    mockVaultService = {
      transitSign: jest.fn().mockResolvedValue(new Uint8Array(64).fill(0x01)),
      transitGetPublicKey: jest.fn().mockResolvedValue(mockPublicKey),
      isEnabled: jest.fn().mockReturnValue(true),
    };

    service = new VaultSigningService(
      mockVaultService as unknown as VaultService,
      mockConfigService,
      new CanonicalizationService(),
      mockVaultConfig,
    );
  });

  describe('onModuleInit', () => {
    it('should cache the public key from Vault', async () => {
      await service.onModuleInit();

      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(1);
      const pk = await service.getPublicKey();
      expect(pk).toBe(mockPublicKey);
      // Should use cached value, not call again
      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('sign', () => {
    it('should delegate to vault transit sign', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await service.sign(data);

      expect(mockVaultService.transitSign).toHaveBeenCalledWith(data);
    });

    it('should return the signature from vault', async () => {
      const expected = new Uint8Array(64).fill(0x42);
      mockVaultService.transitSign.mockResolvedValue(expected);

      const result = await service.sign(new Uint8Array([1]));
      expect(result).toBe(expected);
    });
  });

  describe('getPublicKey', () => {
    it('should lazy-load public key when cache is null', async () => {
      // Don't call onModuleInit — cache starts null
      const pk = await service.getPublicKey();

      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(1);
      expect(pk).toBe(mockPublicKey);

      // Second call uses cache
      await service.getPublicKey();
      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(1);
    });

    it('should refresh public key after cache TTL expires', async () => {
      const shortTtlConfig = { ...mockVaultConfig, publicKeyCacheTtlMs: 100 };
      const svc = new VaultSigningService(
        mockVaultService as unknown as VaultService,
        mockConfigService,
        new CanonicalizationService(),
        shortTtlConfig,
      );
      await svc.onModuleInit();
      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      const originalNow = Date.now;
      Date.now = () => originalNow() + 200;

      const newKey = new Uint8Array(32).fill(0xcd);
      mockVaultService.transitGetPublicKey.mockResolvedValue(newKey);

      const pk = await svc.getPublicKey();
      expect(pk).toBe(newKey);
      expect(mockVaultService.transitGetPublicKey).toHaveBeenCalledTimes(2);

      Date.now = originalNow;
    });
  });

  describe('getPublicKeyMultibase', () => {
    it('should return z-prefixed multibase string', async () => {
      await service.onModuleInit();
      const multibase = await service.getPublicKeyMultibase();

      expect(multibase).toMatch(/^z/);
      expect(multibase.length).toBeGreaterThan(1);
    });

    it('should include Ed25519 multicodec prefix (0xed01)', async () => {
      await service.onModuleInit();
      const multibase = await service.getPublicKeyMultibase();

      // Decode the z-prefixed base58 string
      const decoded = base58Decode(multibase.slice(1));

      expect(decoded[0]).toBe(0xed);
      expect(decoded[1]).toBe(0x01);
      // Remaining bytes should be the raw public key
      expect(Buffer.from(decoded.slice(2))).toEqual(Buffer.from(mockPublicKey));
    });
  });

  describe('getKeyVersion', () => {
    it('should return configured key version', () => {
      expect(service.getKeyVersion()).toBe(1);
    });

    it('should default to 1 when not configured', () => {
      const emptyConfig = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;

      const svc = new VaultSigningService(
        mockVaultService as unknown as VaultService,
        emptyConfig,
        new CanonicalizationService(),
        mockVaultConfig,
      );
      expect(svc.getKeyVersion()).toBe(1);
    });
  });

  describe('getVerificationMethod', () => {
    it('should return a valid verification method', async () => {
      await service.onModuleInit();
      const vm = await service.getVerificationMethod();

      expect(vm.type).toBe('Ed25519VerificationKey2020');
      expect(vm.controller).toBe('did:web:test.example.com');
      expect(vm.id).toContain('did:web:test.example.com#signing-key-');
      expect(vm.publicKeyMultibase).toMatch(/^z/);
    });

    it('should include year and version in verification method ID', async () => {
      await service.onModuleInit();
      const vm = await service.getVerificationMethod();

      const year = new Date().getFullYear();
      expect(vm.id).toBe(`did:web:test.example.com#signing-key-${year}-v1`);
    });
  });

  describe('createDataIntegrityProof', () => {
    it('should create a valid W3C Data Integrity proof', async () => {
      await service.onModuleInit();
      const doc = new Uint8Array([10, 20, 30]);
      const proof = await service.createDataIntegrityProof(doc);

      expect(proof.type).toBe('DataIntegrityProof');
      expect(proof.cryptosuite).toBe('eddsa-rdfc-2022');
      expect(proof.proofPurpose).toBe('assertionMethod');
      expect(proof.proofValue).toMatch(/^z/);
      expect(proof.verificationMethod).toContain('did:web:test.example.com');
      expect(proof.created).toBeTruthy();
      expect(mockVaultService.transitSign).toHaveBeenCalled();
    });

    it('should set created to ISO timestamp', async () => {
      await service.onModuleInit();
      const proof = await service.createDataIntegrityProof(new Uint8Array([1]));

      expect(() => new Date(proof.created)).not.toThrow();
      expect(new Date(proof.created).toISOString()).toBe(proof.created);
    });

    it('should produce different proofs for different documents', async () => {
      await service.onModuleInit();

      // Different docs produce different hashData, so sign is called with different args
      const doc1 = new Uint8Array([1, 2, 3]);
      const doc2 = new Uint8Array([4, 5, 6]);

      await service.createDataIntegrityProof(doc1);
      const call1Data = mockVaultService.transitSign.mock
        .calls[0][0] as Uint8Array;

      await service.createDataIntegrityProof(doc2);
      const call2Data = mockVaultService.transitSign.mock
        .calls[1][0] as Uint8Array;

      expect(Buffer.from(call1Data)).not.toEqual(Buffer.from(call2Data));
    });
  });

  describe('verifyDataIntegrityProof', () => {
    it('should throw when public key is not cached', () => {
      // Don't call onModuleInit — cache is null
      const proof = {
        type: 'DataIntegrityProof' as const,
        cryptosuite: 'eddsa-rdfc-2022' as const,
        created: new Date().toISOString(),
        verificationMethod: 'did:web:test.example.com#key',
        proofPurpose: 'assertionMethod' as const,
        proofValue: 'z1234',
      };

      expect(() =>
        service.verifyDataIntegrityProof(new Uint8Array([1]), proof),
      ).toThrow('Public key not available');
    });

    it('should verify a real sign+verify roundtrip', async () => {
      // Set up service with a real Ed25519 keypair
      mockVaultService.transitGetPublicKey.mockResolvedValue(realPublicKeyRaw);
      mockVaultService.transitSign.mockImplementation(
        async (data: Uint8Array) => {
          const sig = crypto.sign(
            null,
            Buffer.from(data),
            testKeypair.privateKey,
          );
          return new Uint8Array(sig);
        },
      );

      const realService = new VaultSigningService(
        mockVaultService as unknown as VaultService,
        mockConfigService,
        new CanonicalizationService(),
        mockVaultConfig,
      );
      await realService.onModuleInit();

      const doc = new Uint8Array([10, 20, 30, 40, 50]);
      const proof = await realService.createDataIntegrityProof(doc);

      const isValid = realService.verifyDataIntegrityProof(doc, proof);
      expect(isValid).toBe(true);
    });

    it('should reject proof with tampered document', async () => {
      mockVaultService.transitGetPublicKey.mockResolvedValue(realPublicKeyRaw);
      mockVaultService.transitSign.mockImplementation(
        async (data: Uint8Array) => {
          const sig = crypto.sign(
            null,
            Buffer.from(data),
            testKeypair.privateKey,
          );
          return new Uint8Array(sig);
        },
      );

      const realService = new VaultSigningService(
        mockVaultService as unknown as VaultService,
        mockConfigService,
        new CanonicalizationService(),
        mockVaultConfig,
      );
      await realService.onModuleInit();

      const doc = new Uint8Array([10, 20, 30]);
      const proof = await realService.createDataIntegrityProof(doc);

      // Tamper with the document
      const tampered = new Uint8Array([10, 20, 99]);
      const isValid = realService.verifyDataIntegrityProof(tampered, proof);
      expect(isValid).toBe(false);
    });

    it('should reject proof with tampered proofValue', async () => {
      mockVaultService.transitGetPublicKey.mockResolvedValue(realPublicKeyRaw);
      mockVaultService.transitSign.mockImplementation(
        async (data: Uint8Array) => {
          const sig = crypto.sign(
            null,
            Buffer.from(data),
            testKeypair.privateKey,
          );
          return new Uint8Array(sig);
        },
      );

      const realService = new VaultSigningService(
        mockVaultService as unknown as VaultService,
        mockConfigService,
        new CanonicalizationService(),
        mockVaultConfig,
      );
      await realService.onModuleInit();

      const doc = new Uint8Array([10, 20, 30]);
      const proof = await realService.createDataIntegrityProof(doc);

      // Tamper with the proof
      const tamperedProof = {
        ...proof,
        proofValue: proof.proofValue.slice(0, -2) + 'XX',
      };

      // Should either return false or throw on invalid base58
      let valid: boolean;
      try {
        valid = realService.verifyDataIntegrityProof(doc, tamperedProof);
      } catch {
        valid = false;
      }
      expect(valid).toBe(false);
    });
  });
});
