import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MetricsService, AlertingService } from './services';
import { MonitoringController } from './monitoring.controller';
import { Certificate } from '../certificates/entities/certificate.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * System monitoring and alerting.
 *
 * Implements NIST SP 800-53 controls CA-7, SI-4, AU-6.
 *
 * @see https://csrc.nist.gov/pubs/sp/800/137/final
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Certificate, AuditLog]),
  ],
  controllers: [MonitoringController],
  providers: [MetricsService, AlertingService],
  exports: [MetricsService, AlertingService],
})
export class MonitoringModule {}
