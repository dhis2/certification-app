import { test, expect } from '@playwright/test'
import { apiBaseUrl, tryCreateAdminContext } from './helpers/admin-context.ts'

const REPORT_SUBMISSION_ID = '00000000-0000-4000-8000-000000000e2f'

const mockSubmission = {
    id: REPORT_SUBMISSION_ID,
    implementationId: 'impl-e2e',
    implementation: {
        id: 'impl-e2e',
        name: 'E2E Clinic',
        country: 'UG',
        dhis2InstanceUrl: 'https://clinic.example.org',
    },
    templateId: 'tpl-e2e',
    template: {
        id: 'tpl-e2e',
        name: 'E2E DSCP Template',
        version: 1,
        isPublished: true,
        categories: [
            {
                id: 'cat-db',
                name: 'PostgreSQL Database',
                description: 'Database controls',
                weight: 50,
                sortOrder: 1,
                criteria: [
                    {
                        id: 'crit-db-01',
                        code: 'DB-01',
                        name: 'Database backups',
                        description: 'Automated backups must run daily.',
                        guidance: 'Review backup files and retention.',
                        controlGroup: 'DSCP1',
                        controlType: 'technical',
                        cisMapping: '11.2',
                        verificationMethod: 'Inspect cron and backup directory.',
                        justification: 'Backups are the last line of recovery.',
                        verificationCommands: 'sudo crontab -l',
                        notes: 'Record dump location.',
                        weight: 1,
                        isMandatory: true,
                        evidenceRequired: true,
                    },
                    {
                        id: 'crit-db-02',
                        code: 'DB-02',
                        name: 'Restore testing',
                        description: 'Periodic restore tests to a non-production environment.',
                        controlGroup: 'DSCP1',
                        controlType: 'technical',
                        weight: 1,
                        isMandatory: true,
                        evidenceRequired: false,
                    },
                ],
            },
            {
                id: 'cat-net',
                name: 'Network Security',
                weight: 50,
                sortOrder: 2,
                criteria: [
                    {
                        id: 'crit-net-01',
                        code: 'NET-01',
                        name: 'Firewall',
                        description: 'Restrict inbound ports.',
                        controlGroup: 'DSCP1',
                        controlType: 'technical',
                        weight: 1,
                        isMandatory: false,
                        evidenceRequired: false,
                    },
                ],
            },
        ],
    },
    targetControlGroup: 'DSCP1',
    status: 'in_progress',
    assessorName: 'E2E Assessor',
    assessmentDate: '2026-09-01',
    systemEnvironment: 'Staging',
    currentCategoryIndex: 0,
    totalScore: 50,
    certificationResult: null,
    isCertified: false,
    certificateNumber: null,
    assessorNotes: null,
    responses: [
        {
            id: 'resp-1',
            submissionId: REPORT_SUBMISSION_ID,
            criterionId: 'crit-db-01',
            complianceStatus: 'compliant',
            score: 100,
            findings: 'Daily dumps verified on /var/backups',
            evidenceNotes: 'crontab screenshot attached in ticket 12',
            remediationRequired: false,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
            id: 'resp-2',
            submissionId: REPORT_SUBMISSION_ID,
            criterionId: 'crit-db-02',
            complianceStatus: 'non_compliant',
            score: 0,
            findings: 'No restore drill this year',
            remediationRequired: true,
            remediationOwner: 'ops@example.org',
            remediationTargetDate: '2026-10-01',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
        },
    ],
    createdById: 'user-e2e',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
}

const mockSummary = {
    submission: mockSubmission,
    categoryScores: [
        { categoryId: 'cat-db', categoryName: 'PostgreSQL Database', score: 50, completionRate: 100 },
        { categoryId: 'cat-net', categoryName: 'Network Security', score: 0, completionRate: 0 },
    ],
    overallScore: 33,
    completionRate: 67,
    passesTargetCG: false,
    certificationResult: null,
    nonCompliantControls: [{ code: 'DB-02', name: 'Restore testing', controlGroup: 'DSCP1', complianceStatus: 'non_compliant', isBlocker: true }],
    canResume: false,
}

const fulfillAssessmentApis = async (page: import('@playwright/test').Page) => {
    await page.route(`**/submissions/${REPORT_SUBMISSION_ID}/summary`, (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockSummary),
        })
    })
    await page.route(`**/submissions/${REPORT_SUBMISSION_ID}`, (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockSubmission),
        })
    })
}

test.describe('Assessment PDF report', () => {
    test('shows cover, gaps, and each control with status and notes', async ({ browser, request }) => {
        const context = await tryCreateAdminContext(browser, request)
        test.skip(!context, `Admin login unavailable — start API at ${apiBaseUrl()} with seeded admin user`)

        const page = await context.newPage()
        await fulfillAssessmentApis(page)
        await page.goto(`/assessments/${REPORT_SUBMISSION_ID}/report`)

        const root = page.locator('[data-test="assessment-report-export-root"]')
        await expect(page.getByRole('heading', { name: 'E2E Clinic', level: 1 })).toBeVisible()
        await expect(root.getByText('In-progress snapshot')).toBeVisible()
        await expect(root.getByText('E2E Assessor')).toBeVisible()
        await expect(root.getByText('2/3')).toBeVisible()
        await expect(root.getByRole('heading', { name: 'Gaps (1)' })).toBeVisible()
        await expect(root.getByRole('cell', { name: 'DB-02' })).toBeVisible()

        await expect(page.locator('[data-test="report-control-DB-01"]')).toContainText('Compliant')
        await expect(page.locator('[data-test="report-control-DB-01"]')).toContainText('Daily dumps verified on /var/backups')
        await expect(page.locator('[data-test="report-control-DB-01"]')).toContainText('sudo crontab -l')
        await expect(page.locator('[data-test="report-control-DB-02"]')).toContainText('Non-Compliant')
        await expect(page.locator('[data-test="report-control-DB-02"]')).toContainText('No restore drill this year')
        await expect(page.locator('[data-test="report-control-NET-01"]')).toContainText('Not Tested')

        await expect(page.getByRole('button', { name: /export pdf/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /download html/i })).toBeVisible()

        await context.close()
    })

    test('keeps the report visible under print media', async ({ browser, request }) => {
        const context = await tryCreateAdminContext(browser, request)
        test.skip(!context, `Admin login unavailable — start API at ${apiBaseUrl()} with seeded admin user`)

        const page = await context.newPage()
        await fulfillAssessmentApis(page)
        await page.goto(`/assessments/${REPORT_SUBMISSION_ID}/report`)

        const root = page.locator('[data-test="assessment-report-export-root"]')
        await expect(root).toBeVisible()

        await page.emulateMedia({ media: 'print' })
        await expect(root).toBeVisible()
        await expect(root.getByRole('heading', { name: 'E2E Clinic', level: 1 })).toBeVisible()
        await expect(page.locator('[data-test="report-control-DB-01"]')).toBeVisible()
        const box = await root.boundingBox()
        expect(box && box.height).toBeGreaterThan(400)
        await page.emulateMedia({ media: 'screen' })

        await context.close()
    })
})
