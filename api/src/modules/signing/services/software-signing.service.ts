import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type {
  SigningService,
  VerificationMethod,
  DataIntegrityProof,
} from '../interfaces';
import { CanonicalizationService } from './canonicalization.service';
import { KeyManagementService } from './key-management.service';
import { base58Encode, base58Decode } from './base58';

interface ProofConfig {
  type: 'DataIntegrityProof';
  cryptosuite: 'eddsa-rdfc-2022';
  created: string;
  verificationMethod: string;
  proofPurpose: 'assertionMethod';
}

@Injectable()
export class SoftwareSigningService implements SigningService {
  private readonly issuerDid: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly keyManagement: KeyManagementService,
    private readonly canonicalization: CanonicalizationService,
  ) {
    this.issuerDid =
      this.configService.get<string>('ISSUER_DID') ??
      'did:web:certification.dhis2.org';
  }

  sign(data: Uint8Array): Promise<Uint8Array> {
    return Promise.resolve(this.keyManagement.sign(data));
  }

  getPublicKey(): Promise<Uint8Array> {
    return Promise.resolve(this.keyManagement.getPublicKeyRaw());
  }

  getPublicKeyMultibase(): Promise<string> {
    return Promise.resolve(this.keyManagement.getPublicKeyMultibase());
  }

  getKeyVersion(): number {
    return this.keyManagement.getKeyVersion();
  }

  async getVerificationMethod(): Promise<VerificationMethod> {
    const publicKeyMultibase = await this.getPublicKeyMultibase();
    const year = new Date().getFullYear();
    const keyVersion = this.getKeyVersion();

    return {
      id: `${this.issuerDid}#signing-key-${String(year)}-v${String(keyVersion)}`,
      type: 'Ed25519VerificationKey2020',
      controller: this.issuerDid,
      publicKeyMultibase,
    };
  }

  /**
   * Creates a W3C Data Integrity proof following EdDSA Cryptosuites v1.0.
   *
   * Per Section 3.2.4 (Hashing), the signature input is:
   *   hashData = SHA256(canonicalProofConfig) || SHA256(transformedDocument)
   *
   * This ensures the proof options are cryptographically bound to the signature,
   * preventing proof option substitution attacks.
   *
   * @see https://www.w3.org/TR/vc-di-eddsa/#hashing-eddsa-rdfc-2022
   */
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

    const canonicalProofConfig = this.canonicalizeProofConfig(proofConfig);

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

    const canonicalProofConfig = this.canonicalizeProofConfig(proofConfig);
    const hashData = this.createHashData(
      canonicalProofConfig,
      canonicalDocument,
    );

    const signature = base58Decode(proof.proofValue.slice(1));

    return this.keyManagement.verify(hashData, signature);
  }

  private canonicalizeProofConfig(proofConfig: ProofConfig): Uint8Array {
    return this.canonicalization.canonicalizeProofOptions(proofConfig);
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

// Re-export for backwards compatibility
export { base58Encode, base58Decode } from './base58';
