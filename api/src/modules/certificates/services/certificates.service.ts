import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Certificate } from '../entities/certificate.entity';
import { Submission } from '../../submissions/entities/submission.entity';
import { SubmissionStatus, CertificationResult } from '../../../common/enums';
import { Implementation } from '../../implementations/entities/implementation.entity';
import { AuditService, AuditEventType, AuditAction } from '../../audit';
import { isUniqueViolation } from '../../../shared/utils/error.utils';
import {
  isValidVerificationCode,
  isValidCertificateNumber,
} from '../../../shared/validators';
import {
  Connection,
  CursorPaginationOptions,
  paginate,
} from 'src/shared/pagination';

const VERIFICATION_CODE_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface FindAllCertificatesOptions extends CursorPaginationOptions {
  implementationId?: string;
}

export type CertificatesConnection = Connection<Certificate>;

interface CertificateValidityConfig {
  validityDays: number;
  renewalReminderDays: number;
}

@Injectable()
export class CertificatesService implements OnModuleInit {
  private readonly logger = new Logger(CertificatesService.name);
  private readonly validityConfig: CertificateValidityConfig;

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepo: Repository<Certificate>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(Implementation)
    private readonly implementationRepo: Repository<Implementation>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.validityConfig = {
      validityDays: this.configService.get<number>(
        'CERTIFICATE_VALIDITY_DAYS',
        730,
      ),
      renewalReminderDays: this.configService.get<number>(
        'CERTIFICATE_RENEWAL_REMINDER_DAYS',
        60,
      ),
    };
  }

  onModuleInit(): void {
    const { validityDays, renewalReminderDays } = this.validityConfig;

    if (validityDays < 30) {
      this.logger.warn(
        `Certificate validity period (${validityDays.toString()} days) is very short. ` +
          'Consider increasing for production use.',
      );
    }

    if (validityDays > 1095) {
      this.logger.warn(
        `Certificate validity period (${validityDays.toString()} days) exceeds 3 years. ` +
          'Consider shorter validity periods.',
      );
    }

    if (renewalReminderDays >= validityDays) {
      this.logger.warn(
        'Renewal reminder days should be less than validity days.',
      );
    }

    this.logger.log(
      `Certificate validity configured: ${validityDays.toString()} days, ` +
        `renewal reminder: ${renewalReminderDays.toString()} days before expiry`,
    );
  }

  private generateCertificateNumber(result: CertificationResult): string {
    const year = new Date().getFullYear();
    const resultCode = result === CertificationResult.PASS ? 'P' : 'F';
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `DHIS2-${year.toString()}-${resultCode}-${randomPart}`;
  }

  private generateVerificationCode(): string {
    const bytes = crypto.randomBytes(12);
    return Array.from(bytes, (b) => VERIFICATION_CODE_BASE32[b % 32]).join('');
  }

  private async allocateVerificationCode(
    certRepo: Repository<Certificate>,
  ): Promise<string> {
    let code = this.generateVerificationCode();
    let existing = await certRepo.findOne({
      where: { verificationCode: code },
    });
    if (existing) {
      code = this.generateVerificationCode();
      existing = await certRepo.findOne({
        where: { verificationCode: code },
      });
      if (existing) {
        throw new ConflictException(
          'Could not allocate a unique verification code',
        );
      }
    }
    return code;
  }

  async issueCertificate(
    submissionId: string,
    issuerId: string,
  ): Promise<Certificate> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['implementation'],
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    if (submission.status !== SubmissionStatus.PASSED) {
      throw new BadRequestException(
        'Can only issue certificates for passed submissions',
      );
    }

    if (!submission.certificationResult || submission.totalScore === null) {
      throw new BadRequestException(
        'Submission must have certification result and score',
      );
    }

    const implementation = await this.implementationRepo.findOne({
      where: { id: submission.implementationId },
    });

    if (!implementation) {
      throw new NotFoundException('Implementation not found');
    }

    const validityPeriod = this.getValidityPeriod(
      submission.certificationResult,
    );

    try {
      const saved = await this.dataSource.transaction(
        'SERIALIZABLE',
        async (manager): Promise<Certificate> => {
          const certRepo = manager.getRepository(Certificate);
          const subRepo = manager.getRepository(Submission);

          const existingCert = await certRepo.findOne({
            where: { submissionId },
          });

          if (existingCert) {
            throw new ConflictException(
              'Certificate already issued for this submission',
            );
          }

          const verificationCode =
            await this.allocateVerificationCode(certRepo);

          const certificate: Certificate = certRepo.create({
            submissionId: submission.id,
            implementationId: implementation.id,
            certificateNumber: this.generateCertificateNumber(
              submission.certificationResult!,
            ),
            certificationResult: submission.certificationResult!,
            controlGroup: submission.targetControlGroup,
            finalScore: submission.totalScore!,
            validFrom: validityPeriod.validFrom,
            validUntil: validityPeriod.validUntil,
            verificationCode,
            issuedById: issuerId,
          });

          const savedCert: Certificate = await certRepo.save(certificate);

          await subRepo.update(submissionId, {
            certificateNumber: savedCert.certificateNumber,
          });

          return savedCert;
        },
      );

      await this.auditService.log(
        {
          eventType: AuditEventType.CERTIFICATE_ISSUED,
          entityType: 'Certificate',
          entityId: saved.id,
          entityName: saved.certificateNumber,
          action: AuditAction.ISSUE,
          newValues: {
            certificateNumber: saved.certificateNumber,
            implementationId: saved.implementationId,
            certificationResult: saved.certificationResult,
            finalScore: saved.finalScore,
            validFrom: saved.validFrom,
            validUntil: saved.validUntil,
          },
        },
        { actorId: issuerId },
      );

      this.logger.log(
        `Certificate ${saved.certificateNumber} issued for submission ${submissionId}`,
      );

      return saved;
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Certificate already issued for this submission',
        );
      }
      throw err;
    }
  }

  async findAll(
    options: FindAllCertificatesOptions = {},
  ): Promise<CertificatesConnection> {
    const qb = this.certificateRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.implementation', 'impl');

    if (options.implementationId) {
      qb.where('c.implementationId = :implementationId', {
        implementationId: options.implementationId,
      });
    }

    return paginate(qb, 'c', {
      first: options.first,
      after: options.after,
      sortDirection: 'DESC',
    });
  }

  async findOne(id: string): Promise<Certificate> {
    const certificate = await this.certificateRepo.findOne({
      where: { id },
      relations: ['implementation', 'submission', 'issuedBy'],
    });

    if (!certificate) {
      throw new NotFoundException(`Certificate ${id} not found`);
    }

    return certificate;
  }

  async findOneWithVerification(id: string): Promise<{
    certificate: Certificate;
    integrityStatus: { valid: boolean };
  }> {
    const certificate = await this.findOne(id);
    const now = new Date();
    const valid =
      !certificate.isRevoked && new Date(certificate.validUntil) >= now;

    return {
      certificate,
      integrityStatus: { valid },
    };
  }

  async findByVerificationCode(code: string): Promise<Certificate> {
    if (!isValidVerificationCode(code)) {
      throw new BadRequestException('Invalid verification code format');
    }

    const certificate = await this.certificateRepo.findOne({
      where: { verificationCode: code },
      relations: ['implementation'],
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findByCertificateNumber(number: string): Promise<Certificate> {
    const normalized = number.toUpperCase();

    if (!isValidCertificateNumber(normalized)) {
      throw new BadRequestException('Invalid certificate number format');
    }

    const certificate = await this.certificateRepo.findOne({
      where: { certificateNumber: normalized },
      relations: ['implementation'],
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findBySubmissionId(submissionId: string): Promise<Certificate> {
    const certificate = await this.certificateRepo.findOne({
      where: { submissionId },
      relations: ['implementation'],
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found for this submission');
    }

    return certificate;
  }

  async revoke(
    id: string,
    reason: string,
    revokerId: string,
  ): Promise<Certificate> {
    const certificate = await this.findOne(id);

    if (certificate.isRevoked) {
      throw new BadRequestException('Certificate is already revoked');
    }

    const previousState = {
      isRevoked: certificate.isRevoked,
      revokedAt: certificate.revokedAt,
      revokedById: certificate.revokedById,
      revocationReason: certificate.revocationReason,
    };

    certificate.isRevoked = true;
    certificate.revokedAt = new Date();
    certificate.revokedById = revokerId;
    certificate.revocationReason = reason;

    const saved = await this.certificateRepo.save(certificate);

    await this.auditService.log(
      {
        eventType: AuditEventType.CERTIFICATE_REVOKED,
        entityType: 'Certificate',
        entityId: saved.id,
        entityName: saved.certificateNumber,
        action: AuditAction.REVOKE,
        oldValues: previousState,
        newValues: {
          isRevoked: saved.isRevoked,
          revokedAt: saved.revokedAt,
          revokedById: saved.revokedById,
          revocationReason: saved.revocationReason,
          certificateNumber: saved.certificateNumber,
          implementationId: saved.implementationId,
        },
      },
      { actorId: revokerId },
    );

    this.logger.log(`Certificate ${certificate.certificateNumber} revoked`);

    return saved;
  }

  async verify(code: string): Promise<{
    valid: boolean;
    certificate?: Certificate;
    checks: {
      found: boolean;
      notRevoked: boolean;
      notExpired: boolean;
    };
  }> {
    try {
      const certificate = await this.findByVerificationCode(code);

      const now = new Date();
      const notExpired = new Date(certificate.validUntil) >= now;
      const notRevoked = !certificate.isRevoked;

      const valid = notExpired && notRevoked;

      try {
        await this.auditService.log(
          {
            eventType: AuditEventType.CERTIFICATE_VERIFIED,
            entityType: 'Certificate',
            entityId: certificate.id,
            entityName: certificate.certificateNumber,
            action: AuditAction.VERIFY,
            newValues: {
              valid,
              notRevoked,
              notExpired,
            },
          },
          {},
        );
      } catch (auditError) {
        this.logger.error(
          'Failed to log audit event for certificate verification',
          auditError instanceof Error ? auditError.stack : String(auditError),
        );
      }

      return {
        valid,
        certificate,
        checks: {
          found: true,
          notRevoked,
          notExpired,
        },
      };
    } catch {
      return {
        valid: false,
        checks: {
          found: false,
          notRevoked: false,
          notExpired: false,
        },
      };
    }
  }

  private getValidityPeriod(result: CertificationResult): {
    validFrom: Date;
    validUntil: Date;
  } {
    const validFrom = new Date();
    const validUntil = new Date();

    if (result === CertificationResult.PASS) {
      validUntil.setDate(
        validUntil.getDate() + this.validityConfig.validityDays,
      );
    }

    return { validFrom, validUntil };
  }

  async findExpiringCertificates(): Promise<Certificate[]> {
    const reminderDate = new Date();
    reminderDate.setDate(
      reminderDate.getDate() + this.validityConfig.renewalReminderDays,
    );

    return this.certificateRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.implementation', 'impl')
      .where('c.validUntil <= :reminderDate', { reminderDate })
      .andWhere('c.validUntil > :now', { now: new Date() })
      .andWhere('c.isRevoked = false')
      .orderBy('c.validUntil', 'ASC')
      .getMany();
  }

  getValidityConfig(): CertificateValidityConfig {
    return { ...this.validityConfig };
  }
}
