import { Page } from '@playwright/test'

export abstract class BasePage {
    constructor(protected readonly page: Page) {}

    abstract goto(): Promise<void>

    async waitForPageLoad(): Promise<void> {
        await this.page.waitForLoadState('domcontentloaded')
    }

    async waitForAuthenticatedContent(): Promise<void> {
        const sidebar = this.page.locator('[class*="sidebar"], nav[aria-label]')
        const loginForm = this.page.getByRole('textbox', { name: /email/i })

        await Promise.race([sidebar.waitFor({ state: 'visible', timeout: 10000 }), loginForm.waitFor({ state: 'visible', timeout: 10000 })])

        const isLoginVisible = await loginForm.isVisible().catch(() => false)
        if (isLoginVisible) {
            throw new Error('Authentication lost - redirected to login page')
        }
    }

    async getTitle(): Promise<string> {
        return this.page.title()
    }

    getUrl(): string {
        return this.page.url()
    }

    async waitForNavigation(): Promise<void> {
        await this.page.waitForLoadState('domcontentloaded')
    }

    async screenshot(name: string): Promise<void> {
        await this.page.screenshot({ path: `screenshots/${name}.png` })
    }
}
