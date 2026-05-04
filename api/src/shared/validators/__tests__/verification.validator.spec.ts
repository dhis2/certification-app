import * as crypto from 'crypto';
import {
  VerificationCodeConstraint,
  CertificateNumberConstraint,
  isValidVerificationCode,
  isValidCertificateNumber,
} from '../verification.validator';

describe('Verification Validators', () => {
  describe('VerificationCodeConstraint', () => {
    let constraint: VerificationCodeConstraint;

    beforeEach(() => {
      constraint = new VerificationCodeConstraint();
    });

    describe('valid verification codes', () => {
      function randomBase32Code12(): string {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        return Array.from(crypto.randomBytes(12), (b) => alphabet[b % 32]).join(
          '',
        );
      }

      it('should accept 12-character RFC4648 base32 codes', () => {
        expect(constraint.validate(randomBase32Code12())).toBe(true);
      });

      it('should accept fixed valid samples', () => {
        const validCodes = [
          'ABCDEFGHIJKL',
          'AAAAAAAAAAAA',
          '222222222222',
          'ZZZZZZZZZZZZ',
        ];

        for (const code of validCodes) {
          expect(constraint.validate(code)).toBe(true);
        }
      });
    });

    describe('invalid verification codes', () => {
      it('should reject codes with wrong length', () => {
        expect(constraint.validate('')).toBe(false);
        expect(constraint.validate('short')).toBe(false);
        expect(constraint.validate('ABCDEFGHIJK')).toBe(false);
        expect(constraint.validate('ABCDEFGHIJKLM')).toBe(false);
      });

      it('should reject codes with invalid characters', () => {
        expect(constraint.validate('abcdefghijkl')).toBe(false);
        expect(constraint.validate('000000000000')).toBe(false);
        expect(constraint.validate('111111111111')).toBe(false);
        expect(constraint.validate('ABCDEFGHIJK1')).toBe(false);
      });

      it('should reject non-string values', () => {
        expect(constraint.validate(null)).toBe(false);
        expect(constraint.validate(undefined)).toBe(false);
        expect(constraint.validate(123456789012)).toBe(false);
        expect(constraint.validate({ code: 'test' })).toBe(false);
        expect(constraint.validate(['a', 'b', 'c'])).toBe(false);
      });

      it('should reject codes with unicode characters', () => {
        expect(constraint.validate('ABC日本語DEFGHIJ')).toBe(false);
        expect(constraint.validate('🔐🔐🔐🔐🔐🔐')).toBe(false);
      });

      it('should reject SQL injection attempts', () => {
        expect(constraint.validate("';DROP--ABCD")).toBe(false);
        expect(constraint.validate("1' OR '1'='1")).toBe(false);
        expect(constraint.validate('1; SELECT *')).toBe(false);
      });

      it('should reject null bytes and control characters', () => {
        expect(constraint.validate('ABC\x00DEFGHIJKL')).toBe(false);
        expect(constraint.validate('ABCD\x0AEFGHIJKL')).toBe(false);
      });
    });

    it('should return correct error message', () => {
      expect(constraint.defaultMessage({} as never)).toBe(
        'Invalid verification code format',
      );
    });
  });

  describe('CertificateNumberConstraint', () => {
    let constraint: CertificateNumberConstraint;

    beforeEach(() => {
      constraint = new CertificateNumberConstraint();
    });

    describe('valid certificate numbers', () => {
      it('should accept valid PASS certificate numbers', () => {
        const validNumbers = [
          'DHIS2-2026-P-12345678',
          'DHIS2-2025-P-ABCDEF01',
          'DHIS2-2024-P-00000000',
          'DHIS2-2030-P-FFFFFFFF',
        ];

        for (const num of validNumbers) {
          expect(constraint.validate(num)).toBe(true);
        }
      });

      it('should accept valid FAIL certificate numbers', () => {
        const validNumbers = [
          'DHIS2-2026-F-12345678',
          'DHIS2-2025-F-ABCDEF01',
          'DHIS2-2024-F-00000000',
        ];

        for (const num of validNumbers) {
          expect(constraint.validate(num)).toBe(true);
        }
      });

      it('should accept generated certificate numbers', () => {
        // Simulate the actual generation
        const year = new Date().getFullYear();
        const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
        const certNum = `DHIS2-${year}-P-${randomPart}`;
        expect(constraint.validate(certNum)).toBe(true);
      });
    });

    describe('invalid certificate numbers', () => {
      it('should reject wrong prefix', () => {
        expect(constraint.validate('DHIS3-2026-P-12345678')).toBe(false);
        expect(constraint.validate('dhis2-2026-P-12345678')).toBe(false);
        expect(constraint.validate('OTHER-2026-P-12345678')).toBe(false);
      });

      it('should reject invalid year format', () => {
        expect(constraint.validate('DHIS2-26-P-123456789')).toBe(false);
        expect(constraint.validate('DHIS2-20260-P-1234567')).toBe(false);
        expect(constraint.validate('DHIS2-XXXX-P-12345678')).toBe(false);
      });

      it('should reject invalid result codes', () => {
        expect(constraint.validate('DHIS2-2026-X-12345678')).toBe(false);
        expect(constraint.validate('DHIS2-2026-A-12345678')).toBe(false);
        expect(constraint.validate('DHIS2-2026-p-12345678')).toBe(false);
        expect(constraint.validate('DHIS2-2026-f-12345678')).toBe(false);
      });

      it('should reject invalid hex part', () => {
        expect(constraint.validate('DHIS2-2026-P-1234567')).toBe(false); // Too short
        expect(constraint.validate('DHIS2-2026-P-123456789')).toBe(false); // Too long
        expect(constraint.validate('DHIS2-2026-P-1234567G')).toBe(false); // Invalid char
        expect(constraint.validate('DHIS2-2026-P-abcdef12')).toBe(false); // Lowercase
      });

      it('should reject wrong length', () => {
        expect(constraint.validate('')).toBe(false);
        expect(constraint.validate('DHIS2-2026-P-1234567')).toBe(false);
        expect(constraint.validate('DHIS2-2026-P-123456789')).toBe(false);
      });

      it('should reject non-string values', () => {
        expect(constraint.validate(null)).toBe(false);
        expect(constraint.validate(undefined)).toBe(false);
        expect(constraint.validate(123456789012345678901)).toBe(false);
      });

      it('should reject SQL injection attempts', () => {
        expect(constraint.validate("'; DROP TABLE--")).toBe(false);
        expect(constraint.validate("1' OR '1'='1' --")).toBe(false);
      });
    });

    it('should return correct error message', () => {
      expect(constraint.defaultMessage({} as never)).toBe(
        'Invalid certificate number format',
      );
    });
  });

  describe('isValidVerificationCode utility', () => {
    it('should work as a type guard', () => {
      const code: unknown = 'ABCDEFGHIJKL';
      if (isValidVerificationCode(code)) {
        expect(typeof code).toBe('string');
        expect(code.length).toBe(12);
      }
    });

    it('should return false for invalid codes', () => {
      expect(isValidVerificationCode(null)).toBe(false);
      expect(isValidVerificationCode(undefined)).toBe(false);
      expect(isValidVerificationCode('short')).toBe(false);
      expect(isValidVerificationCode('invalid+char')).toBe(false);
    });
  });

  describe('isValidCertificateNumber utility', () => {
    it('should work as a type guard', () => {
      const num: unknown = 'DHIS2-2026-P-12345678';
      if (isValidCertificateNumber(num)) {
        // TypeScript should recognize num as string here
        expect(typeof num).toBe('string');
        expect(num.length).toBe(21);
      }
    });

    it('should return false for invalid numbers', () => {
      expect(isValidCertificateNumber(null)).toBe(false);
      expect(isValidCertificateNumber(undefined)).toBe(false);
      expect(isValidCertificateNumber('INVALID')).toBe(false);
    });
  });
});
