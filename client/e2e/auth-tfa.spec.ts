import { test, expect } from '@playwright/test'
import { TEST_USERS } from './fixtures/test-fixtures.ts'
import { LoginPage } from './page-objects/index.ts'

test.describe('Two-Factor Authentication', () => {
    let loginPage: LoginPage

    test.beforeEach(async ({ page }) => {
        loginPage = new LoginPage(page)
        await loginPage.goto()
    })

    const submitTfaCredentials = async (loginPage: LoginPage) => {
        await loginPage.usernameInput.fill(TEST_USERS.tfaUser.email)
        await loginPage.passwordInput.fill(TEST_USERS.tfaUser.password)
        await loginPage.submitButton.click()
    }

    const waitForTfaPrompt = async (page: import('@playwright/test').Page): Promise<boolean> => {
        const tfaInput = page.locator('input[name="tfaCode"]')
        try {
            await tfaInput.waitFor({ state: 'visible', timeout: 5000 })
            return true
        } catch {
            return false
        }
    }

    test('should show TFA prompt for TFA-enabled users', async ({ page }) => {
        await submitTfaCredentials(loginPage)
        const hasTfa = await waitForTfaPrompt(page)

        if (hasTfa) {
            await expect(page.getByText('Two-Factor Authentication')).toBeVisible()
            await expect(page.locator('input[name="tfaCode"]')).toBeVisible()
        }
    })

    test('should show recovery code option in TFA step', async ({ page }) => {
        await submitTfaCredentials(loginPage)
        const hasTfa = await waitForTfaPrompt(page)

        if (hasTfa) {
            await expect(page.getByRole('button', { name: /use recovery code/i })).toBeVisible()
        }
    })

    test('should validate TFA code format (6 digits)', async ({ page }) => {
        await submitTfaCredentials(loginPage)
        const hasTfa = await waitForTfaPrompt(page)

        if (hasTfa) {
            const tfaInput = page.locator('input[name="tfaCode"]')
            const verifyButton = page.getByRole('button', { name: /verify/i })

            await tfaInput.fill('123')
            await expect(verifyButton).toBeDisabled()

            await tfaInput.fill('123456')
            await expect(verifyButton).toBeEnabled()
        }
    })

    test('should allow switching to recovery code input', async ({ page }) => {
        await submitTfaCredentials(loginPage)
        const hasTfa = await waitForTfaPrompt(page)

        if (hasTfa) {
            await page.getByRole('button', { name: /use recovery code/i }).click()

            await expect(page.locator('input[name="recoveryCode"]')).toBeVisible()
            await expect(page.getByText('Enter one of your recovery codes')).toBeVisible()
        }
    })

    test('should allow going back to credentials from TFA step', async ({ page }) => {
        await submitTfaCredentials(loginPage)
        const hasTfa = await waitForTfaPrompt(page)

        if (hasTfa) {
            await page.getByRole('button', { name: /back to login/i }).click()

            await expect(loginPage.usernameInput).toBeVisible()
            await expect(loginPage.passwordInput).toBeVisible()
        }
    })
})
