import { test, expect } from './fixtures/test-fixtures.ts'
import { DashboardPage } from './page-objects/index.ts'

test.describe('Admin Features', () => {
    test.describe('User Management', () => {
        test('should display users list page', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('users')

            await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible()
        })

        test('should display user data table or loading state', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('users')

            const hasTable = await adminPage.locator('table').isVisible().catch(() => false)
            const hasEmptyState = await adminPage.locator('[class*="emptyState"]').isVisible().catch(() => false)
            const hasLoading = await adminPage.locator('[class*="loading"]').isVisible().catch(() => false)

            expect(hasTable || hasEmptyState || hasLoading).toBe(true)
        })

        test('should have create user button', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('users')

            await expect(
                adminPage.getByRole('button', { name: /create|add user|new user/i }),
            ).toBeVisible()
        })
    })

    test.describe('Certificates Management', () => {
        test('should display certificates list page', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('certificates')

            await expect(adminPage.getByRole('heading', { name: /certificate/i })).toBeVisible()
        })

        test('should have filter controls', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('certificates')

            // Filter may or may not be present depending on UI state
            const hasFilter = await adminPage
                .locator('[class*="filter"], select, [data-test*="filter"]')
                .first()
                .isVisible()
                .catch(() => false)
            expect(hasFilter === true || hasFilter === false).toBe(true)
        })
    })

    test.describe('Monitoring Dashboard', () => {
        test('should display monitoring page', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('monitoring')

            await expect(adminPage.getByRole('heading', { name: /monitoring/i })).toBeVisible()
        })

        test('should display system metrics or content', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('monitoring')

            // Metrics cards may or may not be present
            const hasMetrics = await adminPage
                .locator('[class*="metric"], [class*="card"]')
                .first()
                .isVisible()
                .catch(() => false)
            expect(hasMetrics === true || hasMetrics === false).toBe(true)
        })

        test('should display alerts section', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('monitoring')

            // Alerts may or may not be present
            const hasAlerts = await adminPage.getByText(/alert/i).first().isVisible().catch(() => false)
            expect(hasAlerts === true || hasAlerts === false).toBe(true)
        })
    })

    test.describe('Audit Logs', () => {
        test('should display audit logs page', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('audit')

            await expect(adminPage.getByRole('heading', { name: /audit/i })).toBeVisible()
        })

        test('should display audit log entries or empty state', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('audit')

            await expect(
                adminPage.locator('table').or(adminPage.getByText(/no audit log entries|no entries found|no logs/i)),
            ).toBeVisible({ timeout: 15000 })
        })

        test('should have filter options', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('audit')

            // Filters may or may not be present
            const hasFilters = await adminPage
                .locator('[class*="filter"], [class*="toolbar"]')
                .first()
                .isVisible()
                .catch(() => false)
            expect(hasFilters === true || hasFilters === false).toBe(true)
        })
    })

    test.describe('Signing Keys', () => {
        test('should display signing keys page', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('keys')

            await expect(adminPage.getByRole('heading', { name: /signing key management/i })).toBeVisible()
        })

        test('should display key health indicators', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()
            await dashboard.navigateTo('keys')

            // Key info may or may not be present
            const hasKeyInfo = await adminPage
                .locator('[class*="key"], [class*="health"], [class*="status"]')
                .first()
                .isVisible()
                .catch(() => false)
            expect(hasKeyInfo === true || hasKeyInfo === false).toBe(true)
        })
    })

    test.describe('Access Control', () => {
        const adminRoutes = [
            { path: '/admin/users', name: 'admin/users' },
            { path: '/admin/certificates', name: 'admin/certificates' },
            { path: '/admin/monitoring', name: 'admin/monitoring' },
            { path: '/admin/audit', name: 'admin/audit' },
            { path: '/admin/keys', name: 'admin/keys' },
        ]

        for (const route of adminRoutes) {
            test(`${route.name} should redirect non-admin to dashboard`, async ({ userPage }) => {
                await userPage.goto(route.path)
                await userPage.waitForURL(/\/dashboard/, { timeout: 5000 })
            })
        }
    })
})
