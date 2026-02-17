import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  CipherGCMTypes,
} from 'crypto';
import encryptionConfig from './encryption.config';
import { VaultService } from '../../modules/vault';

const VAULT_PREFIX = 'vault:';

@Injectable()
export class EncryptionService {
  private readonly algorithm: CipherGCMTypes = 'aes-256-gcm';
  private readonly ivLength = 12; // NIST recommended for GCM
  private readonly authTagLength = 16;

  constructor(
    @Inject(encryptionConfig.KEY)
    private readonly config: ConfigType<typeof encryptionConfig>,
    @Optional() private readonly vaultService?: VaultService,
  ) {}

  async encrypt(plaintext: string): Promise<string> {
    if (this.vaultService?.isEnabled()) {
      return this.vaultService.transitEncrypt(plaintext);
    }
    return this.localEncrypt(plaintext);
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (ciphertext.startsWith(VAULT_PREFIX)) {
      if (!this.vaultService?.isEnabled()) {
        throw new Error('Vault ciphertext found but Vault is not enabled');
      }
      return this.vaultService.transitDecrypt(ciphertext);
    }
    return this.localDecrypt(ciphertext);
  }

  private localEncrypt(plaintext: string): string {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.config.key, iv, {
      authTagLength: this.authTagLength,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64',
    );
  }

  private localDecrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64');

    const iv = data.subarray(0, this.ivLength);
    const authTag = data.subarray(
      this.ivLength,
      this.ivLength + this.authTagLength,
    );
    const encrypted = data.subarray(this.ivLength + this.authTagLength);

    const decipher = createDecipheriv(this.algorithm, this.config.key, iv, {
      authTagLength: this.authTagLength,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}
