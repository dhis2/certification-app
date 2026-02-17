import { test, expect } from '@playwright/test'
import { TEST_USERS } from './fixtures/test-fixtures.ts'
import { LoginPage } from './page-objects/index.ts'

test.describe('Authentication', () => {
    let loginPage: LoginPage

    test.beforeEach(async ({ page }) => {
        loginPage = new LoginPage(page)
        await loginPage.goto()
    })

    test.describe('Login Form Display', () => {
        test('should display login form with all required elements', async ({ page }) => {
            await expect(loginPage.usernameInput).toBeVisible()
            await expect(loginPage.passwordInput).toBeVisible()
            await expect(loginPage.submitButton).toBeVisible()
            await expect(page.getByRole('heading', { name: /dhis2 server certification/i })).toBeVisible()
        })

        test('should have disabled submit button when form is empty', async () => {
            await expect(loginPage.submitButton).toBeDisabled()
        })

        test('should enable submit button when form is filled', async () => {
            await loginPage.usernameInput.fill('testuser@example.com')
            await loginPage.passwordInput.fill('testpassword')
            await expect(loginPage.submitButton).toBeEnabled()
        })

        test('should disable submit button when only email is filled', async () => {
            await loginPage.usernameInput.fill('testuser@example.com')
            await expect(loginPage.submitButton).toBeDisabled()
        })

        test('should disable submit button when only password is filled', async () => {
            await loginPage.passwordInput.fill('testpassword')
            await expect(loginPage.submitButton).toBeDisabled()
        })
    })

    test.describe('Login Validation', () => {
        test('should stay on login page with invalid credentials', async ({ page }) => {
            await loginPage.login('invalid@example.com', 'wrongpassword')

            await expect(loginPage.usernameInput).toBeVisible()
            expect(page.url()).toMatch(/\/$|\/login/)
        })

        test('should allow re-entering credentials after failure', async () => {
            await loginPage.login('invalid@example.com', 'wrongpassword')

            await loginPage.usernameInput.fill('')
            await loginPage.usernameInput.fill('new@example.com')
            await expect(loginPage.usernameInput).toHaveValue('new@example.com')
        })
    })

    test.describe('Successful Login', () => {
        test('should redirect to dashboard after successful login', async ({ page }) => {
            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })

            expect(page.url()).toContain('/dashboard')
        })

        test('should display user information after login', async ({ page }) => {
            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })

            await expect(page.getByText(TEST_USERS.admin.email).first()).toBeVisible()
        })

        test('should persist session across page reloads', async ({ page }) => {
            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })

            await page.reload()
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })
            await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible()
        })
    })

    test.describe('Logout', () => {
        test('should logout and redirect to login page', async ({ page }) => {
            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })

            await page.getByRole('button', { name: /logout|sign out/i }).click()
            await page.waitForURL(/\/$|\/login/, { timeout: 5000 })
        })

        test('should clear session data after logout', async ({ page }) => {
            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/dashboard/, { timeout: 10000 })

            await page.getByRole('button', { name: /logout|sign out/i }).click()
            await page.waitForURL(/\/$|\/login/, { timeout: 5000 })

            await page.goto('/dashboard')
            await expect(loginPage.usernameInput).toBeVisible({ timeout: 5000 })
        })
    })

    test.describe('Protected Routes', () => {
        test('should redirect unauthenticated users to login', async ({ page }) => {
            await page.goto('/dashboard')
            await expect(loginPage.usernameInput).toBeVisible({ timeout: 5000 })
        })

        test('should redirect to dashboard after login with return URL', async ({ page }) => {
            await page.goto('/implementations')
            await expect(loginPage.usernameInput).toBeVisible({ timeout: 5000 })

            await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password)
            await page.waitForURL(/\/(dashboard|implementations)/, { timeout: 10000 })
        })
    })
})
