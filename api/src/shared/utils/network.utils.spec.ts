import { normalizeIp, extractClientIp } from './network.utils';
import type { Request } from 'express';

function fakeReq(
  overrides: Partial<Pick<Request, 'headers' | 'ip'>> = {},
): Request {
  return {
    headers: {},
    ip: undefined,
    ...overrides,
  } as unknown as Request;
}

describe('Network Utils', () => {
  describe('normalizeIp', () => {
    it('should strip ::ffff: prefix from IPv4-mapped IPv6', () => {
      expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
    });

    it('should leave plain IPv4 unchanged', () => {
      expect(normalizeIp('10.0.0.1')).toBe('10.0.0.1');
    });

    it('should leave plain IPv6 unchanged', () => {
      expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('should trim whitespace', () => {
      expect(normalizeIp('  192.168.1.1  ')).toBe('192.168.1.1');
    });

    it('should trim and strip prefix together', () => {
      expect(normalizeIp('  ::ffff:10.0.0.1  ')).toBe('10.0.0.1');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(normalizeIp('   ')).toBe('');
    });
  });

  describe('extractClientIp', () => {
    describe('x-forwarded-for priority', () => {
      it('should return the first IP from x-forwarded-for', () => {
        const req = fakeReq({
          headers: {
            'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178',
          },
        });
        expect(extractClientIp(req)).toBe('203.0.113.50');
      });

      it('should normalize IPv4-mapped IPv6 in x-forwarded-for', () => {
        const req = fakeReq({
          headers: { 'x-forwarded-for': '::ffff:203.0.113.50' },
        });
        expect(extractClientIp(req)).toBe('203.0.113.50');
      });

      it('should skip whitespace-only first entry and fall through', () => {
        const req = fakeReq({
          headers: { 'x-forwarded-for': '  , 192.168.1.1' },
          ip: '127.0.0.1',
        });
        expect(extractClientIp(req)).toBe('127.0.0.1');
      });

      it('should return null for empty x-forwarded-for with no fallback', () => {
        const req = fakeReq({
          headers: { 'x-forwarded-for': '' },
        });
        expect(extractClientIp(req)).toBeNull();
      });
    });

    describe('x-real-ip fallback', () => {
      it('should use x-real-ip when x-forwarded-for is absent', () => {
        const req = fakeReq({
          headers: { 'x-real-ip': '198.51.100.7' },
        });
        expect(extractClientIp(req)).toBe('198.51.100.7');
      });

      it('should normalize x-real-ip', () => {
        const req = fakeReq({
          headers: { 'x-real-ip': '::ffff:198.51.100.7' },
        });
        expect(extractClientIp(req)).toBe('198.51.100.7');
      });

      it('should return null for whitespace-only x-real-ip', () => {
        const req = fakeReq({
          headers: { 'x-real-ip': '   ' },
        });
        expect(extractClientIp(req)).toBeNull();
      });
    });

    describe('req.ip fallback', () => {
      it('should use req.ip when no proxy headers exist', () => {
        const req = fakeReq({ ip: '192.168.65.1' });
        expect(extractClientIp(req)).toBe('192.168.65.1');
      });

      it('should normalize req.ip', () => {
        const req = fakeReq({ ip: '::ffff:192.168.65.1' });
        expect(extractClientIp(req)).toBe('192.168.65.1');
      });

      it('should return null when req.ip is undefined', () => {
        const req = fakeReq();
        expect(extractClientIp(req)).toBeNull();
      });
    });

    describe('priority order', () => {
      it('should prefer x-forwarded-for over x-real-ip and req.ip', () => {
        const req = fakeReq({
          headers: {
            'x-forwarded-for': '1.1.1.1',
            'x-real-ip': '2.2.2.2',
          },
          ip: '3.3.3.3',
        });
        expect(extractClientIp(req)).toBe('1.1.1.1');
      });

      it('should prefer x-real-ip over req.ip', () => {
        const req = fakeReq({
          headers: { 'x-real-ip': '2.2.2.2' },
          ip: '3.3.3.3',
        });
        expect(extractClientIp(req)).toBe('2.2.2.2');
      });
    });
  });
});
