import { Page, Locator } from '@playwright/test'
import { BasePage } from './base.page.ts'

export class LoginPage extends BasePage {
    readonly usernameInput: Locator
    readonly passwordInput: Locator
    readonly submitButton: Locator
    readonly errorMessage: Locator

    constructor(page: Page) {
        super(page)
        this.usernameInput = page.getByRole('textbox', { name: /email/i })
        this.passwordInput = page.getByLabel(/password/i)
        this.submitButton = page.getByRole('button', { name: /sign in|login/i })
        this.errorMessage = page.getByRole('alert')
    }

    async goto(): Promise<void> {
        await this.page.goto('/')
        await this.waitForPageLoad()
    }

    async login(username: string, password: string): Promise<void> {
        await this.usernameInput.fill(username)
        await this.passwordInput.fill(password)
        await this.submitButton.click()
    }

    async isLoginFormVisible(): Promise<boolean> {
        return (await this.usernameInput.isVisible()) && (await this.passwordInput.isVisible())
    }

    async hasError(): Promise<boolean> {
        return this.errorMessage.isVisible()
    }

    async getErrorMessage(): Promise<string | null> {
        if (await this.hasError()) {
            return this.errorMessage.textContent()
        }
        return null
    }
}
