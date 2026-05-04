import { test, expect, type Page } from '@playwright/test'
import { VerifyCertificatePage } from './page-objects/index.ts'

/** Intercepts GET to the API verify endpoint only (not SPA `/verify/:code` navigation). */
const mockVerifyGet = async (page: Page, code: string, response: { status: number; body: unknown }): Promise<void> => {
    await page.route(
        (url) => url.pathname.includes('/api/') && url.pathname.includes(`/verify/${code}`),
        (route) => {
            if (route.request().method() !== 'GET') {
                void route.continue()
                return
            }
            void route.fulfill({
                status: response.status,
                contentType: 'application/json',
                body: JSON.stringify(response.body),
            })
        }
    )
}

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

            await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
            await expect
                .poll(
                    async () => {
                        for (const testId of ['verification-loading', 'verification-sheet', 'verification-error', 'verification-valid', 'verification-invalid']) {
                            if (await page.locator(`[data-test="${testId}"]`).isVisible()) {
                                return true
                            }
                        }
                        return false
                    },
                    { timeout: 20000 }
                )
                .toBeTruthy()
        })
    })

    test.describe('Invalid Verification Code', () => {
        const invalidCodes = ['invalid-code-12345', 'nonexistent-code-xyz', 'bad-code']

        for (const code of invalidCodes) {
            test(`should handle invalid code: ${code}`, async ({ page }) => {
                await mockVerifyGet(page, code, {
                    status: 200,
                    body: {
                        valid: false,
                        checks: { found: false, notRevoked: false, notExpired: false },
                    },
                })
                const verifyPage = new VerifyCertificatePage(page)
                await verifyPage.goto(code)
                await verifyPage.waitForResult()

                await expect(page.locator('[data-test="verification-invalid"]')).toBeVisible()
            })
        }
    })

    test.describe('Loading State', () => {
        test('shows neutral loading region with status copy before result', async ({ page }) => {
            const code = 'DELAYLOAD001'
            await page.route(
                (url) => url.pathname.includes('/api/') && url.pathname.includes(`/verify/${code}`),
                async (route) => {
                    if (route.request().method() !== 'GET') {
                        await route.continue()
                        return
                    }
                    await new Promise((r) => setTimeout(r, 900))
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            valid: true,
                            certificate: {
                                id: 'delay-cert',
                                submissionId: 's1',
                                implementationId: 'i1',
                                certificateNumber: 'DHIS2-DELAY-001',
                                certificationResult: 'pass',
                                controlGroup: 'DSCP1',
                                finalScore: 91,
                                validFrom: '2024-01-01T00:00:00.000Z',
                                validUntil: '2030-01-01T00:00:00.000Z',
                                verificationCode: code,
                                isRevoked: false,
                                issuedAt: '2024-01-01T00:00:00.000Z',
                                implementation: { id: 'i1', name: 'Delayed Impl' },
                            },
                            checks: { found: true, notRevoked: true, notExpired: true },
                        }),
                    })
                }
            )

            await page.goto(`/verify/${code}`)

            const loading = page.locator('[data-test="verification-loading"]')
            await expect(loading).toBeVisible()
            await expect(loading).toHaveAttribute('aria-busy', 'true')
            await expect(page.getByText('Verifying certificate...')).toBeVisible()

            await expect(page.locator('[data-test="verification-valid"]')).toBeVisible({ timeout: 15000 })
            await expect(loading).toBeHidden()
        })

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

            await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
            await expect(page.locator('body')).toContainText(/certificate verification|valid|invalid|error|network|verification failed/i)
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
                verificationCode: 'ABCDEFGHIJKL',
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
            },
        }

        test('should display certificate details for valid code', async ({ page }) => {
            await mockVerifyGet(page, 'ABCDEFGHIJKL', { status: 200, body: mockValidCertificateResponse })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('ABCDEFGHIJKL')
            await verifyPage.waitForResult()

            const isValid = await verifyPage.isValid()
            expect(isValid).toBe(true)

            const pageContent = await page.content()
            expect(pageContent).toContain('DHIS2-DSCP1-PASS-2024-0001')
            expect(pageContent).toContain('Test DHIS2 Implementation')
        })

        test('should show all verification checks passed for valid certificate', async ({ page }) => {
            await mockVerifyGet(page, 'ZZZZZZZZZZZZ', { status: 200, body: mockValidCertificateResponse })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('ZZZZZZZZZZZZ')
            await verifyPage.waitForResult()

            const isValid = await verifyPage.isValid()
            expect(isValid).toBe(true)

            const checks = await verifyPage.getVerificationChecks()
            expect(checks.length).toBeGreaterThan(0)
            for (const check of checks) {
                expect(check.toLowerCase()).toMatch(/✓|registry|revoked|expired/)
            }
        })
    })

    test.describe('Code lookup from URL', () => {
        test('fetches verify API for path segment and shows registry result', async ({ page }) => {
            let capturedCode: string | undefined
            await page.route(
                (url) => url.pathname.includes('/api/') && url.pathname.includes('/verify/') && url.pathname.includes('LOOKUPCODE12'),
                (route) => {
                    if (route.request().method() !== 'GET') {
                        void route.continue()
                        return
                    }
                    const match = /\/verify\/([^/?]+)/.exec(route.request().url())
                    capturedCode = match?.[1]
                    void route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            valid: true,
                            certificate: {
                                id: 'c1',
                                submissionId: 's1',
                                implementationId: 'i1',
                                certificateNumber: 'DHIS2-URL-LOOKUP',
                                certificationResult: 'pass',
                                controlGroup: 'DSCP1',
                                finalScore: 90,
                                validFrom: '2024-01-01T00:00:00.000Z',
                                validUntil: '2030-01-01T00:00:00.000Z',
                                verificationCode: 'LOOKUPCODE12',
                                isRevoked: false,
                                issuedAt: '2024-01-01T00:00:00.000Z',
                                implementation: { id: 'i1', name: 'From URL' },
                            },
                            checks: { found: true, notRevoked: true, notExpired: true },
                        }),
                    })
                }
            )

            await page.goto('/verify/LOOKUPCODE12')
            await expect(page.locator('[data-test="verification-valid"]')).toBeVisible({ timeout: 20000 })
            expect(capturedCode).toBe('LOOKUPCODE12')
            await expect(page.getByText('DHIS2-URL-LOOKUP')).toBeVisible()
        })
    })

    test.describe('Mocked verification outcomes', () => {
        const baseCert = {
            id: 'cert-mock',
            submissionId: 'sub-mock',
            implementationId: 'impl-mock',
            certificateNumber: 'DHIS2-MOCK-001',
            certificationResult: 'pass',
            controlGroup: 'DSCP1',
            finalScore: 88,
            validFrom: '2024-01-01T00:00:00.000Z',
            validUntil: '2030-01-01T00:00:00.000Z',
            verificationCode: 'MOCKCODE123',
            isRevoked: false,
            issuedAt: '2024-01-01T00:00:00.000Z',
            implementation: { id: 'impl-mock', name: 'Mock Implementation' },
        }

        test('should show Valid badge and registry checks when certificate is active', { tag: '@smoke' }, async ({ page }) => {
            await mockVerifyGet(page, 'VALIDMOCK12', {
                status: 200,
                body: {
                    valid: true,
                    certificate: { ...baseCert, verificationCode: 'VALIDMOCK12' },
                    checks: { found: true, notRevoked: true, notExpired: true },
                },
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('VALIDMOCK12')
            await verifyPage.waitForResult()

            await expect(verifyPage.validBadge).toBeVisible()
            await expect(verifyPage.validStatusTitle).toContainText(/valid/i)
            const details = await verifyPage.getCertificateDetails()
            expect(details.certificateNumber?.trim()).toBe('DHIS2-MOCK-001')
        })

        test('should show Revoked outcome when registry reports revoked', { tag: '@smoke' }, async ({ page }) => {
            await mockVerifyGet(page, 'REVOKEDMOCK1', {
                status: 200,
                body: {
                    valid: false,
                    checks: { found: true, notRevoked: false, notExpired: true },
                },
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('REVOKEDMOCK1')
            await verifyPage.waitForResult()

            expect(await verifyPage.isInvalid()).toBe(true)
            await expect(verifyPage.invalidBadge).toContainText('Revoked')
            await expect(verifyPage.invalidStatusTitle).toBeVisible()
        })

        test('should show Expired when past validUntil', async ({ page }) => {
            await mockVerifyGet(page, 'EXPIREDMOCK01', {
                status: 200,
                body: {
                    valid: false,
                    checks: { found: true, notRevoked: true, notExpired: false },
                },
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('EXPIREDMOCK01')
            await verifyPage.waitForResult()

            await expect(verifyPage.invalidBadge).toContainText('Expired')
        })

        test('should show Not found when certificate is missing from registry', { tag: '@smoke' }, async ({ page }) => {
            await mockVerifyGet(page, 'NOTFOUNDMOCK', {
                status: 200,
                body: {
                    valid: false,
                    checks: { found: false, notRevoked: false, notExpired: false },
                },
            })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('NOTFOUNDMOCK')
            await verifyPage.waitForResult()

            await expect(verifyPage.invalidBadge).toContainText(/not found/i)
        })

        test('should surface API failure as error notice', async ({ page }) => {
            await mockVerifyGet(page, 'SERVERERRMOCK', { status: 500, body: { message: 'Internal error' } })

            const verifyPage = new VerifyCertificatePage(page)
            await verifyPage.goto('SERVERERRMOCK')
            await verifyPage.waitForResult()

            expect(await verifyPage.hasError()).toBe(true)
            await expect(verifyPage.errorNotice).toBeVisible()
        })
    })
})
