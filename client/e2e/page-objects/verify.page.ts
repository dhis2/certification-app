import { Page, Locator, expect } from '@playwright/test'
import { BasePage } from './base.page.ts'

const detailValueByLabel = (page: Page, label: string): Locator =>
    page
        .locator('[data-test="verify-certificate-details"]')
        .locator('div')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('span')
        .nth(1)

export class VerifyCertificatePage extends BasePage {
    readonly pageTitle: Locator

    readonly loadingSpinner: Locator
    readonly loadingText: Locator

    readonly validResult: Locator
    readonly validStatusIcon: Locator
    readonly validStatusTitle: Locator
    readonly validBadge: Locator

    readonly implementationName: Locator
    readonly certificateNumber: Locator
    readonly controlGroup: Locator
    readonly score: Locator
    readonly validFrom: Locator
    readonly validUntil: Locator

    readonly checkItems: Locator

    readonly invalidResult: Locator
    readonly invalidStatusIcon: Locator
    readonly invalidStatusTitle: Locator
    readonly invalidBadge: Locator

    readonly errorNotice: Locator

    readonly footer: Locator

    constructor(page: Page) {
        super(page)

        this.pageTitle = page.locator('h1')

        this.loadingSpinner = page.locator('[data-test="verification-loading"]')
        this.loadingText = page.locator('text=Verifying certificate')

        this.validResult = page.locator('[data-test="verification-valid"]')
        this.validStatusIcon = this.validResult.locator('[aria-hidden="true"]').first()
        this.validStatusTitle = this.validResult.locator('h2').first()
        this.validBadge = this.validResult.getByText('Valid', { exact: true })

        this.implementationName = detailValueByLabel(page, 'Implementation')
        this.certificateNumber = detailValueByLabel(page, 'Certificate Number')
        this.controlGroup = detailValueByLabel(page, 'Control Group')
        this.score = detailValueByLabel(page, 'Score')
        this.validFrom = detailValueByLabel(page, 'Valid From')
        this.validUntil = detailValueByLabel(page, 'Valid Until')

        this.checkItems = page.locator('[data-test="verification-checks"] > li')

        this.invalidResult = page.locator('[data-test="verification-invalid"]')
        this.invalidStatusIcon = this.invalidResult.locator('[aria-hidden="true"]').first()
        this.invalidStatusTitle = this.invalidResult.locator('h2').first()
        this.invalidBadge = this.invalidResult.getByRole('status')

        this.errorNotice = page.locator('[data-test="verification-error"]')

        this.footer = page.locator('[class*="footer"]')
    }

    async goto(code: string): Promise<void> {
        await this.page.goto(`/verify/${code}`)
        await this.waitForPageLoad()
    }

    async waitForResult(): Promise<void> {
        const loading = this.page.locator('[data-test="verification-loading"]')
        await expect
            .poll(
                async () => {
                    if (await loading.isVisible()) {
                        return false
                    }
                    if (await this.validResult.isVisible()) {
                        return true
                    }
                    if (await this.invalidResult.isVisible()) {
                        return true
                    }
                    if (await this.errorNotice.isVisible()) {
                        return true
                    }
                    if (await this.page.getByRole('alert').isVisible()) {
                        return true
                    }
                    return false
                },
                { timeout: 20000 }
            )
            .toBeTruthy()
    }

    async isValid(): Promise<boolean> {
        return this.validResult.isVisible()
    }

    async isInvalid(): Promise<boolean> {
        return this.invalidResult.isVisible()
    }

    async hasError(): Promise<boolean> {
        return this.errorNotice.isVisible()
    }

    async getErrorMessage(): Promise<string | null> {
        const box = this.errorNotice
        if (await box.isVisible()) {
            return box.textContent()
        }
        const alert = this.page.getByRole('alert')
        if (await alert.isVisible()) {
            return alert.textContent()
        }
        return null
    }

    async getCertificateDetails(): Promise<{
        implementation: string | null
        certificateNumber: string | null
        controlGroup: string | null
        score: string | null
        validFrom: string | null
        validUntil: string | null
    }> {
        return {
            implementation: await this.implementationName.textContent().catch(() => null),
            certificateNumber: await this.certificateNumber.textContent().catch(() => null),
            controlGroup: await this.controlGroup.textContent().catch(() => null),
            score: await this.score.textContent().catch(() => null),
            validFrom: await this.validFrom.textContent().catch(() => null),
            validUntil: await this.validUntil.textContent().catch(() => null),
        }
    }

    async getVerificationChecks(): Promise<string[]> {
        const checks: string[] = []
        const items = await this.checkItems.all()
        for (const item of items) {
            const text = await item.textContent()
            if (text) {
                checks.push(text.trim())
            }
        }
        return checks
    }
}
