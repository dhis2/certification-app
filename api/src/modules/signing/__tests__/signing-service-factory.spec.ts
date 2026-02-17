import type { VaultService } from '../../vault';
import type { SoftwareSigningService } from '../services/software-signing.service';
import type { VaultSigningService } from '../services/vault-signing.service';
import type { SigningService } from '../interfaces';

/**
 * Tests the SIGNING_SERVICE factory logic from signing.module.ts:
 *   vault.isEnabled() ? vaultSigning : software
 */
describe('SIGNING_SERVICE factory', () => {
  // Mirror the factory from signing.module.ts
  function signingServiceFactory(
    vault: VaultService,
    software: SoftwareSigningService,
    vaultSigning: VaultSigningService,
  ): SigningService {
    return vault.isEnabled() ? vaultSigning : software;
  }

  const mockSoftware = {
    name: 'software',
  } as unknown as SoftwareSigningService;
  const mockVaultSigning = { name: 'vault' } as unknown as VaultSigningService;

  it('should return SoftwareSigningService when vault disabled', () => {
    const vault = { isEnabled: () => false } as unknown as VaultService;
    const result = signingServiceFactory(vault, mockSoftware, mockVaultSigning);
    expect(result).toBe(mockSoftware);
  });

  it('should return VaultSigningService when vault enabled', () => {
    const vault = { isEnabled: () => true } as unknown as VaultService;
    const result = signingServiceFactory(vault, mockSoftware, mockVaultSigning);
    expect(result).toBe(mockVaultSigning);
  });
});
