import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
    test('should load the application', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        expect(page.url()).toContain('localhost')
    })

    test('should display login form on unauthenticated access', async ({ page }) => {
        await page.goto('/')

        await expect(page.locator('form')).toBeVisible()
    })

    test('should have proper page title', async ({ page }) => {
        await page.goto('/')

        const title = await page.title()
        expect(title.length).toBeGreaterThan(0)
    })

    test('should load without JavaScript errors', async ({ page }) => {
        const errors: string[] = []

        page.on('pageerror', (error) => {
            errors.push(error.message)
        })

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const criticalErrors = errors.filter((e) => !e.includes('401') && !e.includes('Unauthorized') && !e.includes('Network'))

        expect(criticalErrors).toHaveLength(0)
    })

    test('should be responsive', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const desktopWidth = await page.evaluate(() => document.body.clientWidth)
        expect(desktopWidth).toBeGreaterThan(1000)

        await page.setViewportSize({ width: 375, height: 667 })
        // Wait for layout to reflow
        await expect(page.locator('body')).toBeVisible()

        const mobileWidth = await page.evaluate(() => document.body.clientWidth)
        expect(mobileWidth).toBeLessThan(400)
    })
})

test.describe('Public Routes', () => {
    test('should access certificate verification without authentication', async ({ page }) => {
        await page.goto('/verify/test-code')
        await page.waitForLoadState('domcontentloaded')

        expect(page.url()).toContain('/verify/')

        await expect(
            page
                .getByRole('heading')
                .first()
                .or(page.getByText(/certificate|verification|verify/i).first())
        ).toBeVisible()
    })
})

test.describe('Error Handling', () => {
    test('should handle 404 routes gracefully', async ({ page }) => {
        await page.goto('/this-route-does-not-exist-12345')
        await page.waitForLoadState('domcontentloaded')

        const is404 = await page
            .getByText(/not found|404|page not found/i)
            .first()
            .isVisible()
            .catch(() => false)
        const isRedirected = page.url().includes('/dashboard') || page.url().includes('/login')

        expect(is404 || isRedirected).toBe(true)
    })
})
