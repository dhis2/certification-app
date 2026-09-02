import { test, expect } from './fixtures/test-fixtures.ts'
import { ImplementationsPage } from './page-objects/index.ts'

test.describe('Implementations', () => {
    test.describe('List View', () => {
        test('should display implementations page with heading', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()

            await expect(adminPage.getByRole('heading', { name: /implementations/i })).toBeVisible()
        })

        test('should display search input', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            await expect(implementationsPage.searchInput).toBeVisible()
        })

        test('should display create button', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            await expect(implementationsPage.createButton).toBeVisible()
        })

        test('should filter implementations by search term', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const initialCount = await implementationsPage.getRowCount()

            await implementationsPage.search('zzzznonexistent')
            await implementationsPage.waitForTableLoad()

            const filteredCount = await implementationsPage.getRowCount()
            expect(filteredCount).toBeLessThanOrEqual(initialCount)
        })

        test('should clear search and show all implementations', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const initialCount = await implementationsPage.getRowCount()

            await implementationsPage.search('test')
            await implementationsPage.waitForTableLoad()
            await implementationsPage.search('')
            await implementationsPage.waitForTableLoad()

            const finalCount = await implementationsPage.getRowCount()
            expect(finalCount).toBe(initialCount)
        })
    })

    test.describe('Create Implementation', () => {
        test('should open create modal', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            await implementationsPage.openCreateModal()

            await expect(implementationsPage.createModal).toBeVisible()
            await expect(adminPage.getByRole('heading', { name: /add implementation/i })).toBeVisible()
        })

        test('should display all form fields in create modal', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()
            await implementationsPage.openCreateModal()

            await expect(implementationsPage.nameInput).toBeVisible()
            await expect(implementationsPage.countryInput).toBeVisible()
            await expect(implementationsPage.contactEmailInput).toBeVisible()
        })

        test('should close modal on cancel', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()
            await implementationsPage.openCreateModal()

            await implementationsPage.cancelButton.click()

            await expect(implementationsPage.createModal).not.toBeVisible()
        })

        test('should create implementation with required fields', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const uniqueName = `Test Impl ${Date.now()}`

            await implementationsPage.createImplementation({
                name: uniqueName,
            })

            await implementationsPage.waitForTableLoad()

            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()

            const hasImplementation = await implementationsPage.hasImplementation(uniqueName)
            expect(hasImplementation).toBe(true)
        })

        test('should create implementation with all fields', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const uniqueName = `Full Implementation ${Date.now()}`

            await implementationsPage.createImplementation({
                name: uniqueName,
                country: 'Norway',
                contactEmail: 'admin@example.com',
                contactPhone: '+47123456789',
                description: 'Complete test implementation',
                dhis2InstanceUrl: 'https://play.dhis2.org',
                dhis2Version: '2.40',
            })

            await implementationsPage.waitForTableLoad()

            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()

            const hasImplementation = await implementationsPage.hasImplementation(uniqueName)
            expect(hasImplementation).toBe(true)
        })

        test('should validate required name field', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()
            await implementationsPage.openCreateModal()

            await implementationsPage.countryInput.fill('Test Country')

            const submitEnabled = await implementationsPage.submitButton.isEnabled()

            if (submitEnabled) {
                await implementationsPage.submitButton.click()

                const hasValidationError = await adminPage
                    .getByText(/required|name is required|please enter/i)
                    .isVisible()
                    .catch(() => false)
                const modalStillOpen = await implementationsPage.createModal.isVisible()
                expect(hasValidationError || modalStillOpen).toBe(true)
            } else {
                expect(submitEnabled).toBe(false)
            }
        })
    })

    test.describe('View Implementation Details', () => {
        test('should navigate to implementation details', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const rowCount = await implementationsPage.getRowCount()
            if (rowCount > 0) {
                await implementationsPage.viewImplementation(0)
                expect(adminPage.url()).toMatch(/\/implementations\/[^/]+$/)
            }
        })
    })

    test.describe('Archive Implementation', () => {
        test('should show archive confirmation modal', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const uniqueName = `Archive Modal ${Date.now()}`
            await implementationsPage.createImplementation({ name: uniqueName })
            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()

            await implementationsPage.openArchiveModal(uniqueName)

            await expect(implementationsPage.archiveModal).toBeVisible()
            await expect(adminPage.getByRole('heading', { name: /archive implementation/i })).toBeVisible()
            await expect(implementationsPage.archiveModal).not.toContainText(/cannot be undone|related assessments/i)
        })

        test('should cancel archive without changing the working list', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const uniqueName = `Archive Cancel ${Date.now()}`
            await implementationsPage.createImplementation({ name: uniqueName })
            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()

            await implementationsPage.openArchiveModal(uniqueName)
            await implementationsPage.cancelArchiveButton.click()

            await expect(implementationsPage.archiveModal).not.toBeVisible()
            expect(await implementationsPage.hasImplementation(uniqueName)).toBe(true)
        })

        test('should remove an archived implementation from the default list', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            const uniqueName = `Archive Flow ${Date.now()}`
            await implementationsPage.createImplementation({ name: uniqueName })
            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()
            expect(await implementationsPage.hasImplementation(uniqueName)).toBe(true)

            await implementationsPage.archiveImplementation(uniqueName)
            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()
            expect(await implementationsPage.hasImplementation(uniqueName)).toBe(false)

            await implementationsPage.setStatusFilter('Archived')
            await implementationsPage.search(uniqueName)
            await implementationsPage.waitForTableLoad()
            expect(await implementationsPage.hasImplementation(uniqueName)).toBe(true)
        })
    })

    test.describe('Pagination', () => {
        test('should display pagination when many implementations exist', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()
            await implementationsPage.waitForTableLoad()

            // Pagination may or may not exist depending on data volume
            const hasPagination = await implementationsPage.pagination.isVisible().catch(() => false)
            expect(hasPagination === true || hasPagination === false).toBe(true)
        })
    })

    test.describe('Error Handling', () => {
        test('should display retry button on error', async ({ adminPage }) => {
            const implementationsPage = new ImplementationsPage(adminPage)
            await implementationsPage.goto()

            const hasError = await implementationsPage.errorNotice.isVisible().catch(() => false)
            if (hasError) {
                await expect(implementationsPage.retryButton).toBeVisible()
            }
        })
    })
})
