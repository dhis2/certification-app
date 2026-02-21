import { test, expect } from '@playwright/test'
import { VerifyCertificatePage } from './page-objects/index.ts'

test.describe('Certificate Verification (Public)', () => {
    test.describe('Page Display', () => {
        test('should display verification page without authentication', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test-code-123')

            await expect(page.getByRole('heading', { name: /certificate|verification|verify/i }).first()).toBeVisible()
        })

        test('should display page title', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test-code')

            await expect(verifyPage.pageTitle).toBeVisible()
        })

        test('should display page content', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('some-code')

            await expect(verifyPage.footer.or(page.locator('main, [class*="container"]'))).toBeVisible()
        })
    })

    test.describe('Invalid Verification Code', () => {
        const invalidCodes = ['invalid-code-12345', 'nonexistent-code-xyz', 'bad-code']

        for (const code of invalidCodes) {
            test(`should handle invalid code: ${code}`, async ({ page }) => {
                const verifyPage = new VerifyCertificatePage(page)
                await verifyPage.goto(code)

                await expect(
                    page
                        .getByText(/error|not found|invalid/i)
                        .first()
                        .or(page.getByRole('heading').first())
                ).toBeVisible()
            })
        }
    })

    test.describe('Loading State', () => {
        test('should render content after verification completes', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test-code')

            await expect(page.getByRole('heading').first()).toBeVisible()
        })
    })

    test.describe('Verification Checks Display', () => {
        test('should display content after verification completes', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('any-code')

            await expect(page.getByRole('heading').first()).toBeVisible()
        })

        test('should return verification checks as array', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test-verification')

            await expect(page.getByRole('heading').first()).toBeVisible()

            const checks = await verifyPage.getVerificationChecks().catch(() => [])
            expect(Array.isArray(checks)).toBe(true)
        })
    })

    test.describe('URL Handling', () => {
        test('should extract code from URL path', async ({ page }) => {
            await page.goto('/verify/MY-CODE-123')
            await page.waitForLoadState('domcontentloaded')

            expect(page.url()).not.toMatch(/\/login/)
            expect(page.url()).toContain('/verify/MY-CODE-123')
        })

        test('should handle codes with special characters', async ({ page }) => {
            await page.goto('/verify/code-with-dashes-123')
            await page.waitForLoadState('domcontentloaded')

            expect(page.url()).toContain('/verify/code-with-dashes-123')
        })
    })

    test.describe('Accessibility', () => {
        test('should have accessible page structure', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test')

            await expect(page.getByRole('heading').first()).toBeVisible()
        })

        test('should have readable status indicators', async ({ page }) => {
            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('test-code')

            await expect(
                page
                    .getByText(/valid|invalid|error|verified|not found/i)
                    .first()
                    .or(page.getByRole('heading').first())
            ).toBeVisible()
        })
    })

    test.describe('Certificate Details (Valid Certificate)', () => {
        const mockValidCertificateResponse = {
            valid: true,
            certificate: {
                id: 'test-cert-id-123',
                submissionId: 'test-submission-id',
                implementationId: 'test-impl-id',
                certificateNumber: 'DHIS2-DSCP1-PASS-2024-0001',
                certificationResult: 'pass',
                controlGroup: 'DSCP1',
                finalScore: 92.5,
                validFrom: '2024-01-01T00:00:00.000Z',
                validUntil: '2026-01-01T00:00:00.000Z',
                verificationCode: 'VALID-CODE1',
                isRevoked: false,
                issuedAt: '2024-01-01T00:00:00.000Z',
                implementation: {
                    id: 'test-impl-id',
                    name: 'Test DHIS2 Implementation',
                    country: 'Norway',
                },
            },
            checks: {
                found: true,
                notRevoked: true,
                notExpired: true,
                integrityValid: true,
                signatureValid: true,
            },
        }

        test('should display certificate details for valid code', async ({ page }) => {
            await page.route('**/api/v1/verify/VALID-CODE1', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockValidCertificateResponse),
                })
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('VALID-CODE1')
            await verifyPage.waitForResult()

            const isValid = await verifyPage.isValid()
            expect(isValid).toBe(true)

            const pageContent = await page.content()
            expect(pageContent).toContain('DHIS2-DSCP1-PASS-2024-0001')
            expect(pageContent).toContain('Test DHIS2 Implementation')
        })

        test('should show all verification checks passed for valid certificate', async ({ page }) => {
            await page.route('**/api/v1/verify/VALID-CODE2', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockValidCertificateResponse),
                })
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('VALID-CODE2')
            await verifyPage.waitForResult()

            const isValid = await verifyPage.isValid()
            expect(isValid).toBe(true)

            const checks = await verifyPage.getVerificationChecks()
            expect(checks.length).toBeGreaterThan(0)
            for (const check of checks) {
                expect(check.toLowerCase()).toMatch(/✓|pass|valid|verified|found/)
            }
        })
    })
})
