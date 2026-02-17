import { Page, Locator } from '@playwright/test'
import { BasePage } from './base.page.ts'

export class AssessmentsPage extends BasePage {
    readonly statusFilter: Locator
    readonly newAssessmentButton: Locator

    readonly dataTable: Locator
    readonly tableRows: Locator
    readonly emptyState: Locator

    readonly pagination: Locator

    readonly loadingSpinner: Locator
    readonly errorNotice: Locator
    readonly retryButton: Locator

    readonly deleteModal: Locator
    readonly confirmDeleteButton: Locator

    constructor(page: Page) {
        super(page)

        // CSS class gets a hash suffix, so use partial match
        this.statusFilter = page.locator('[class*="statusFilter"]')
        this.newAssessmentButton = page.getByRole('button', { name: /new assessment/i })

        this.dataTable = page.locator('table')
        this.tableRows = page.locator('tbody tr')
        this.emptyState = page.locator('[class*="emptyState"]')

        this.pagination = page.locator('[class*="pagination"]')

        this.loadingSpinner = page.locator('[class*="loadingContainer"]')
        this.errorNotice = page.locator('[class*="NoticeBox"][class*="error"]')
        this.retryButton = page.locator('button:has-text("Retry")')

        this.deleteModal = page.locator('[role="dialog"]:has-text("Delete Assessment")')
        this.confirmDeleteButton = this.deleteModal.locator('button:has-text("Delete")')
    }

    async goto(): Promise<void> {
        if (this.page.url().endsWith('/assessments') || this.page.url().includes('/assessments?')) {
            await this.waitForTableLoad()
            return
        }

        const sidebar = this.page.locator('nav')
        const navLink = sidebar.getByRole('link', { name: 'Assessments', exact: true })

        try {
            await navLink.waitFor({ state: 'visible', timeout: 10000 })
            await navLink.click()
            await this.page.waitForURL(/\/assessments/, { timeout: 10000 })
        } catch {
            const currentUrl = this.page.url()
            if (currentUrl.includes('/login') || currentUrl === 'http://localhost:3000/') {
                throw new Error('Not authenticated - cannot navigate to assessments')
            }

            const anyLink = this.page.getByRole('link', { name: 'Assessments', exact: true }).first()
            await anyLink.click()
            await this.page.waitForURL(/\/assessments/, { timeout: 10000 })
        }

        await this.waitForTableLoad()
    }

    async waitForTableLoad(): Promise<void> {
        await Promise.race([
            this.dataTable.waitFor({ state: 'visible', timeout: 15000 }),
            this.emptyState.waitFor({ state: 'visible', timeout: 15000 }),
            this.page.getByRole('heading', { name: /assessments/i }).waitFor({ state: 'visible', timeout: 15000 }),
        ])
    }

    async filterByStatus(status: 'all' | 'draft' | 'in_progress' | 'completed' | 'passed' | 'failed' | 'withdrawn'): Promise<void> {
        const statusMap = {
            all: 'All Statuses',
            draft: 'Draft',
            in_progress: 'In Progress',
            completed: 'Completed',
            passed: 'Passed',
            failed: 'Failed',
            withdrawn: 'Withdrawn',
        }

        await this.statusFilter.click()

        // DHIS2 SingleSelectField renders options in a detached layer
        const optionText = statusMap[status]
        const option = this.page.locator('[data-test="dhis2-uicore-select-menu-menuwrapper"]').getByText(optionText, { exact: true })

        try {
            await option.waitFor({ state: 'visible', timeout: 3000 })
            await option.click()
        } catch {
            await this.page.getByText(optionText, { exact: true }).last().click()
        }

        await this.waitForTableLoad()
    }

    async getRowCount(): Promise<number> {
        return this.tableRows.count()
    }

    async clickNewAssessment(): Promise<void> {
        await this.newAssessmentButton.click()
        await this.page.waitForURL(/\/assessments\/new/)
    }

    async viewAssessment(rowIndex: number): Promise<void> {
        const row = this.tableRows.nth(rowIndex)
        const viewButton = row.locator('button:has-text("View"), button:has-text("Continue")')
        await viewButton.click()
        await this.page.waitForURL(/\/assessments\/[^/]+/)
    }

    async deleteAssessment(rowIndex: number): Promise<void> {
        const row = this.tableRows.nth(rowIndex)
        await row.locator('button:has-text("Delete")').click()
        await this.deleteModal.waitFor({ state: 'visible' })
        await this.confirmDeleteButton.click()
        await this.deleteModal.waitFor({ state: 'hidden', timeout: 10000 })
    }

    async getAssessmentStatus(rowIndex: number): Promise<string | null> {
        const row = this.tableRows.nth(rowIndex)
        const statusCell = row.locator('[class*="StatusBadge"], [class*="badge"]').first()
        return statusCell.textContent()
    }
}

export class CreateAssessmentPage extends BasePage {
    readonly implementationSelect: Locator
    readonly templateSelect: Locator
    readonly assessorNameInput: Locator
    readonly assessmentDateInput: Locator
    readonly systemEnvironmentInput: Locator

    readonly dscp1Radio: Locator
    readonly dscp2Radio: Locator
    readonly dscp3Radio: Locator

    readonly submitButton: Locator
    readonly cancelButton: Locator
    readonly backButton: Locator

    readonly noImplementationsNotice: Locator
    readonly noTemplatesNotice: Locator

    constructor(page: Page) {
        super(page)

        this.implementationSelect = page.locator('[data-test="select-implementation"]')
        this.templateSelect = page.locator('[data-test="select-template"]')
        this.assessorNameInput = page.locator('[data-test="assessor-name"] input, input[name="assessorName"]')
        this.assessmentDateInput = page.locator('[data-test="assessment-date"] input, input[name="assessmentDate"]')
        this.systemEnvironmentInput = page.locator('[data-test="system-environment"] textarea, textarea[name="systemEnvironment"]')

        this.dscp1Radio = page.locator('[data-test="ig-option-DSCP1"], input[value="DSCP1"]')
        this.dscp2Radio = page.locator('[data-test="ig-option-DSCP2"], input[value="DSCP2"]')
        this.dscp3Radio = page.locator('[data-test="ig-option-DSCP3"], input[value="DSCP3"]')

        this.submitButton = page.locator('[data-test="create-assessment-submit"], button:has-text("Start Assessment")')
        this.cancelButton = page.locator('button:has-text("Cancel")')
        this.backButton = page.locator('button:has-text("Back")')

        // DHIS2 renders notices as h6 elements
        this.noImplementationsNotice = page.getByRole('heading', { name: /no implementations/i })
        this.noTemplatesNotice = page.getByRole('heading', { name: /no templates/i })
    }

    async goto(): Promise<void> {
        if (this.page.url().includes('/assessments/new')) {
            await this.waitForPageLoad()
            return
        }

        const assessmentsLink = this.page.locator('nav').getByRole('link', { name: 'Assessments', exact: true })

        try {
            await assessmentsLink.waitFor({ state: 'visible', timeout: 10000 })
            await assessmentsLink.click()
            await this.page.waitForURL(/\/assessments/, { timeout: 10000 })

            const newButton = this.page.getByRole('button', { name: /new assessment/i })
            await newButton.waitFor({ state: 'visible', timeout: 10000 })
            await newButton.click()
            await this.page.waitForURL(/\/assessments\/new/, { timeout: 10000 })
        } catch {
            const currentUrl = this.page.url()
            if (currentUrl.includes('/login') || currentUrl === 'http://localhost:3000/') {
                throw new Error('Not authenticated - cannot navigate to create assessment')
            }
            await this.page.goto('/assessments/new')
            await this.waitForPageLoad()
        }
    }

    async selectImplementation(name: string): Promise<void> {
        await this.implementationSelect.click()
        await this.page.locator(`[data-value]:has-text("${name}"), text="${name}"`).click()
    }

    async selectTemplate(name: string): Promise<void> {
        await this.templateSelect.click()
        await this.page.locator(`[data-value]:has-text("${name}"), text="${name}"`).first().click()
    }

    async selectControlGroup(group: 'DSCP1' | 'DSCP2' | 'DSCP3'): Promise<void> {
        const radioMap = {
            DSCP1: this.dscp1Radio,
            DSCP2: this.dscp2Radio,
            DSCP3: this.dscp3Radio,
        }
        await radioMap[group].click()
    }

    async fillAssessmentDetails(data: { assessorName?: string; assessmentDate?: string; systemEnvironment?: string }): Promise<void> {
        if (data.assessorName) {
            await this.assessorNameInput.fill(data.assessorName)
        }
        if (data.assessmentDate) {
            await this.assessmentDateInput.fill(data.assessmentDate)
        }
        if (data.systemEnvironment) {
            await this.systemEnvironmentInput.fill(data.systemEnvironment)
        }
    }

    async submit(): Promise<void> {
        await this.submitButton.click()
    }

    async createAssessment(data: {
        implementationName: string
        templateName: string
        controlGroup?: 'DSCP1' | 'DSCP2' | 'DSCP3'
        assessorName?: string
        assessmentDate?: string
        systemEnvironment?: string
    }): Promise<void> {
        await this.selectImplementation(data.implementationName)
        await this.selectTemplate(data.templateName)
        if (data.controlGroup) {
            await this.selectControlGroup(data.controlGroup)
        }
        await this.fillAssessmentDetails({
            assessorName: data.assessorName,
            assessmentDate: data.assessmentDate,
            systemEnvironment: data.systemEnvironment,
        })
        await this.submit()
        await this.page.waitForURL(/\/assessments\/[^/]+$/)
    }
}
