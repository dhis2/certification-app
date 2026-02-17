/* eslint-disable security/detect-non-literal-fs-filename -- key paths are constructed from validated config, not user input */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { base58Encode, base58Decode } from './base58';

const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

const MAX_PRIVATE_KEY_PERMISSIONS = 0o600;

export interface KeyMetadata {
  version: number;
  createdAt: string;
  algorithm: 'Ed25519';
  keyId: string;
}

@Injectable()
export class KeyManagementService implements OnModuleInit {
  private readonly logger = new Logger(KeyManagementService.name);
  private privateKey: crypto.KeyObject | null = null;
  private publicKey: crypto.KeyObject | null = null;
  private keyVersion = 1;
  private keyMetadata: KeyMetadata | null = null;
  private keyId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const keyPath = this.configService.get<string>('SIGNING_KEY_PATH');
    const publicKeyPath = this.configService.get<string>(
      'SIGNING_PUBLIC_KEY_PATH',
    );
    const passphrase = this.configService.get<string>('SIGNING_KEY_PASSPHRASE');
    const configuredVersion = this.configService.get<number>(
      'SIGNING_KEY_VERSION',
    );

    if (configuredVersion !== undefined && configuredVersion > 0) {
      this.keyVersion = configuredVersion;
    }

    if (keyPath && publicKeyPath) {
      await this.loadKeys(keyPath, publicKeyPath, passphrase);
    } else {
      this.logger.warn(
        'Signing keys not configured, generating ephemeral keys for development',
      );
      this.generateEphemeralKeys();
    }
  }

  private async loadKeys(
    privateKeyPath: string,
    publicKeyPath: string,
    passphrase?: string,
  ): Promise<void> {
    try {
      if (os.platform() !== 'win32') {
        await this.validateKeyFilePermissions(privateKeyPath);
      }

      const privateKeyPem = await fs.readFile(privateKeyPath, 'utf-8');
      const publicKeyPem = await fs.readFile(publicKeyPath, 'utf-8');

      this.privateKey = crypto.createPrivateKey({
        key: privateKeyPem,
        format: 'pem',
        passphrase,
      });

      this.publicKey = crypto.createPublicKey({
        key: publicKeyPem,
        format: 'pem',
      });

      this.keyId = this.computeKeyId();
      await this.loadKeyMetadata(privateKeyPath);

      this.logger.log(
        `Signing keys loaded successfully (version: ${this.keyVersion.toString()}, keyId: ${this.keyId})`,
      );
    } catch (error) {
      this.logger.error('Failed to load signing keys', error);
      throw new Error('Failed to load signing keys');
    }
  }

  private async validateKeyFilePermissions(keyPath: string): Promise<void> {
    try {
      const stats = await fs.stat(keyPath);
      const mode = stats.mode & 0o777;

      const groupAccess = mode & 0o070;
      const othersAccess = mode & 0o007;

      if (groupAccess > 0 || othersAccess > 0) {
        const modeStr = mode.toString(8).padStart(3, '0');
        this.logger.error(
          `Private key file has insecure permissions: ${modeStr}. ` +
            `Expected ${MAX_PRIVATE_KEY_PERMISSIONS.toString(8)} or stricter. ` +
            `Run: chmod 600 ${keyPath}`,
        );
        throw new Error(
          `Private key file permissions too permissive: ${modeStr}. ` +
            `Private keys must not be accessible to group or others.`,
        );
      }

      this.logger.debug(
        `Private key file permissions validated: ${mode.toString(8)}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Private key file not found: ${keyPath}`);
      }
      throw error;
    }
  }

  private async loadKeyMetadata(privateKeyPath: string): Promise<void> {
    const metadataPath = privateKeyPath + '.meta.json';
    try {
      const metadataJson = await fs.readFile(metadataPath, 'utf-8');
      this.keyMetadata = JSON.parse(metadataJson) as KeyMetadata;
      if (this.keyMetadata.version) {
        this.keyVersion = this.keyMetadata.version;
      }
      this.logger.debug(`Key metadata loaded from ${metadataPath}`);
    } catch {
      this.keyMetadata = {
        version: this.keyVersion,
        createdAt: new Date().toISOString(),
        algorithm: 'Ed25519',
        keyId: this.keyId ?? 'unknown',
      };
    }
  }

  private computeKeyId(): string {
    if (!this.publicKey) return 'unknown';
    const publicKeyRaw = this.getPublicKeyRaw();
    const hash = crypto.createHash('sha256').update(publicKeyRaw).digest();
    return hash.subarray(0, 8).toString('hex');
  }

  private generateEphemeralKeys(): void {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    this.publicKey = publicKey;

    this.keyId = this.computeKeyId();
    this.keyMetadata = {
      version: this.keyVersion,
      createdAt: new Date().toISOString(),
      algorithm: 'Ed25519',
      keyId: this.keyId,
    };

    this.logger.warn('Using ephemeral signing keys - NOT FOR PRODUCTION');
  }

  async generateAndSaveKeys(
    outputDir: string,
    passphrase: string,
    version?: number,
  ): Promise<{
    privateKeyPath: string;
    publicKeyPath: string;
    metadataPath: string;
    keyId: string;
    version: number;
  }> {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

    await fs.mkdir(outputDir, { recursive: true });

    const keyVersion = version ?? 1;
    const publicKeyRaw = publicKey
      .export({ type: 'spki', format: 'der' })
      .subarray(-32);
    const keyIdHash = crypto.createHash('sha256').update(publicKeyRaw).digest();
    const keyId = keyIdHash.subarray(0, 8).toString('hex');

    const privateKeyPath = path.join(outputDir, 'signing.key');
    const publicKeyPath = path.join(outputDir, 'signing.pub');
    const metadataPath = path.join(outputDir, 'signing.key.meta.json');

    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase,
    });

    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const metadata: KeyMetadata = {
      version: keyVersion,
      createdAt: new Date().toISOString(),
      algorithm: 'Ed25519',
      keyId,
    };

    await fs.writeFile(privateKeyPath, privateKeyPem, { mode: 0o600 });
    await fs.writeFile(publicKeyPath, publicKeyPem, { mode: 0o644 });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
      mode: 0o600,
    });

    this.logger.log(
      `Keys generated and saved to ${outputDir} (version: ${keyVersion.toString()}, keyId: ${keyId})`,
    );

    return {
      privateKeyPath,
      publicKeyPath,
      metadataPath,
      keyId,
      version: keyVersion,
    };
  }

  async rotateKeys(
    outputDir: string,
    passphrase: string,
    archiveOld = true,
  ): Promise<{
    privateKeyPath: string;
    publicKeyPath: string;
    metadataPath: string;
    keyId: string;
    version: number;
    archivedPath?: string;
  }> {
    const newVersion = this.keyVersion + 1;

    let archivedPath: string | undefined;
    if (archiveOld && this.privateKey && this.publicKey) {
      const archiveDir = path.join(outputDir, 'archive');
      await fs.mkdir(archiveDir, { recursive: true });
      archivedPath = path.join(
        archiveDir,
        `signing-v${this.keyVersion.toString()}`,
      );
      await fs.mkdir(archivedPath, { recursive: true });

      try {
        await fs.copyFile(
          path.join(outputDir, 'signing.key'),
          path.join(archivedPath, 'signing.key'),
        );
        await fs.copyFile(
          path.join(outputDir, 'signing.pub'),
          path.join(archivedPath, 'signing.pub'),
        );
        if (this.keyMetadata) {
          await fs.writeFile(
            path.join(archivedPath, 'signing.key.meta.json'),
            JSON.stringify(this.keyMetadata, null, 2),
            { mode: 0o600 },
          );
        }
        this.logger.log(
          `Archived old key (version ${this.keyVersion.toString()}) to ${archivedPath}`,
        );
      } catch {
        this.logger.warn(
          'Could not archive old keys, continuing with rotation',
        );
      }
    }

    const result = await this.generateAndSaveKeys(
      outputDir,
      passphrase,
      newVersion,
    );

    await this.loadKeys(
      result.privateKeyPath,
      result.publicKeyPath,
      passphrase,
    );

    return { ...result, archivedPath };
  }

  sign(data: Uint8Array): Uint8Array {
    if (!this.privateKey) {
      throw new Error('Signing key not initialized');
    }

    return crypto.sign(null, Buffer.from(data), this.privateKey);
  }

  verify(data: Uint8Array, signature: Uint8Array): boolean {
    if (!this.publicKey) {
      throw new Error('Public key not initialized');
    }

    return crypto.verify(
      null,
      Buffer.from(data),
      this.publicKey,
      Buffer.from(signature),
    );
  }

  getPublicKeyRaw(): Uint8Array {
    if (!this.publicKey) {
      throw new Error('Public key not initialized');
    }

    const spki = this.publicKey.export({ type: 'spki', format: 'der' });
    return new Uint8Array(spki.subarray(-32));
  }

  getPublicKeyMultibase(): string {
    const rawPublicKey = this.getPublicKeyRaw();
    const multicodecKey = Buffer.concat([
      ED25519_MULTICODEC_PREFIX,
      Buffer.from(rawPublicKey),
    ]);
    return 'z' + base58Encode(multicodecKey);
  }

  getKeyVersion(): number {
    return this.keyVersion;
  }

  getKeyMetadata(): KeyMetadata | null {
    return this.keyMetadata;
  }

  getKeyId(): string | null {
    return this.keyId;
  }

  isInitialized(): boolean {
    return this.privateKey !== null && this.publicKey !== null;
  }

  verifyWithPublicKey(
    data: Uint8Array,
    signature: Uint8Array,
    publicKeyMultibase: string,
  ): boolean {
    const publicKeyRaw = this.decodePublicKeyMultibase(publicKeyMultibase);
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 SPKI prefix
        Buffer.from([
          0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21,
          0x00,
        ]),
        Buffer.from(publicKeyRaw),
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(
      null,
      Buffer.from(data),
      publicKey,
      Buffer.from(signature),
    );
  }

  private decodePublicKeyMultibase(multibase: string): Uint8Array {
    if (!multibase.startsWith('z')) {
      throw new Error(
        'Invalid multibase encoding: expected base58btc (z prefix)',
      );
    }

    const decoded = base58Decode(multibase.slice(1));

    if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
      throw new Error('Invalid Ed25519 multicodec prefix');
    }

    return decoded.subarray(2);
  }
}
