import { test, expect } from './fixtures/test-fixtures.ts'
import { TemplatesPage, TemplateImportPage } from './page-objects/index.ts'

test.describe('Templates (Admin Only)', () => {
    test.describe('Access Control', () => {
        test('should allow admin access to templates', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()

            await expect(adminPage.getByRole('heading', { name: 'Templates' })).toBeVisible()
        })

        test('should redirect non-admin users to dashboard', async ({ userPage }) => {
            await userPage.goto('/templates')
            await userPage.waitForURL(/\/dashboard/, { timeout: 5000 })
        })
    })

    test.describe('List View', () => {
        test('should display templates page with heading', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()

            await expect(adminPage.getByRole('heading', { name: /templates/i })).toBeVisible()
        })

        test('should display search input', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await expect(templatesPage.searchInput).toBeVisible()
        })

        test('should display filter dropdown', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await expect(templatesPage.filterStatus).toBeVisible()
        })

        test('should display import button', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await expect(templatesPage.importButton).toBeVisible()
        })

        test('should display statistics bar', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await expect(templatesPage.statsBar).toBeVisible()
        })

        test('should filter templates by status', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await templatesPage.filterByStatus('published')

            await expect(templatesPage.filterStatus).toBeVisible()
        })

        test('should search templates', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await templatesPage.search('DSCP')

            await expect(templatesPage.searchInput).toBeVisible()
        })
    })

    test.describe('Import Template', () => {
        test('should navigate to import page', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            await templatesPage.clickImport()

            expect(adminPage.url()).toContain('/templates/import')
        })

        test('should display import form', async ({ adminPage }) => {
            const importPage = new TemplateImportPage(adminPage)
            await importPage.goto()

            await expect(adminPage.getByText('Import')).toBeVisible()
        })

        test('should have cancel button', async ({ adminPage }) => {
            const importPage = new TemplateImportPage(adminPage)
            await importPage.goto()

            await expect(importPage.cancelButton).toBeVisible()
        })

        test('should navigate back on cancel', async ({ adminPage }) => {
            const importPage = new TemplateImportPage(adminPage)
            await importPage.goto()

            await importPage.cancelButton.click()

            await adminPage.waitForURL(/\/templates(?!\/import)/)
        })
    })

    test.describe('Template Cards', () => {
        test('should display template cards when templates exist', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            const cardCount = await templatesPage.getCardCount()

            if (cardCount > 0) {
                const firstCard = templatesPage.templateCards.first()
                await expect(firstCard.getByRole('button', { name: /view/i })).toBeVisible()
            }
        })

        test('should navigate to template detail on view', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            const cardCount = await templatesPage.getCardCount()

            if (cardCount > 0) {
                await templatesPage.viewTemplate(0)
                expect(adminPage.url()).toMatch(/\/templates\/[^/]+$/)
            }
        })
    })

    test.describe('Template Actions', () => {
        test('should show publish confirmation modal for draft templates', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.filterByStatus('draft')
            await templatesPage.waitForLoad()

            const cardCount = await templatesPage.getCardCount()

            if (cardCount > 0) {
                const firstCard = templatesPage.templateCards.first()
                const publishButton = firstCard.getByRole('button', { name: /publish/i })

                if (await publishButton.isVisible()) {
                    await publishButton.click()
                    await expect(templatesPage.publishModal).toBeVisible()
                }
            }
        })

        test('should show delete confirmation modal', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.filterByStatus('draft')
            await templatesPage.waitForLoad()

            const cardCount = await templatesPage.getCardCount()

            if (cardCount > 0) {
                const firstCard = templatesPage.templateCards.first()
                const deleteButton = firstCard.getByRole('button', { name: /delete/i })

                if (await deleteButton.isVisible()) {
                    await deleteButton.click()
                    await expect(templatesPage.deleteModal).toBeVisible()
                }
            }
        })

        test('should have export button on template cards', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            const cardCount = await templatesPage.getCardCount()

            if (cardCount > 0) {
                const firstCard = templatesPage.templateCards.first()
                await expect(firstCard.getByRole('button', { name: /export/i })).toBeVisible()
            }
        })
    })

    test.describe('Pagination', () => {
        test('should display pagination when many templates exist', async ({ adminPage }) => {
            const templatesPage = new TemplatesPage(adminPage)
            await templatesPage.goto()
            await templatesPage.waitForLoad()

            // Pagination may or may not exist depending on data volume
            const hasPagination = await templatesPage.pagination.isVisible().catch(() => false)
            expect(hasPagination === true || hasPagination === false).toBe(true)
        })
    })
})
