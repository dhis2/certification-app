import { test, expect } from './fixtures/test-fixtures.ts'
import { DashboardPage } from './page-objects/index.ts'

test.describe('Dashboard', () => {
    test.describe('Admin User', () => {
        test('should display welcome message with user name', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            const isLoaded = await dashboard.isLoaded()
            expect(isLoaded).toBe(true)

            const welcomeText = await dashboard.getWelcomeText()
            expect(welcomeText).toContain('Welcome')
        })

        test('should display admin navigation items', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            const hasAdminFeatures = await dashboard.hasAdminFeatures()
            expect(hasAdminFeatures).toBe(true)

            await expect(dashboard.templatesNav).toBeVisible()
            await expect(dashboard.usersNav).toBeVisible()
            await expect(dashboard.certificatesNav).toBeVisible()
            await expect(dashboard.monitoringNav).toBeVisible()
            await expect(dashboard.auditNav).toBeVisible()
            await expect(dashboard.keysNav).toBeVisible()
        })

        test('should display dashboard cards', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await expect(dashboard.implementationsCard).toBeVisible()
            await expect(dashboard.assessmentsCard).toBeVisible()
            await expect(dashboard.templatesCard).toBeVisible()
        })

        test('should display account status card', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await expect(dashboard.accountStatusCard).toBeVisible()
        })

        test('should navigate to implementations from card', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await dashboard.implementationsCard.click()
            await adminPage.waitForURL(/\/implementations/)

            expect(adminPage.url()).toContain('/implementations')
        })

        test('should navigate to assessments from card', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await dashboard.assessmentsCard.click()
            await adminPage.waitForURL(/\/assessments/)

            expect(adminPage.url()).toContain('/assessments')
        })

        test('should navigate using sidebar navigation', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await dashboard.navigateTo('implementations')
            expect(adminPage.url()).toContain('/implementations')

            await dashboard.dashboardNav.click()
            await adminPage.waitForURL(/\/dashboard/)

            await dashboard.navigateTo('assessments')
            expect(adminPage.url()).toContain('/assessments')
        })

        test('should navigate to admin pages', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await dashboard.navigateTo('users')
            expect(adminPage.url()).toContain('/admin/users')

            await dashboard.dashboardNav.click()
            await adminPage.waitForURL(/\/dashboard/)

            await dashboard.navigateTo('monitoring')
            expect(adminPage.url()).toContain('/admin/monitoring')
        })

        test('should display user email in sidebar', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await expect(dashboard.userEmail).toBeVisible()
        })
    })

    test.describe('Regular User', () => {
        test('should not display admin navigation items', async ({ userPage }) => {
            const dashboard = new DashboardPage(userPage)
            await dashboard.goto()

            await expect(dashboard.templatesNav).not.toBeVisible()
            await expect(dashboard.usersNav).not.toBeVisible()
            await expect(dashboard.monitoringNav).not.toBeVisible()
        })

        test('should display user navigation items', async ({ userPage }) => {
            const dashboard = new DashboardPage(userPage)
            await dashboard.goto()

            await expect(dashboard.dashboardNav).toBeVisible()
            await expect(dashboard.implementationsNav).toBeVisible()
            await expect(dashboard.assessmentsNav).toBeVisible()
            await expect(dashboard.settingsNav).toBeVisible()
        })

        test('should navigate to settings', async ({ userPage }) => {
            const dashboard = new DashboardPage(userPage)
            await dashboard.goto()

            await dashboard.navigateTo('settings')
            expect(userPage.url()).toContain('/settings')
        })
    })

    test.describe('Logout Functionality', () => {
        test('should logout admin user', async ({ adminPage }) => {
            const dashboard = new DashboardPage(adminPage)
            await dashboard.goto()

            await dashboard.logout()

            expect(adminPage.url()).toMatch(/\/$|\/login/)
        })
    })
})
