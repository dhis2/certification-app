import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CanonicalizationService } from '../../signing/services';
import { SIGNING_SERVICE, type SigningService } from '../../signing/interfaces';
import type {
  DHIS2ServerCredential,
  IssuanceInput,
  CredentialSubjectResult,
} from '../interfaces';

export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}

export interface IssuerConfig {
  did: string;
  name: string;
  baseUrl: string;
  usingDefaults: boolean;
}

const DEVELOPMENT_DEFAULTS = {
  issuerDid: 'did:web:localhost',
  issuerName: 'DHIS2 Server Certification (Development)',
  baseUrl: 'http://localhost:3001',
} as const;

@Injectable()
export class CredentialIssuanceService implements OnModuleInit {
  private readonly logger = new Logger(CredentialIssuanceService.name);
  private readonly issuerDid: string;
  private readonly issuerName: string;
  private readonly baseUrl: string;
  private readonly isProduction: boolean;
  private readonly usingDefaults: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SIGNING_SERVICE) private readonly signingService: SigningService,
    private readonly canonicalization: CanonicalizationService,
  ) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    const configuredDid = this.configService.get<string>('ISSUER_DID');
    const configuredName = this.configService.get<string>('ISSUER_NAME');
    const configuredBaseUrl = this.configService.get<string>('APP_BASE_URL');

    this.usingDefaults =
      !configuredDid || !configuredName || !configuredBaseUrl;

    this.issuerDid = configuredDid ?? DEVELOPMENT_DEFAULTS.issuerDid;
    this.issuerName = configuredName ?? DEVELOPMENT_DEFAULTS.issuerName;
    this.baseUrl = configuredBaseUrl ?? DEVELOPMENT_DEFAULTS.baseUrl;
  }

  onModuleInit(): void {
    if (
      !this.issuerDid.startsWith('did:web:') &&
      !this.issuerDid.startsWith('did:key:')
    ) {
      const message = `ISSUER_DID "${this.issuerDid}" should use did:web: or did:key: method`;
      if (this.isProduction) {
        throw new Error(message);
      }
      this.logger.warn(message);
    }

    if (this.isProduction && !this.baseUrl.startsWith('https://')) {
      throw new Error('APP_BASE_URL must use HTTPS in production');
    }

    if (this.usingDefaults) {
      if (this.isProduction) {
        // This should not happen as env.validation.ts enforces production config
        throw new Error(
          'Issuer configuration incomplete in production. ' +
            'Set ISSUER_DID, ISSUER_NAME, and APP_BASE_URL environment variables.',
        );
      }
      this.logger.warn(
        'Using development defaults for issuer configuration. ' +
          'Set ISSUER_DID, ISSUER_NAME, and APP_BASE_URL for production.',
      );
    }

    this.logger.log(
      `Issuer configured: ${this.issuerName} (${this.issuerDid})`,
    );
    this.logger.log(`Base URL: ${this.baseUrl}`);
  }

  getIssuerConfig(): IssuerConfig {
    return {
      did: this.issuerDid,
      name: this.issuerName,
      baseUrl: this.baseUrl,
      usingDefaults: this.usingDefaults,
    };
  }

  async issueCredential(
    input: IssuanceInput,
    statusListIndex: number,
  ): Promise<{
    credential: DHIS2ServerCredential;
    certificateHash: string;
    signature: string;
    keyVersion: number;
  }> {
    const credentialId = `${this.baseUrl}/certs/${input.submissionId}`;
    const year = new Date().getFullYear();
    const yearStr = year.toString();
    const indexStr = statusListIndex.toString();

    const levelCriteria = this.getResultCriteria(
      input.certificationResult,
      input.controlGroup,
    );

    const results: CredentialSubjectResult[] = [
      {
        type: 'Result',
        resultDescription: 'Overall Score',
        value: `${Math.round(input.finalScore).toString()}%`,
      },
      ...input.categoryScores.map((cat) => ({
        type: 'Result' as const,
        resultDescription: cat.name,
        value: `${Math.round(cat.score).toString()}%`,
      })),
    ];

    const unsignedCredential: Omit<DHIS2ServerCredential, 'proof'> = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      ],
      id: credentialId,
      type: [
        'VerifiableCredential',
        'OpenBadgeCredential',
        'DHIS2ServerCertification',
      ],
      issuer: {
        id: this.issuerDid,
        type: 'Profile',
        name: this.issuerName,
      },
      validFrom: input.validFrom.toISOString(),
      validUntil: input.validUntil.toISOString(),
      credentialSubject: {
        type: 'AchievementSubject',
        id: `urn:uuid:${input.implementationId}`,
        achievement: {
          id: `${this.baseUrl}/achievements/server-certification-${input.controlGroup.toLowerCase()}`,
          type: 'Achievement',
          name: `DHIS2 Server Certification - ${input.controlGroup}`,
          description: `Certified DHIS2 server deployment meeting ${input.controlGroup} security requirements`,
          achievementType: 'Certificate',
          criteria: {
            narrative: levelCriteria,
          },
        },
        result: results,
      },
      credentialStatus: {
        id: `${this.baseUrl}/status-list/${yearStr}#${indexStr}`,
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation',
        statusListIndex: indexStr,
        statusListCredential: `${this.baseUrl}/status-list/${yearStr}`,
      },
    };

    const canonicalData = await this.canonicalize(unsignedCredential);
    const proof =
      await this.signingService.createDataIntegrityProof(canonicalData);

    const signedCredential: DHIS2ServerCredential = {
      ...unsignedCredential,
      proof,
    };

    const certificateHash = await this.computeHash(signedCredential);

    this.logger.log(
      `Issued credential ${credentialId} for implementation ${input.implementationId}`,
    );

    return {
      credential: signedCredential,
      certificateHash,
      signature: proof.proofValue,
      keyVersion: this.signingService.getKeyVersion(),
    };
  }

  generateCertificateNumber(result: 'pass' | 'fail'): string {
    const year = new Date().getFullYear();
    const resultCode = result === 'pass' ? 'P' : 'F';
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `DHIS2-${year.toString()}-${resultCode}-${randomPart}`;
  }

  generateVerificationCode(): string {
    return crypto.randomBytes(8).toString('base64url');
  }

  async computeHash(credential: DHIS2ServerCredential): Promise<string> {
    const canonical = await this.canonicalize(credential);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  async verifyCredentialIntegrity(
    credential: DHIS2ServerCredential,
    expectedHash: string,
  ): Promise<boolean> {
    const actualHash = await this.computeHash(credential);
    return actualHash === expectedHash;
  }

  async verifyCredentialSignature(
    credential: DHIS2ServerCredential,
  ): Promise<SignatureVerificationResult> {
    try {
      const proof = credential.proof;
      if (!proof) {
        return { valid: false, error: 'Credential has no proof' };
      }

      const proofType = proof.type as string;
      if (proofType !== 'DataIntegrityProof') {
        return { valid: false, error: `Unsupported proof type: ${proofType}` };
      }

      const cryptosuite = proof.cryptosuite as string;
      if (cryptosuite !== 'eddsa-rdfc-2022') {
        return {
          valid: false,
          error: `Unsupported cryptosuite: ${cryptosuite}`,
        };
      }

      const { proof: _proof, ...unsignedCredential } = credential;

      const canonicalDocument = await this.canonicalize(unsignedCredential);

      const isValid = this.signingService.verifyDataIntegrityProof(
        canonicalDocument,
        proof,
      );

      if (!isValid) {
        return { valid: false, error: 'Signature verification failed' };
      }

      return { valid: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unknown error during verification';
      this.logger.error(`Signature verification error: ${message}`);
      return { valid: false, error: message };
    }
  }

  async verifyCredentialFull(
    credential: DHIS2ServerCredential,
    expectedHash: string,
  ): Promise<{
    valid: boolean;
    integrityValid: boolean;
    signatureValid: boolean;
    error?: string;
  }> {
    const integrityValid = await this.verifyCredentialIntegrity(
      credential,
      expectedHash,
    );
    const signatureResult = await this.verifyCredentialSignature(credential);

    return {
      valid: integrityValid && signatureResult.valid,
      integrityValid,
      signatureValid: signatureResult.valid,
      error: signatureResult.error,
    };
  }

  private canonicalize(data: unknown): Promise<Uint8Array> {
    return this.canonicalization.canonicalizeDocument(data as object);
  }

  private getResultCriteria(
    result: 'pass' | 'fail',
    controlGroup: string,
  ): string {
    if (result === 'pass') {
      return `All required technical controls for ${controlGroup} Control Group are compliant`;
    }
    return 'Some required technical controls are non-compliant';
  }
}
