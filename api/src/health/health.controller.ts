import { Controller, Get, Optional } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from 'src/modules/iam/authentication/decorators/public.decorator';
import { VaultService } from 'src/modules/vault';

type CheckResult = { status: 'ok' | 'error'; message?: string };

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    vault?: CheckResult;
  };
}

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly vaultService?: VaultService,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const dbCheck = await this.checkDatabase();
    const vaultCheck = await this.checkVault();

    const allOk =
      dbCheck.status === 'ok' && (!vaultCheck || vaultCheck.status === 'ok');

    const status: HealthStatus = {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database: dbCheck,
        ...(vaultCheck && { vault: vaultCheck }),
      },
    };

    return status;
  }

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{
    status: 'ok' | 'error';
    message?: string | undefined;
  }> {
    const dbCheck = await this.checkDatabase();
    if (dbCheck.status === 'error') {
      return { status: 'error', message: dbCheck.message };
    }

    const vaultCheck = await this.checkVault();
    if (vaultCheck?.status === 'error') {
      return { status: 'error', message: vaultCheck.message };
    }

    return { status: 'ok' };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database connection failed';
      return { status: 'error', message };
    }
  }

  private async checkVault(): Promise<CheckResult | null> {
    if (!this.vaultService?.isEnabled()) return null;

    try {
      const health = await this.vaultService.checkHealth();
      if (health.sealed) {
        return { status: 'error', message: 'Vault is sealed' };
      }
      if (!health.initialized) {
        return { status: 'error', message: 'Vault is not initialized' };
      }
      return { status: 'ok' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Vault health check failed';
      return { status: 'error', message };
    }
  }
}
