import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Certificate } from '../entities/certificate.entity';

/** Whether the certificate is currently valid for verification (not revoked, not past validUntil). */
export class IntegrityStatusDto {
  @ApiProperty({
    description:
      'True when the certificate is not revoked and the current date is on or before validUntil',
  })
  valid!: boolean;
}

export class CertificateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  submissionId!: string;

  @ApiProperty()
  implementationId!: string;

  @ApiPropertyOptional()
  implementationName?: string | undefined;

  @ApiProperty()
  certificateNumber!: string;

  @ApiProperty({ enum: ['pass', 'fail'] })
  certificationResult!: string;

  @ApiProperty()
  finalScore!: number;

  @ApiProperty()
  validFrom!: string;

  @ApiProperty()
  validUntil!: string;

  @ApiProperty()
  verificationCode!: string;

  @ApiProperty()
  isRevoked!: boolean;

  @ApiPropertyOptional()
  revokedAt?: string | null;

  @ApiPropertyOptional()
  revocationReason?: string | null;

  @ApiProperty()
  issuedAt!: string;

  @ApiPropertyOptional()
  issuedById?: string | null;

  @ApiPropertyOptional()
  controlGroup?: string;

  @ApiPropertyOptional()
  implementation?: {
    id: string;
    name: string;
  };

  @ApiPropertyOptional({
    type: IntegrityStatusDto,
    description:
      'Registry validity (included when the service attaches verification metadata)',
  })
  integrityStatus?: IntegrityStatusDto;

  static fromEntity(
    cert: Certificate,
    integrityStatus?: IntegrityStatusDto,
  ): CertificateResponseDto {
    const dto = new CertificateResponseDto();
    dto.id = cert.id;
    dto.submissionId = cert.submissionId;
    dto.implementationId = cert.implementationId;
    dto.implementationName = cert.implementation?.name;
    dto.certificateNumber = cert.certificateNumber;
    dto.certificationResult = cert.certificationResult;
    dto.finalScore = cert.finalScore;
    dto.validFrom =
      cert.validFrom instanceof Date
        ? cert.validFrom.toISOString()
        : String(cert.validFrom);
    dto.validUntil =
      cert.validUntil instanceof Date
        ? cert.validUntil.toISOString()
        : String(cert.validUntil);
    dto.verificationCode = cert.verificationCode;
    dto.isRevoked = cert.isRevoked;
    dto.revokedAt = cert.revokedAt?.toISOString() ?? null;
    dto.revocationReason = cert.revocationReason;
    dto.issuedAt =
      cert.issuedAt instanceof Date
        ? cert.issuedAt.toISOString()
        : String(cert.issuedAt);
    dto.issuedById = cert.issuedById;
    dto.controlGroup = cert.controlGroup;
    if (cert.implementation) {
      dto.implementation = {
        id: cert.implementation.id,
        name: cert.implementation.name,
      };
    }
    if (integrityStatus) {
      dto.integrityStatus = integrityStatus;
    }
    return dto;
  }
}

export class VerificationResultDto {
  @ApiProperty()
  valid!: boolean;

  @ApiPropertyOptional({ type: CertificateResponseDto })
  certificate?: CertificateResponseDto | undefined;

  @ApiProperty({
    description: 'Detailed verification check results',
  })
  checks!: {
    found: boolean;
    notRevoked: boolean;
    notExpired: boolean;
  };
}
