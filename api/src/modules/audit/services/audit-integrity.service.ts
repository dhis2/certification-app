import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AuditLog } from '../entities/audit-log.entity';
import { VaultService } from '../../vault';

export interface SignatureVerificationResult {
  valid: boolean;
  entryId: string;
  expectedSignature?: string;
  actualSignature?: string;
  errorMessage?: string;
}

export interface BatchVerificationResult {
  valid: boolean;
  entriesChecked: number;
  invalidEntries: SignatureVerificationResult[];
  errorMessage?: string;
}

/** HMAC-SHA256 signatures for audit log tamper detection (complements hash chain). */
@Injectable()
export class AuditIntegrityService implements OnModuleInit {
  private readonly logger = new Logger(AuditIntegrityService.name);

  private hmacKey: Buffer | null = null;
  private readonly algorithm = 'sha256';
  private readonly minKeyLength = 32;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly vaultService?: VaultService,
  ) {}

  onModuleInit(): void {
    const keyBase64 = this.configService.get<string>('AUDIT_LOG_HMAC_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (keyBase64) {
      try {
        this.hmacKey = Buffer.from(keyBase64, 'base64');

        if (this.hmacKey.length < this.minKeyLength) {
          this.logger.warn(
            `AUDIT_LOG_HMAC_KEY is shorter than recommended ${this.minKeyLength.toString()} bytes. ` +
              'Consider using a longer key for production.',
          );
        }

        this.logger.log(
          'Audit log HMAC signing initialized with configured key',
        );
      } catch {
        this.logger.error(
          'Failed to decode AUDIT_LOG_HMAC_KEY - must be valid base64',
        );
        this.hmacKey = null;
      }
    } else if (nodeEnv === 'production') {
      this.logger.error(
        'AUDIT_LOG_HMAC_KEY not configured in production! ' +
          'Audit logs will not have cryptographic signatures. ' +
          'This is a security risk per NIST SP 800-92.',
      );
    } else {
      // Development/staging: generate ephemeral key with warning
      this.hmacKey = crypto.randomBytes(32);
      this.logger.warn(
        'AUDIT_LOG_HMAC_KEY not configured - using ephemeral key. ' +
          'Audit log signatures will not persist across restarts. ' +
          'Configure AUDIT_LOG_HMAC_KEY for production use.',
      );
    }
  }

  async generateSignature(entry: Partial<AuditLog>): Promise<string> {
    const dataToSign = this.buildSignatureData(entry);
    const payload = JSON.stringify(dataToSign);

    if (this.vaultService?.isEnabled()) {
      return this.vaultService.transitHmac(payload);
    }

    if (!this.hmacKey) {
      this.logger.warn('Cannot generate signature: HMAC key not available');
      return '';
    }

    const hmac = crypto.createHmac(this.algorithm, this.hmacKey);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  async verifySignature(entry: AuditLog): Promise<SignatureVerificationResult> {
    if (!this.hmacKey && !this.vaultService?.isEnabled()) {
      return {
        valid: false,
        entryId: entry.id,
        errorMessage: 'HMAC key not available for verification',
      };
    }

    if (!entry.signature) {
      return {
        valid: false,
        entryId: entry.id,
        errorMessage: 'Entry has no signature',
      };
    }

    const expectedSignature = await this.generateSignature(entry);

    const isValid = this.timingSafeEqual(entry.signature, expectedSignature);

    return {
      valid: isValid,
      entryId: entry.id,
      expectedSignature: isValid ? undefined : expectedSignature,
      actualSignature: isValid ? undefined : entry.signature,
      errorMessage: isValid
        ? undefined
        : 'Signature mismatch - entry may have been tampered',
    };
  }

  async verifyBatch(entries: AuditLog[]): Promise<BatchVerificationResult> {
    if (!this.hmacKey && !this.vaultService?.isEnabled()) {
      return {
        valid: false,
        entriesChecked: 0,
        invalidEntries: [],
        errorMessage: 'HMAC key not available for verification',
      };
    }

    const invalidEntries: SignatureVerificationResult[] = [];

    for (const entry of entries) {
      const result = await this.verifySignature(entry);
      if (!result.valid) {
        invalidEntries.push(result);
      }
    }

    return {
      valid: invalidEntries.length === 0,
      entriesChecked: entries.length,
      invalidEntries,
      errorMessage:
        invalidEntries.length > 0
          ? `${invalidEntries.length.toString()} of ${entries.length.toString()} entries have invalid signatures`
          : undefined,
    };
  }

  isConfigured(): boolean {
    return this.hmacKey !== null;
  }

  getKeyFingerprint(): string | null {
    if (!this.hmacKey) {
      return null;
    }

    return crypto
      .createHash('sha256')
      .update(this.hmacKey)
      .digest('hex')
      .substring(0, 16);
  }

  private buildSignatureData(
    entry: Partial<AuditLog>,
  ): Record<string, unknown> {
    return {
      eventType: entry.eventType ?? null,
      action: entry.action ?? null,

      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,

      actorId: entry.actorId ?? null,
      actorIp: entry.actorIp ?? null,

      oldValues: entry.oldValues ?? null,
      newValues: entry.newValues ?? null,

      prevHash: entry.prevHash ?? null,
      currHash: entry.currHash ?? null,
    };
  }

  /**
   * Constant-time comparison that never leaks length information.
   * Both inputs are hashed to a fixed 32-byte digest before comparing,
   * so the comparison time is independent of input length.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }
}
