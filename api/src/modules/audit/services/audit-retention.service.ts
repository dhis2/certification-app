import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, type DeleteResult } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLog, AuditEventType } from '../entities/audit-log.entity';

export interface AuditRetentionPolicy {
  defaultRetentionDays: number;
  securityEventRetentionDays: number;
  certificateEventRetentionDays: number;
  archiveBeforeDelete: boolean;
  cleanupBatchSize: number;
  autoCleanupEnabled: boolean;
}

export interface RetentionCleanupResult {
  success: boolean;
  archivedCount: number;
  deletedCount: number;
  errorMessage?: string;
  executionTimeMs: number;
}

export interface ArchivedAuditLog {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  action: string;
  actorId: string | null;
  createdAt: Date;
  archivedAt: Date;
  originalData: Record<string, unknown>;
}

const SECURITY_EVENT_TYPES: string[] = [
  AuditEventType.LOGIN_SUCCESS,
  AuditEventType.LOGIN_FAILED,
  AuditEventType.LOGOUT,
  AuditEventType.TOKEN_REFRESH,
  AuditEventType.PASSWORD_CHANGED,
  AuditEventType.USER_DEACTIVATED,
  AuditEventType.USER_ACTIVATED,
  AuditEventType.SETTINGS_CHANGED,
];

const CERTIFICATE_EVENT_TYPES: string[] = [
  AuditEventType.CERTIFICATE_ISSUED,
  AuditEventType.CERTIFICATE_REVOKED,
  AuditEventType.CERTIFICATE_VERIFIED,
];

@Injectable()
export class AuditRetentionService implements OnModuleInit {
  private readonly logger = new Logger(AuditRetentionService.name);

  private policy: AuditRetentionPolicy;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly configService: ConfigService,
  ) {
    this.policy = {
      defaultRetentionDays: this.parseIntWithDefault(
        this.configService.get('AUDIT_RETENTION_DEFAULT_DAYS'),
        90,
      ),
      securityEventRetentionDays: this.parseIntWithDefault(
        this.configService.get('AUDIT_RETENTION_SECURITY_DAYS'),
        365,
      ),
      certificateEventRetentionDays: this.parseIntWithDefault(
        this.configService.get('AUDIT_RETENTION_CERTIFICATE_DAYS'),
        730,
      ),
      archiveBeforeDelete:
        this.configService.get('AUDIT_RETENTION_ARCHIVE') === 'true' ||
        this.configService.get('AUDIT_RETENTION_ARCHIVE') === true ||
        this.configService.get('AUDIT_RETENTION_ARCHIVE') === undefined,
      cleanupBatchSize: this.parseIntWithDefault(
        this.configService.get('AUDIT_RETENTION_BATCH_SIZE'),
        1000,
      ),
      autoCleanupEnabled:
        this.configService.get('AUDIT_RETENTION_AUTO_CLEANUP') === 'true' ||
        this.configService.get('AUDIT_RETENTION_AUTO_CLEANUP') === true ||
        this.configService.get('AUDIT_RETENTION_AUTO_CLEANUP') === undefined,
    };
  }

  private parseIntWithDefault(value: unknown, defaultValue: number): number {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : defaultValue;
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
    return defaultValue;
  }

  onModuleInit(): void {
    this.logger.log('Audit retention policy initialized:');
    this.logger.log(
      `  Default retention: ${this.policy.defaultRetentionDays.toString()} days`,
    );
    this.logger.log(
      `  Security events: ${this.policy.securityEventRetentionDays.toString()} days`,
    );
    this.logger.log(
      `  Certificate events: ${this.policy.certificateEventRetentionDays.toString()} days`,
    );
    this.logger.log(
      `  Archive before delete: ${this.policy.archiveBeforeDelete ? 'enabled' : 'disabled'}`,
    );
    this.logger.log(
      `  Auto cleanup: ${this.policy.autoCleanupEnabled ? 'enabled' : 'disabled'}`,
    );
  }

  getPolicy(): AuditRetentionPolicy {
    return { ...this.policy };
  }

  calculateArchiveDate(entry: Pick<AuditLog, 'eventType' | 'createdAt'>): Date {
    const createdAt =
      entry.createdAt instanceof Date ? entry.createdAt : new Date();

    let retentionDays: number;
    if (SECURITY_EVENT_TYPES.includes(entry.eventType)) {
      retentionDays = this.policy.securityEventRetentionDays;
    } else if (CERTIFICATE_EVENT_TYPES.includes(entry.eventType)) {
      retentionDays = this.policy.certificateEventRetentionDays;
    } else {
      retentionDays = this.policy.defaultRetentionDays;
    }

    const archiveDate = new Date(createdAt.getTime());
    archiveDate.setDate(archiveDate.getDate() + retentionDays);
    return archiveDate;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledCleanup(): Promise<void> {
    if (!this.policy.autoCleanupEnabled) {
      this.logger.debug('Automatic cleanup is disabled');
      return;
    }

    this.logger.log('Starting scheduled audit log cleanup');

    const result = await this.performCleanup();

    if (result.success) {
      this.logger.log(
        `Cleanup completed: ${result.archivedCount.toString()} archived, ${result.deletedCount.toString()} deleted ` +
          `(${result.executionTimeMs.toString()}ms)`,
      );
    } else {
      this.logger.error(
        `Cleanup failed: ${result.errorMessage ?? 'Unknown error'}`,
      );
    }
  }

  async performCleanup(options?: {
    dryRun?: boolean;
    batchSize?: number;
  }): Promise<RetentionCleanupResult> {
    const startTime = Date.now();
    const batchSize = options?.batchSize ?? this.policy.cleanupBatchSize;
    const dryRun = options?.dryRun ?? false;

    try {
      const now = new Date();

      const expiredEntries = await this.auditLogRepo.find({
        where: {
          archiveAfter: LessThan(now),
        },
        take: batchSize,
        order: { archiveAfter: 'ASC' },
      });

      if (expiredEntries.length === 0) {
        return {
          success: true,
          archivedCount: 0,
          deletedCount: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }

      let archivedCount = 0;
      let deletedCount = 0;

      if (dryRun) {
        this.logger.log(
          `[DRY RUN] Would process ${expiredEntries.length.toString()} entries`,
        );
        return {
          success: true,
          archivedCount: expiredEntries.length,
          deletedCount: this.policy.archiveBeforeDelete
            ? 0
            : expiredEntries.length,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (this.policy.archiveBeforeDelete) {
        archivedCount = this.archiveEntries(expiredEntries);
      }

      const deleteResult = await this.deleteEntries(expiredEntries);
      deletedCount = deleteResult.affected ?? 0;

      return {
        success: true,
        archivedCount,
        deletedCount,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Cleanup failed: ${errorMessage}`);

      return {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errorMessage,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  async getCleanupStatistics(): Promise<{
    pendingArchival: number;
    oldestPendingDate: Date | null;
    byEventType: Record<string, number>;
  }> {
    const now = new Date();

    const pendingCount = await this.auditLogRepo.count({
      where: {
        archiveAfter: LessThan(now),
      },
    });

    const oldestEntry = await this.auditLogRepo.findOne({
      where: {
        archiveAfter: LessThan(now),
      },
      order: { archiveAfter: 'ASC' },
    });

    const byEventType: Record<string, number> = {};

    const eventTypeCounts = await this.auditLogRepo
      .createQueryBuilder('audit')
      .select('audit.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .where('audit.archiveAfter < :now', { now })
      .groupBy('audit.eventType')
      .getRawMany<{ eventType: string; count: string }>();

    for (const row of eventTypeCounts) {
      byEventType[row.eventType] = parseInt(row.count, 10);
    }

    return {
      pendingArchival: pendingCount,
      oldestPendingDate: oldestEntry?.archiveAfter ?? null,
      byEventType,
    };
  }

  async generateComplianceReport(): Promise<{
    policy: AuditRetentionPolicy;
    statistics: {
      totalLogs: number;
      logsWithArchiveDate: number;
      logsPendingArchival: number;
    };
    complianceStatus: 'compliant' | 'needs-attention' | 'non-compliant';
    recommendations: string[];
  }> {
    const now = new Date();

    const totalLogs = await this.auditLogRepo.count();

    const logsWithArchiveDate = await this.auditLogRepo.count({
      where: { archiveAfter: LessThan(new Date('2100-01-01')) },
    });

    const logsPendingArchival = await this.auditLogRepo.count({
      where: { archiveAfter: LessThan(now) },
    });

    const recommendations: string[] = [];

    let status: 'compliant' | 'needs-attention' | 'non-compliant' = 'compliant';

    if (logsPendingArchival > this.policy.cleanupBatchSize * 10) {
      status = 'needs-attention';
      recommendations.push(
        'Large backlog of logs pending archival. Consider running manual cleanup.',
      );
    }

    if (!this.policy.autoCleanupEnabled) {
      status = status === 'compliant' ? 'needs-attention' : status;
      recommendations.push(
        'Automatic cleanup is disabled. Enable for NIST SP 800-92 compliance.',
      );
    }

    if (this.policy.defaultRetentionDays < 90) {
      status = 'non-compliant';
      recommendations.push(
        'Default retention period is below NIST SP 800-92 minimum of 90 days.',
      );
    }

    if (!this.policy.archiveBeforeDelete) {
      recommendations.push(
        'Consider enabling archive before delete for compliance audit trail.',
      );
    }

    return {
      policy: this.policy,
      statistics: {
        totalLogs,
        logsWithArchiveDate,
        logsPendingArchival,
      },
      complianceStatus: status,
      recommendations,
    };
  }

  private archiveEntries(entries: AuditLog[]): number {
    const archivedData: ArchivedAuditLog[] = entries.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      action: entry.action,
      actorId: entry.actorId,
      createdAt: entry.createdAt,
      archivedAt: new Date(),
      originalData: {
        oldValues: entry.oldValues,
        newValues: entry.newValues,
        actorIp: entry.actorIp,
        actorUserAgent: entry.actorUserAgent,
        prevHash: entry.prevHash,
        currHash: entry.currHash,
        signature: entry.signature,
      },
    }));

    this.logger.log(
      `Archiving ${archivedData.length.toString()} audit log entries`,
    );

    return archivedData.length;
  }

  private async deleteEntries(entries: AuditLog[]): Promise<DeleteResult> {
    const ids = entries.map((e) => e.id);

    return this.auditLogRepo.delete(ids);
  }
}
