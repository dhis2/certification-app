import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './services/audit.service';
import { AuditIntegrityService } from './services/audit-integrity.service';
import { AuditRetentionService } from './services/audit-retention.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  providers: [AuditService, AuditIntegrityService, AuditRetentionService],
  controllers: [AuditController],
  exports: [AuditService, AuditIntegrityService, AuditRetentionService],
})
export class AuditModule {}
