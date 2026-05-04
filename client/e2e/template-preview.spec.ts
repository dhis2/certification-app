import { test, expect } from '@playwright/test'
import { apiBaseUrl, tryCreateAdminContext } from './helpers/admin-context.ts'

/** Stable UUID so route mocks never collide with seeded templates. */
const PREVIEW_TEMPLATE_ID = '00000000-0000-4000-8000-000000000e2e'

const mockTemplatePreviewPayload = {
    id: PREVIEW_TEMPLATE_ID,
    name: 'E2E DSCP Template',
    templateName: 'E2E DSCP Template',
    version: 1,
    description: 'Synthetic template for preview E2E',
    templateDescription: 'Synthetic template for preview E2E',
    isPublished: true,
    parentVersionId: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    categories: [
        {
            id: 'e2e-cat-1',
            name: 'Security controls',
            description: 'First category',
            weight: 50,
            sortOrder: 1,
            criteria: [
                {
                    id: 'e2e-crit-1',
                    code: 'SEC-001',
                    name: 'Authentication',
                    description: 'Ensure authentication is enforced.',
                    verificationMethod: 'Inspect server configuration.',
                    justification: 'Regulatory baseline.',
                    weight: 1,
                    isMandatory: true,
                    isCriticalFail: false,
                    minPassingScore: 0,
                    maxScore: 100,
                    evidenceRequired: false,
                    sortOrder: 1,
                    controlGroup: 'DSCP1',
                    controlType: 'technical',
                    cisMapping: '5.1',
                },
            ],
        },
        {
            id: 'e2e-cat-2',
            name: 'Operations',
            description: null,
            weight: 50,
            sortOrder: 2,
            criteria: [
                {
                    id: 'e2e-crit-2',
                    code: 'OPS-001',
                    name: 'Backups',
                    description: null,
                    verificationMethod: null,
                    justification: null,
                    weight: 1,
                    isMandatory: false,
                    isCriticalFail: false,
                    minPassingScore: 0,
                    maxScore: 100,
                    evidenceRequired: false,
                    sortOrder: 1,
                    controlGroup: 'DSCP1',
                    controlType: 'organizational',
                    cisMapping: null,
                },
            ],
        },
    ],
    complianceStatusScoring: {
        compliant: 100,
        partially_compliant: 50,
        non_compliant: 0,
        not_applicable: null,
        not_tested: 0,
    },
}

test.describe('Template DSCP preview (admin)', () => {
    test('renders header, both categories, criteria rows, and compliance scoring table', async ({ browser, request }) => {
        const context = await tryCreateAdminContext(browser, request)
        test.skip(!context, `Admin login unavailable — start API at ${apiBaseUrl()} with seeded admin user`)

        const page = await context.newPage()
        await page.route(`**/templates/${PREVIEW_TEMPLATE_ID}`, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTemplatePreviewPayload),
            })
        })

        await page.goto(`/templates/${PREVIEW_TEMPLATE_ID}/preview`)

        await expect(page.getByRole('heading', { name: 'E2E DSCP Template', level: 1 })).toBeVisible()
        await expect(page.getByText('Synthetic template for preview E2E')).toBeVisible()

        await expect(page.getByRole('heading', { name: 'Security controls', level: 2 })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Operations', level: 2 })).toBeVisible()

        await expect(page.getByText('SEC-001')).toBeVisible()
        await expect(page.getByRole('cell', { name: 'Authentication', exact: true })).toBeVisible()
        await expect(page.getByText('OPS-001')).toBeVisible()

        await expect(page.getByText('Compliance scoring')).toBeVisible()
        const scoringSection = page.locator('[class*="scoringSection"]')
        await expect(scoringSection.locator('tbody tr')).toHaveCount(5)
        await expect(scoringSection.getByRole('row', { name: /Compliant/ })).toContainText('100')

        await expect(page.getByRole('button', { name: /^Print$/ })).toBeVisible()
        await expect(page.getByRole('button', { name: /download html/i })).toBeVisible()

        await context.close()
    })

    test('expands criterion details when optional fields exist', async ({ browser, request }) => {
        const context = await tryCreateAdminContext(browser, request)
        test.skip(!context, `Admin login unavailable — start API at ${apiBaseUrl()} with seeded admin user`)

        const page = await context.newPage()
        await page.route(`**/templates/${PREVIEW_TEMPLATE_ID}`, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTemplatePreviewPayload),
            })
        })

        await page.goto(`/templates/${PREVIEW_TEMPLATE_ID}/preview`)

        const details = page.locator('details').filter({ hasText: 'Criterion details' }).first()
        await details.locator('summary').click()

        await expect(details.getByText('Description')).toBeVisible()
        await expect(details.getByText('Ensure authentication is enforced.')).toBeVisible()
        await expect(details.getByText('Justification')).toBeVisible()
        await expect(details.getByText('Regulatory baseline.')).toBeVisible()

        await context.close()
    })

    test('export root stays visible under print media (layout regression)', async ({ browser, request }) => {
        const context = await tryCreateAdminContext(browser, request)
        test.skip(!context, `Admin login unavailable — start API at ${apiBaseUrl()} with seeded admin user`)

        const page = await context.newPage()
        await page.route(`**/templates/${PREVIEW_TEMPLATE_ID}`, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTemplatePreviewPayload),
            })
        })

        await page.goto(`/templates/${PREVIEW_TEMPLATE_ID}/preview`)
        const exportRoot = page.locator('[data-test="template-preview-export-root"]')
        await expect(exportRoot).toBeVisible()

        await page.emulateMedia({ media: 'print' })
        await expect(exportRoot).toBeVisible()
        await expect(exportRoot.getByRole('heading', { name: 'E2E DSCP Template', level: 1 })).toBeVisible()
        await expect(exportRoot.getByText('Compliance scoring')).toBeVisible()
        const box = await exportRoot.boundingBox()
        expect(box && box.height).toBeGreaterThan(400)
        await page.emulateMedia({ media: 'screen' })

        await context.close()
    })
})
