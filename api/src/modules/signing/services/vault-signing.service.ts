import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import type {
  SigningService,
  VerificationMethod,
  DataIntegrityProof,
} from '../interfaces';
import { CanonicalizationService } from './canonicalization.service';
import { base58Encode, base58Decode } from './base58';
import { VaultService } from '../../vault';
import vaultConfig from '../../vault/vault.config';

interface ProofConfig {
  type: 'DataIntegrityProof';
  cryptosuite: 'eddsa-rdfc-2022';
  created: string;
  verificationMethod: string;
  proofPurpose: 'assertionMethod';
}

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

@Injectable()
export class VaultSigningService implements SigningService, OnModuleInit {
  private readonly issuerDid: string;
  private readonly keyVersion: number;
  private readonly cacheTtlMs: number;
  private cachedPublicKey: Uint8Array | null = null;
  private cacheExpiresAt = 0;

  constructor(
    private readonly vaultService: VaultService,
    private readonly configService: ConfigService,
    private readonly canonicalization: CanonicalizationService,
    @Inject(vaultConfig.KEY)
    private readonly vaultCfg: ConfigType<typeof vaultConfig>,
  ) {
    this.issuerDid =
      this.configService.get<string>('ISSUER_DID') ??
      'did:web:certification.dhis2.org';
    this.keyVersion =
      this.configService.get<number>('SIGNING_KEY_VERSION') ?? 1;
    this.cacheTtlMs = this.vaultCfg.publicKeyCacheTtlMs;
  }

  async onModuleInit(): Promise<void> {
    if (!this.vaultService.isEnabled()) return;
    await this.refreshPublicKey();
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return this.vaultService.transitSign(data);
  }

  async getPublicKey(): Promise<Uint8Array> {
    if (!this.cachedPublicKey || Date.now() >= this.cacheExpiresAt) {
      await this.refreshPublicKey();
    }
    return this.cachedPublicKey!;
  }

  private async refreshPublicKey(): Promise<void> {
    this.cachedPublicKey = await this.vaultService.transitGetPublicKey();
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
  }

  async getPublicKeyMultibase(): Promise<string> {
    const raw = await this.getPublicKey();
    const prefixed = new Uint8Array(
      ED25519_MULTICODEC_PREFIX.length + raw.length,
    );
    prefixed.set(ED25519_MULTICODEC_PREFIX);
    prefixed.set(raw, ED25519_MULTICODEC_PREFIX.length);
    return `z${base58Encode(Buffer.from(prefixed))}`;
  }

  getKeyVersion(): number {
    return this.keyVersion;
  }

  async getVerificationMethod(): Promise<VerificationMethod> {
    const publicKeyMultibase = await this.getPublicKeyMultibase();
    const year = new Date().getFullYear();

    return {
      id: `${this.issuerDid}#signing-key-${String(year)}-v${String(this.keyVersion)}`,
      type: 'Ed25519VerificationKey2020',
      controller: this.issuerDid,
      publicKeyMultibase,
    };
  }

  async createDataIntegrityProof(
    canonicalDocument: Uint8Array,
  ): Promise<DataIntegrityProof> {
    const verificationMethod = await this.getVerificationMethod();
    const created = new Date().toISOString();

    const proofConfig: ProofConfig = {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-rdfc-2022',
      created,
      verificationMethod: verificationMethod.id,
      proofPurpose: 'assertionMethod',
    };

    const canonicalProofConfig =
      this.canonicalization.canonicalizeProofOptions(proofConfig);
    const hashData = this.createHashData(
      canonicalProofConfig,
      canonicalDocument,
    );

    const signature = await this.sign(hashData);

    return {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-rdfc-2022',
      created,
      verificationMethod: verificationMethod.id,
      proofPurpose: 'assertionMethod',
      proofValue: `z${base58Encode(Buffer.from(signature))}`,
    };
  }

  verifyDataIntegrityProof(
    canonicalDocument: Uint8Array,
    proof: DataIntegrityProof,
  ): boolean {
    const proofConfig: ProofConfig = {
      type: proof.type,
      cryptosuite: proof.cryptosuite,
      created: proof.created,
      verificationMethod: proof.verificationMethod,
      proofPurpose: proof.proofPurpose,
    };

    const canonicalProofConfig =
      this.canonicalization.canonicalizeProofOptions(proofConfig);
    const hashData = this.createHashData(
      canonicalProofConfig,
      canonicalDocument,
    );

    const signature = base58Decode(proof.proofValue.slice(1));

    if (!this.cachedPublicKey) {
      throw new Error('Public key not available for verification');
    }

    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 SPKI prefix
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(this.cachedPublicKey),
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(null, hashData, keyObject, Buffer.from(signature));
  }

  private createHashData(
    canonicalProofConfig: Uint8Array,
    canonicalDocument: Uint8Array,
  ): Uint8Array {
    const proofConfigHash = crypto
      .createHash('sha256')
      .update(canonicalProofConfig)
      .digest();
    const documentHash = crypto
      .createHash('sha256')
      .update(canonicalDocument)
      .digest();

    const hashData = new Uint8Array(64);
    hashData.set(proofConfigHash, 0);
    hashData.set(documentHash, 32);
    return hashData;
  }
}
