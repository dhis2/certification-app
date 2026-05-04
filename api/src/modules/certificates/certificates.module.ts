import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Certificate } from './entities/certificate.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { Implementation } from '../implementations/entities/implementation.entity';
import { CertificatesService } from './services';
import {
  CertificatesController,
  VerificationController,
} from './certificates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Certificate, Submission, Implementation]),
    ConfigModule,
  ],
  controllers: [CertificatesController, VerificationController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
