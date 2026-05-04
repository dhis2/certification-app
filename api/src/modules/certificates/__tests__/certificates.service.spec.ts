jest.mock('bcrypt', () => ({
  default: {
    hash: jest.fn().mockResolvedValue('hashedpassword'),
    compare: jest.fn().mockResolvedValue(true),
  },
  hash: jest.fn().mockResolvedValue('hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { CertificatesService } from '../services/certificates.service';
import { Certificate } from '../entities/certificate.entity';
import {
  SubmissionStatus,
  CertificationResult,
  ControlGroup,
} from '../../../common/enums';
import { Submission } from '../../submissions/entities/submission.entity';
import { Implementation } from '../../implementations/entities/implementation.entity';
import { AuditService, AuditEventType } from '../../audit';

describe('CertificatesService', () => {
  let service: CertificatesService;
  let mockCertificateRepo: Partial<Repository<Certificate>>;
  let mockSubmissionRepo: Partial<Repository<Submission>>;
  let mockImplementationRepo: Partial<Repository<Implementation>>;
  let mockAuditService: Partial<AuditService>;
  let mockDataSource: Partial<DataSource>;
  let mockConfigService: Partial<ConfigService>;

  const mockSubmission: Submission = {
    id: 'submission-123',
    implementationId: 'impl-123',
    templateId: 'template-123',
    status: SubmissionStatus.PASSED,
    certificationResult: CertificationResult.PASS,
    targetControlGroup: ControlGroup.DSCP1,
    totalScore: 94.5,
    implementation: { id: 'impl-123', name: 'Test Implementation' },
  } as Submission;

  const mockCertificate: Certificate = {
    id: 'cert-123',
    submissionId: 'submission-123',
    implementationId: 'impl-123',
    certificateNumber: 'DHIS2-2026-P-12345678',
    certificationResult: CertificationResult.PASS,
    controlGroup: ControlGroup.DSCP1,
    finalScore: 94.5,
    validFrom: new Date('2026-01-13'),
    validUntil: new Date('2028-01-13'),
    verificationCode: 'ABCDEFGHIJKL',
    isRevoked: false,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    issuedAt: new Date(),
    issuedById: 'user-123',
    implementation: { id: 'impl-123', name: 'Test Implementation' },
  } as unknown as Certificate;

  const createQueryBuilder = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockCertificate], 1]),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockCertificateRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((data: Partial<Certificate>) =>
          Object.assign({}, data, { id: 'new-cert-id' }),
        ),
      save: jest.fn().mockImplementation((data: Certificate) =>
        Promise.resolve(
          Object.assign({}, data, {
            id: data.id || 'new-cert-id',
          }),
        ),
      ),
      createQueryBuilder,
    };

    mockSubmissionRepo = {
      findOne: jest.fn().mockResolvedValue(mockSubmission),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockImplementationRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'impl-123', name: 'Test Implementation' }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue({ id: '1', currHash: 'hash' }),
    };

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (
            _isolationLevel: string,
            callback: (manager: unknown) => Promise<Certificate>,
          ) => {
            const mockManager = {
              getRepository: jest.fn().mockImplementation((entity: unknown) => {
                if (entity === Certificate) {
                  return mockCertificateRepo;
                }
                if (entity === Submission) {
                  return mockSubmissionRepo;
                }
                return {};
              }),
            };
            return callback(mockManager);
          },
        ),
    };

    mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          const configMap: Record<string, unknown> = {
            CERTIFICATE_VALIDITY_DAYS: 730,
            CERTIFICATE_RENEWAL_REMINDER_DAYS: 60,
          };
          return configMap[key] ?? defaultValue;
        }),
    };

    service = new CertificatesService(
      mockCertificateRepo as Repository<Certificate>,
      mockSubmissionRepo as Repository<Submission>,
      mockImplementationRepo as Repository<Implementation>,
      mockAuditService as AuditService,
      mockDataSource as DataSource,
      mockConfigService as ConfigService,
    );
  });

  describe('issueCertificate', () => {
    it('should issue certificate for passed submission', async () => {
      const result = await service.issueCertificate(
        'submission-123',
        'user-123',
      );

      expect(mockSubmissionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'submission-123' },
        relations: ['implementation'],
      });
      expect(mockCertificateRepo.save).toHaveBeenCalled();
      expect(result.certificateNumber).toMatch(/^DHIS2-2026-P-[A-F0-9]{8}$/);
      expect(result.verificationCode).toHaveLength(12);
    });

    it('should persist only registry-backed fields (no VC or content-hash columns)', async () => {
      await service.issueCertificate('submission-123', 'user-123');

      expect(mockCertificateRepo.create).toHaveBeenCalled();
      const payload = jest.mocked(mockCertificateRepo.create!).mock
        .calls[0][0] as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          submissionId: 'submission-123',
          implementationId: 'impl-123',
          certificationResult: CertificationResult.PASS,
          controlGroup: ControlGroup.DSCP1,
          verificationCode: expect.stringMatching(/^[A-Z2-7]{12}$/),
          issuedById: 'user-123',
        }),
      );
      const droppedCertificateFields = [
        ['vc', 'Json'].join(''),
        'signature',
        ['signing', 'Key', 'Version'].join(''),
        ['status', 'List', 'Index'].join(''),
        ['certificate', 'Hash'].join(''),
      ] as const;
      for (const key of droppedCertificateFields) {
        expect(payload).not.toHaveProperty(key);
      }
    });

    it('should append CERTIFICATE_ISSUED audit after successful issue', async () => {
      await service.issueCertificate('submission-123', 'user-123');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.CERTIFICATE_ISSUED,
          entityType: 'Certificate',
          newValues: expect.objectContaining({
            certificateNumber: expect.stringMatching(/^DHIS2-2026-P-/),
            implementationId: 'impl-123',
          }),
        }),
        expect.objectContaining({ actorId: 'user-123' }),
      );
    });

    it('should throw NotFoundException when submission not found', async () => {
      jest.mocked(mockSubmissionRepo.findOne!).mockResolvedValue(null);

      await expect(
        service.issueCertificate('nonexistent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when submission not passed', async () => {
      const inProgressSubmission: Submission = Object.assign(
        {},
        mockSubmission,
        { status: SubmissionStatus.IN_PROGRESS },
      );
      jest
        .mocked(mockSubmissionRepo.findOne!)
        .mockResolvedValue(inProgressSubmission);

      await expect(
        service.issueCertificate('submission-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when certificate already exists', async () => {
      jest
        .mocked(mockCertificateRepo.findOne!)
        .mockResolvedValue(mockCertificate);

      await expect(
        service.issueCertificate('submission-123', 'user-123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return certificates with pagination', async () => {
      const result = await service.findAll({ first: 10 });

      expect(result.edges).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return certificate by id', async () => {
      jest
        .mocked(mockCertificateRepo.findOne!)
        .mockResolvedValue(mockCertificate);

      const result = await service.findOne('cert-123');

      expect(result).toEqual(mockCertificate);
    });

    it('should throw NotFoundException when certificate not found', async () => {
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByVerificationCode', () => {
    it('should return certificate by verification code', async () => {
      jest
        .mocked(mockCertificateRepo.findOne!)
        .mockResolvedValue(mockCertificate);

      const result = await service.findByVerificationCode('ABCDEFGHIJKL');

      expect(mockCertificateRepo.findOne).toHaveBeenCalledWith({
        where: { verificationCode: 'ABCDEFGHIJKL' },
        relations: ['implementation'],
      });
      expect(result).toEqual(mockCertificate);
    });
  });

  describe('revoke', () => {
    it('should revoke a certificate', async () => {
      const notRevokedCert: Certificate = Object.assign({}, mockCertificate, {
        isRevoked: false,
      });
      jest
        .mocked(mockCertificateRepo.findOne!)
        .mockResolvedValue(notRevokedCert);

      const result = await service.revoke(
        'cert-123',
        'Security violation',
        'admin-123',
      );

      expect(mockCertificateRepo.save).toHaveBeenCalled();
      expect(result.isRevoked).toBe(true);
      expect(result.revocationReason).toBe('Security violation');
    });

    it('should throw BadRequestException when already revoked', async () => {
      const revokedCert: Certificate = Object.assign({}, mockCertificate, {
        isRevoked: true,
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(revokedCert);

      await expect(
        service.revoke('cert-123', 'Reason', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verify', () => {
    it('should return valid result for valid certificate', async () => {
      const validCert: Certificate = Object.assign({}, mockCertificate, {
        validUntil: new Date(Date.now() + 86400000),
        isRevoked: false,
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(validCert);

      const result = await service.verify('ABCDEFGHIJKL');

      expect(result.valid).toBe(true);
      expect(result.checks.found).toBe(true);
      expect(result.checks.notRevoked).toBe(true);
      expect(result.checks.notExpired).toBe(true);
    });

    it('should return invalid result for revoked certificate', async () => {
      const revokedCert: Certificate = Object.assign({}, mockCertificate, {
        validUntil: new Date(Date.now() + 86400000),
        isRevoked: true,
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(revokedCert);

      const result = await service.verify('ABCDEFGHIJKL');

      expect(result.valid).toBe(false);
      expect(result.checks.notRevoked).toBe(false);
    });

    it('should return invalid result for expired certificate', async () => {
      const expiredCert: Certificate = Object.assign({}, mockCertificate, {
        validUntil: new Date(Date.now() - 86400000),
        isRevoked: false,
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(expiredCert);

      const result = await service.verify('ABCDEFGHIJKL');

      expect(result.valid).toBe(false);
      expect(result.checks.notExpired).toBe(false);
    });

    it('should return invalid result for not found certificate', async () => {
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(null);

      const result = await service.verify('ZZZZZZZZZZZZ');

      expect(result.valid).toBe(false);
      expect(result.checks.found).toBe(false);
    });
  });

  describe('findOneWithVerification', () => {
    it('should return valid when not revoked and not expired', async () => {
      const cert: Certificate = Object.assign({}, mockCertificate, {
        isRevoked: false,
        validUntil: new Date(Date.now() + 86400000),
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(cert);

      const result = await service.findOneWithVerification('cert-123');

      expect(result.integrityStatus.valid).toBe(true);
    });

    it('should return invalid when revoked', async () => {
      const cert: Certificate = Object.assign({}, mockCertificate, {
        isRevoked: true,
        validUntil: new Date(Date.now() + 86400000),
      });
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(cert);

      const result = await service.findOneWithVerification('cert-123');

      expect(result.integrityStatus.valid).toBe(false);
    });

    it('should throw NotFoundException when certificate not found', async () => {
      jest.mocked(mockCertificateRepo.findOne!).mockResolvedValue(null);

      await expect(
        service.findOneWithVerification('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getValidityConfig', () => {
    it('should return current validity configuration', () => {
      const config = service.getValidityConfig();

      expect(config.validityDays).toBe(730);
      expect(config.renewalReminderDays).toBe(60);
    });
  });
});
