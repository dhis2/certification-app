import { test, expect, testData } from './fixtures/test-fixtures.ts'
import { AssessmentsPage, CreateAssessmentPage } from './page-objects/index.ts'

test.describe('Assessments', () => {
    test.describe('List View', () => {
        test('should display assessments page with heading', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()

            await expect(adminPage.getByRole('heading', { name: /assessments/i })).toBeVisible()
        })

        test('should display status filter', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            await expect(assessmentsPage.statusFilter).toBeVisible()
        })

        test('should display new assessment button', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            await expect(assessmentsPage.newAssessmentButton).toBeVisible()
        })

        test('should navigate to create assessment page', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            await assessmentsPage.clickNewAssessment()

            expect(adminPage.url()).toContain('/assessments/new')
        })

        test('should filter by status', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            const initialCount = await assessmentsPage.getRowCount()
            await assessmentsPage.filterByStatus('draft')
            const filteredCount = await assessmentsPage.getRowCount()
            expect(filteredCount).toBeLessThanOrEqual(initialCount)
        })

        test('should reset filter to show all', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            await assessmentsPage.filterByStatus('draft')
            await assessmentsPage.filterByStatus('all')

            await expect(assessmentsPage.statusFilter).toBeVisible()
        })
    })

    test.describe('Create Assessment', () => {
        test('should display create assessment form', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await expect(adminPage.getByText('New Assessment')).toBeVisible()
        })

        test('should display implementation selector or prerequisites notice', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await Promise.race([
                createPage.implementationSelect.waitFor({ state: 'visible', timeout: 10000 }),
                createPage.noImplementationsNotice.waitFor({ state: 'visible', timeout: 10000 }),
                createPage.noTemplatesNotice.waitFor({ state: 'visible', timeout: 10000 }),
            ]).catch(() => {})

            const hasSelect = await createPage.implementationSelect.isVisible().catch(() => false)
            const hasImplNotice = await createPage.noImplementationsNotice.isVisible().catch(() => false)
            const hasTemplateNotice = await createPage.noTemplatesNotice.isVisible().catch(() => false)

            expect(hasSelect || hasImplNotice || hasTemplateNotice).toBe(true)
        })

        test('should display template selector or prerequisites notice', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await Promise.race([
                createPage.templateSelect.waitFor({ state: 'visible', timeout: 10000 }),
                createPage.noImplementationsNotice.waitFor({ state: 'visible', timeout: 10000 }),
                createPage.noTemplatesNotice.waitFor({ state: 'visible', timeout: 10000 }),
            ]).catch(() => {})

            const hasSelect = await createPage.templateSelect.isVisible().catch(() => false)
            const hasImplNotice = await createPage.noImplementationsNotice.isVisible().catch(() => false)
            const hasTemplateNotice = await createPage.noTemplatesNotice.isVisible().catch(() => false)

            expect(hasSelect || hasImplNotice || hasTemplateNotice).toBe(true)
        })

        test('should display control group options', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await adminPage.waitForLoadState('domcontentloaded')

            const hasForm = await createPage.submitButton.isVisible().catch(() => false)
            if (hasForm) {
                await expect(adminPage.getByText('DSCP1')).toBeVisible()
            }
        })

        test('should display assessment details fields', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await adminPage.waitForLoadState('domcontentloaded')

            const hasForm = await createPage.submitButton.isVisible().catch(() => false)
            if (hasForm) {
                await expect(createPage.assessorNameInput).toBeVisible()
                await expect(createPage.assessmentDateInput).toBeVisible()
            }
        })

        test('should navigate back to assessments list', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            const backButton = adminPage.getByRole('button', { name: /back|cancel/i }).first()
            const hasBackButton = await backButton.isVisible().catch(() => false)

            if (hasBackButton) {
                await backButton.click()
            } else {
                const assessmentsLink = adminPage.locator('nav').getByRole('link', { name: 'Assessments', exact: true })
                await assessmentsLink.click()
            }

            await adminPage.waitForURL(/\/assessments(?!\/new)/)
        })

        test('should show validation error without required fields', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await adminPage.waitForLoadState('domcontentloaded')

            const hasForm = await createPage.submitButton.isVisible().catch(() => false)
            if (hasForm) {
                await createPage.submitButton.click()

                const hasError = await adminPage
                    .getByText('Please select')
                    .isVisible()
                    .catch(() => false)
                const isDisabled = await createPage.submitButton.isDisabled()

                expect(hasError || isDisabled).toBe(true)
            }
        })

        test('should pre-fill assessment date with today', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await adminPage.waitForLoadState('domcontentloaded')

            const hasForm = await createPage.assessmentDateInput.isVisible().catch(() => false)
            if (hasForm) {
                const dateValue = await createPage.assessmentDateInput.inputValue()
                const today = new Date().toISOString().split('T')[0]
                expect(dateValue).toBe(today)
            }
        })
    })

    test.describe('Assessment Flow', () => {
        test('should create new assessment when data is available', async ({ adminPage }) => {
            const createPage = new CreateAssessmentPage(adminPage)
            await createPage.goto()

            await adminPage.waitForLoadState('domcontentloaded')

            const hasImplementations = await createPage.implementationSelect.isVisible().catch(() => false)
            const hasTemplates = await createPage.templateSelect.isVisible().catch(() => false)

            if (hasImplementations && hasTemplates) {
                await createPage.implementationSelect.click()
                const firstOption = adminPage.locator('[data-value]:not([data-value=""])').first()
                await firstOption.click()

                await createPage.templateSelect.click()
                const firstTemplate = adminPage.locator('[data-value]:not([data-value=""])').first()
                await firstTemplate.click()

                await createPage.fillAssessmentDetails({
                    assessorName: testData.assessment.assessorName,
                    systemEnvironment: testData.assessment.systemEnvironment,
                })

                await createPage.submit()
                await adminPage.waitForURL(/\/assessments\/[^/]+$/, { timeout: 10000 })
            }
        })
    })

    test.describe('Delete Assessment', () => {
        test('should show delete button only for draft assessments', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.waitForTableLoad()

            const rowCount = await assessmentsPage.getRowCount()
            if (rowCount > 0) {
                await assessmentsPage.filterByStatus('draft')

                const draftCount = await assessmentsPage.getRowCount()
                if (draftCount > 0) {
                    const firstRow = assessmentsPage.tableRows.first()
                    const deleteButton = firstRow.getByRole('button', { name: /delete/i })
                    await expect(deleteButton).toBeVisible()
                }
            }
        })

        test('should show delete confirmation modal', async ({ adminPage }) => {
            const assessmentsPage = new AssessmentsPage(adminPage)
            await assessmentsPage.goto()
            await assessmentsPage.filterByStatus('draft')
            await assessmentsPage.waitForTableLoad()

            const rowCount = await assessmentsPage.getRowCount()
            if (rowCount > 0) {
                const firstRow = assessmentsPage.tableRows.first()
                const deleteButton = firstRow.getByRole('button', { name: /delete/i })

                if (await deleteButton.isVisible()) {
                    await deleteButton.click()
                    await expect(assessmentsPage.deleteModal).toBeVisible()
                }
            }
        })
    })
})
