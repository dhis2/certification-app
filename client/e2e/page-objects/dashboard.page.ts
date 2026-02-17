import { Page, Locator } from '@playwright/test'
import { BasePage } from './base.page.ts'

export class DashboardPage extends BasePage {
    readonly welcomeMessage: Locator
    readonly userEmail: Locator
    readonly userRole: Locator

    readonly implementationsCard: Locator
    readonly assessmentsCard: Locator
    readonly templatesCard: Locator
    readonly usersCard: Locator
    readonly monitoringCard: Locator
    readonly certificatesCard: Locator

    readonly accountStatusCard: Locator
    readonly tfaStatus: Locator

    readonly dashboardNav: Locator
    readonly implementationsNav: Locator
    readonly assessmentsNav: Locator
    readonly templatesNav: Locator
    readonly usersNav: Locator
    readonly certificatesNav: Locator
    readonly monitoringNav: Locator
    readonly auditNav: Locator
    readonly keysNav: Locator
    readonly settingsNav: Locator
    readonly logoutButton: Locator

    constructor(page: Page) {
        super(page)

        this.welcomeMessage = page.getByRole('heading', { name: /welcome/i })
        this.userEmail = page.locator('[class*="userEmail"]')
        this.userRole = page.locator('[class*="userRole"]')

        this.implementationsCard = page.locator('a[href="/implementations"]').first()
        this.assessmentsCard = page.locator('a[href="/assessments"]').first()
        this.templatesCard = page.locator('a[href="/templates"]').first()
        this.usersCard = page.locator('a[href="/admin/users"]').first()
        this.monitoringCard = page.locator('a[href="/admin/monitoring"]').first()
        this.certificatesCard = page.locator('a[href="/admin/certificates"]').first()

        this.accountStatusCard = page.getByText('Account Status')
        this.tfaStatus = page.getByText('Two-Factor Auth')

        this.dashboardNav = page.locator('nav a[href="/dashboard"]')
        this.implementationsNav = page.locator('nav a[href="/implementations"]')
        this.assessmentsNav = page.locator('nav a[href="/assessments"]')
        this.templatesNav = page.locator('nav a[href="/templates"]')
        this.usersNav = page.locator('nav a[href="/admin/users"]')
        this.certificatesNav = page.locator('nav a[href="/admin/certificates"]')
        this.monitoringNav = page.locator('nav a[href="/admin/monitoring"]')
        this.auditNav = page.locator('nav a[href="/admin/audit"]')
        this.keysNav = page.locator('nav a[href="/admin/keys"]')
        this.settingsNav = page.locator('nav a[href="/settings"]')
        this.logoutButton = page.getByRole('button', { name: /logout|sign out/i })
    }

    async goto(): Promise<void> {
        if (this.page.url().includes('/dashboard')) {
            await this.waitForPageLoad()
            return
        }

        await this.page.goto('/dashboard')
        await this.waitForPageLoad()
    }

    async isLoaded(): Promise<boolean> {
        try {
            await this.welcomeMessage.waitFor({ state: 'visible', timeout: 10000 })
            return true
        } catch {
            return false
        }
    }

    async getWelcomeText(): Promise<string | null> {
        return this.welcomeMessage.textContent()
    }

    async hasAdminFeatures(): Promise<boolean> {
        const templatesVisible = await this.templatesNav.isVisible().catch(() => false)
        const usersVisible = await this.usersNav.isVisible().catch(() => false)
        return templatesVisible && usersVisible
    }

    async navigateTo(destination: 'implementations' | 'assessments' | 'templates' | 'users' | 'certificates' | 'monitoring' | 'audit' | 'keys' | 'settings'): Promise<void> {
        const navMap = {
            implementations: this.implementationsNav,
            assessments: this.assessmentsNav,
            templates: this.templatesNav,
            users: this.usersNav,
            certificates: this.certificatesNav,
            monitoring: this.monitoringNav,
            audit: this.auditNav,
            keys: this.keysNav,
            settings: this.settingsNav,
        }

        await navMap[destination].click()
        await this.waitForNavigation()
    }

    async logout(): Promise<void> {
        await this.logoutButton.click()
        await this.page.waitForURL(/\/$|\/login/)
    }
}
