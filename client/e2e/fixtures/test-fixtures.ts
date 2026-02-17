import { test as base, expect, Page } from '@playwright/test'

// Credentials from api/src/database/seeds/seed.ts, overridable via env vars
export const TEST_USERS = {
    admin: {
        email: process.env.TEST_ADMIN_EMAIL || 'admin@localhost.dev',
        password: process.env.TEST_ADMIN_PASSWORD || 'DevAdmin#2024!pwd',
        role: 'Admin',
    },
    user: {
        email: process.env.TEST_USER_EMAIL || 'user@localhost.dev',
        password: process.env.TEST_USER_PASSWORD || 'DevUser#2024!pwd',
        role: 'User',
    },
    // TFA user - only used if a TFA-enabled user is seeded
    tfaUser: {
        email: process.env.TEST_TFA_EMAIL || 'tfa@localhost.dev',
        password: process.env.TEST_TFA_PASSWORD || 'TfaUser#2024!pwd',
        role: 'User',
    },
}

export interface TestFixtures {
    authenticatedPage: Page
    adminPage: Page
    userPage: Page
}

// JWT tokens expire quickly (15 seconds), so we perform fresh login for each test
const performLogin = async (page: Page, email: string, password: string): Promise<boolean> => {
    console.log(`[Login] Starting login for ${email}...`)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    console.log(`[Login] Page loaded, URL: ${page.url()}`)

    const emailInput = page.getByRole('textbox', { name: /email/i })
    await emailInput.waitFor({ state: 'visible', timeout: 10000 })
    console.log(`[Login] Login form visible`)

    await emailInput.fill(email)
    await page.getByRole('textbox', { name: /password/i }).fill(password)

    await page.getByRole('button', { name: /sign in/i }).click()
    console.log(`[Login] Submitted credentials`)

    try {
        await page.waitForURL(/\/dashboard/, { timeout: 10000 })
        console.log(`[Login] Login successful, URL: ${page.url()}`)

        const dashboardLink = page.getByRole('link', { name: /dashboard/i })
        await dashboardLink.waitFor({ state: 'visible', timeout: 10000 })
        console.log(`[Login] Authenticated layout rendered`)

        const tokenInfo = await page.evaluate(() => {
            const tokensJson = localStorage.getItem('dhis2_cert_tokens')
            if (!tokensJson) {
                return { hasTokens: false }
            }

            try {
                const tokens = JSON.parse(tokensJson)
                const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]))
                const now = Math.floor(Date.now() / 1000)
                return {
                    hasTokens: true,
                    iat: payload.iat,
                    exp: payload.exp,
                    validFor: payload.exp - payload.iat,
                    expiresIn: payload.exp - now,
                }
            } catch {
                return { hasTokens: true, parseError: true }
            }
        })
        console.log(`[Login] Token info:`, JSON.stringify(tokenInfo))

        return true
    } catch (error) {
        console.error(`[Login] Login failed, URL: ${page.url()}`)
        const errorMessage = await page
            .getByRole('alert')
            .textContent()
            .catch(() => null)
        if (errorMessage) {
            console.error(`[Login] Error message: ${errorMessage}`)
        }
        return false
    }
}

export const test = base.extend<TestFixtures>({
    adminPage: async ({ browser }, use) => {
        const context = await browser.newContext()
        const page = await context.newPage()

        const loginSuccess = await performLogin(page, TEST_USERS.admin.email, TEST_USERS.admin.password)
        if (!loginSuccess) {
            throw new Error('Admin login failed - cannot proceed with test')
        }

        await use(page)
        await context.close()
    },

    userPage: async ({ browser }, use) => {
        const context = await browser.newContext()
        const page = await context.newPage()

        const loginSuccess = await performLogin(page, TEST_USERS.user.email, TEST_USERS.user.password)
        if (!loginSuccess) {
            throw new Error('User login failed - cannot proceed with test')
        }

        await use(page)
        await context.close()
    },

    authenticatedPage: async ({ adminPage }, use) => {
        await use(adminPage)
    },
})

export { expect }

export const testData = {
    implementation: {
        name: `Test Implementation ${Date.now()}`,
        country: 'Test Country',
        contactEmail: 'test@example.com',
        contactPhone: '+1234567890',
        description: 'Test implementation for E2E testing',
        dhis2InstanceUrl: 'https://test.dhis2.org',
        dhis2Version: '2.40',
    },
    assessment: {
        assessorName: 'Test Assessor',
        systemEnvironment: 'Test environment for E2E testing',
    },
}

export const waitFor = {
    loading: async (page: Page) => {
        await page.waitForLoadState('domcontentloaded')
    },
    noSpinner: async (page: Page) => {
        await page
            .locator('[data-test="loading"]')
            .waitFor({ state: 'hidden', timeout: 30000 })
            .catch(() => {})
    },
    toast: async (page: Page, text: string) => {
        await expect(page.getByText(text)).toBeVisible({ timeout: 5000 })
    },
}
