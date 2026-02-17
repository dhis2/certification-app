import { Test, TestingModule } from '@nestjs/testing';
import { BcryptService } from './bcrypt.service';

describe('BcryptService', () => {
  let service: BcryptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BcryptService],
    }).compile();

    service = module.get<BcryptService>(BcryptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash and verify a password', async () => {
    const password = 'test-password-secure';
    const hashed = await service.hash(password);

    expect(hashed).not.toBe(password);
    expect(await service.compare(password, hashed)).toBe(true);
    expect(await service.compare('wrong-password-here', hashed)).toBe(false);
  });

  it('should produce consistent hashes for NFC-equivalent Unicode strings', async () => {
    // "cafe\u0301" (decomposed: e + combining acute) vs "caf\u00e9" (composed: e-with-acute)
    const decomposed = 'caf\u0065\u0301-secure-password';
    const composed = 'caf\u00e9-secure-password';

    expect(decomposed).not.toBe(composed);
    expect(decomposed.normalize('NFC')).toBe(composed.normalize('NFC'));

    const hashed = await service.hash(decomposed);
    expect(await service.compare(composed, hashed)).toBe(true);
  });

  it('should not alter ASCII-only passwords', async () => {
    const password = 'plain-ascii-password!';
    const hashed = await service.hash(password);

    expect(await service.compare(password, hashed)).toBe(true);
  });
});
