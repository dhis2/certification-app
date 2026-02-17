import {
  PasswordBreachConstraint,
  checkPwnedPassword,
} from '../password.validator';

describe('PasswordBreachConstraint', () => {
  let validator: PasswordBreachConstraint;

  beforeEach(() => {
    validator = new PasswordBreachConstraint();
  });

  describe('local common password check', () => {
    it('should reject common passwords (15+ chars) without API call', async () => {
      const commonPasswords = [
        'passwordpassword', // 16 chars, contains "password"
        'password12345678', // 16 chars
      ];

      for (const pwd of commonPasswords) {
        const result = await validator.validate(pwd);
        expect(result).toBe(false);
      }
    });

    it('should reject weak patterns (15+ chars)', async () => {
      const weakPatterns = ['aaaaaaaaaaaaaaa', '111111111111111'];

      for (const pwd of weakPatterns) {
        const result = await validator.validate(pwd);
        expect(result).toBe(false);
      }
    });
  });

  describe('input validation', () => {
    it('should pass through short passwords (let MinLength handle it)', async () => {
      // Passwords < 15 chars are passed through - MinLength validator handles them
      expect(await validator.validate('short')).toBe(true);
      expect(await validator.validate('')).toBe(true);
      expect(await validator.validate('letmein')).toBe(true);
      expect(await validator.validate('password1234')).toBe(true); // 12 chars, below threshold
    });

    it('should handle non-string input gracefully', async () => {
      expect(await validator.validate(null as unknown as string)).toBe(true);
      expect(await validator.validate(undefined as unknown as string)).toBe(
        true,
      );
    });
  });
});

describe('checkPwnedPassword (HIBP k-anonymity)', () => {
  it('should correctly hash and check the prefix', async () => {
    // "password" has SHA-1 hash: 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const result = await checkPwnedPassword('password');

    expect(result.isPwned).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('should return false for unique random passwords', async () => {
    const randomPassword = `XkP9#mL2$qW7@${Date.now()}${Math.random().toString(36)}`;
    const result = await checkPwnedPassword(randomPassword);

    expect(result.isPwned).toBe(false);
    expect(result.count).toBe(0);
  });

  it('should NFC-normalize before hashing', async () => {
    const originalFetch = global.fetch;
    const capturedUrls: string[] = [];

    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      });
    });

    // Decomposed and composed forms should produce the same SHA-1 prefix
    await checkPwnedPassword('caf\u0065\u0301-test-password');
    await checkPwnedPassword('caf\u00e9-test-password');

    // Both should hit the same HIBP prefix endpoint
    expect(capturedUrls[0]).toBe(capturedUrls[1]);

    global.fetch = originalFetch;
  });

  it('should handle network errors gracefully (fail open)', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkPwnedPassword('anypassword123');

    expect(result.isPwned).toBe(false);
    expect(result.count).toBe(0);

    global.fetch = originalFetch;
  });

  it('should handle API error responses gracefully', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await checkPwnedPassword('anypassword123');

    expect(result.isPwned).toBe(false);
    expect(result.count).toBe(0);

    global.fetch = originalFetch;
  });
});

describe('k-Anonymity implementation', () => {
  it('should only send 5-character hash prefix to API', async () => {
    const originalFetch = global.fetch;
    let capturedUrl = '';

    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      });
    });

    await checkPwnedPassword('testpassword');

    const urlParts = capturedUrl.split('/');
    const prefix = urlParts[urlParts.length - 1];

    expect(prefix).toHaveLength(5);
    expect(prefix).toMatch(/^[0-9A-F]+$/);

    global.fetch = originalFetch;
  });

  it('should parse HIBP response format correctly', async () => {
    const originalFetch = global.fetch;

    const mockResponse = [
      '0018A45C4D1DEF81644B54AB7F969B88D65:1',
      '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2',
      '011053FD0102E94D6AE2F8B83D76FAF94F6:1',
    ].join('\r\n');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await checkPwnedPassword('uniquepasswordhere');

    expect(result.isPwned).toBe(false);

    global.fetch = originalFetch;
  });
});
