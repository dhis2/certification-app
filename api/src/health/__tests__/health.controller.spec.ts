import { HealthController } from '../health.controller';
import type { DataSource } from 'typeorm';
import type { VaultService } from '../../modules/vault';

function createMockDataSource(queryResult = [{ '1': 1 }]) {
  return {
    query: jest.fn().mockResolvedValue(queryResult),
  } as unknown as DataSource;
}

describe('HealthController', () => {
  describe('without vault', () => {
    let controller: HealthController;
    let ds: DataSource;

    beforeEach(() => {
      ds = createMockDataSource();
      controller = new HealthController(ds);
    });

    it('GET /health/live should return ok', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
    });

    it('GET /health/ready should return ok when db is healthy', async () => {
      const result = await controller.ready();
      expect(result.status).toBe('ok');
    });

    it('GET /health/ready should return error when db fails', async () => {
      (ds.query as jest.Mock).mockRejectedValue(
        new Error('connection refused'),
      );
      const result = await controller.ready();
      expect(result.status).toBe('error');
      expect(result.message).toContain('connection refused');
    });

    it('GET /health should return full status', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.vault).toBeUndefined();
      expect(result.timestamp).toBeTruthy();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('GET /health should show degraded when db fails', async () => {
      (ds.query as jest.Mock).mockRejectedValue(new Error('timeout'));
      const result = await controller.check();
      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('error');
    });
  });

  describe('with vault enabled', () => {
    let controller: HealthController;
    let mockVault: {
      isEnabled: jest.Mock;
      checkHealth: jest.Mock;
    };

    beforeEach(() => {
      mockVault = {
        isEnabled: jest.fn().mockReturnValue(true),
        checkHealth: jest
          .fn()
          .mockResolvedValue({ sealed: false, initialized: true }),
      };
      controller = new HealthController(
        createMockDataSource(),
        mockVault as unknown as VaultService,
      );
    });

    it('GET /health should include vault check', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(result.checks.vault).toEqual({ status: 'ok' });
    });

    it('GET /health should show degraded when vault is sealed', async () => {
      mockVault.checkHealth.mockResolvedValue({
        sealed: true,
        initialized: true,
      });
      const result = await controller.check();
      expect(result.status).toBe('degraded');
      expect(result.checks.vault?.status).toBe('error');
      expect(result.checks.vault?.message).toContain('sealed');
    });

    it('GET /health should show degraded when vault is uninitialized', async () => {
      mockVault.checkHealth.mockResolvedValue({
        sealed: false,
        initialized: false,
      });
      const result = await controller.check();
      expect(result.status).toBe('degraded');
      expect(result.checks.vault?.message).toContain('not initialized');
    });

    it('GET /health should handle vault health check error', async () => {
      mockVault.checkHealth.mockRejectedValue(
        new Error('connect ECONNREFUSED'),
      );
      const result = await controller.check();
      expect(result.status).toBe('degraded');
      expect(result.checks.vault?.status).toBe('error');
      expect(result.checks.vault?.message).toContain('ECONNREFUSED');
    });

    it('GET /health/ready should fail when vault is sealed', async () => {
      mockVault.checkHealth.mockResolvedValue({
        sealed: true,
        initialized: true,
      });
      const result = await controller.ready();
      expect(result.status).toBe('error');
      expect(result.message).toContain('sealed');
    });

    it('GET /health/ready should pass when vault is healthy', async () => {
      const result = await controller.ready();
      expect(result.status).toBe('ok');
    });
  });

  describe('with vault disabled', () => {
    it('should skip vault check when vault is disabled', async () => {
      const mockVault = {
        isEnabled: jest.fn().mockReturnValue(false),
        checkHealth: jest.fn(),
      };
      const controller = new HealthController(
        createMockDataSource(),
        mockVault as unknown as VaultService,
      );

      const result = await controller.check();
      expect(result.checks.vault).toBeUndefined();
      expect(mockVault.checkHealth).not.toHaveBeenCalled();
    });
  });
});
