import {
    ComplianceStatus,
    ControlGroup,
    SubmissionStatus,
    type Criterion,
    type Submission,
} from '../../types/index.ts'
import {
    buildAssessmentReport,
    countCompliance,
    escapeHtmlText,
    isOpenAssessment,
    reportBackPath,
    sanitizeFilenamePart,
} from './assessment-report-model.ts'

const criterion = (overrides: Partial<Criterion> & Pick<Criterion, 'id' | 'code'>): Criterion => ({
    name: overrides.name ?? overrides.code,
    controlGroup: ControlGroup.DSCP1,
    controlType: 'technical',
    weight: 1,
    isMandatory: false,
    evidenceRequired: false,
    ...overrides,
})

const baseSubmission = (): Submission => ({
    id: 'sub-1',
    implementationId: 'impl-1',
    implementation: { id: 'impl-1', name: 'Kenya HIS', country: 'KE', dhis2InstanceUrl: 'https://his.example.org' },
    templateId: 'tpl-1',
    template: {
        id: 'tpl-1',
        name: 'DSCP Server',
        version: '3',
        isPublished: true,
        categories: [
            {
                id: 'cat-1',
                name: 'PostgreSQL Database',
                description: 'Database controls',
                weight: 1,
                sortOrder: 1,
                criteria: [
                    criterion({ id: 'c1', code: 'DB-01', name: 'Backups' }),
                    criterion({ id: 'c2', code: 'DB-02', name: 'Restore tests' }),
                ],
            },
            {
                id: 'cat-2',
                name: 'Network Security',
                weight: 1,
                sortOrder: 2,
                criteria: [criterion({ id: 'c3', code: 'NET-01', name: 'Firewall' })],
            },
        ],
    },
    targetControlGroup: ControlGroup.DSCP1,
    status: SubmissionStatus.IN_PROGRESS,
    assessorName: 'Ada',
    assessmentDate: '2026-09-01',
    currentCategoryIndex: 0,
    isCertified: false,
    responses: [
        {
            id: 'r1',
            criterionId: 'c1',
            complianceStatus: ComplianceStatus.COMPLIANT,
            findings: 'Daily dumps verified',
            remediationRequired: false,
        },
        {
            id: 'r2',
            criterionId: 'c2',
            complianceStatus: ComplianceStatus.NON_COMPLIANT,
            findings: 'No restore drill this year',
            remediationRequired: true,
        },
    ],
    createdById: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
})

describe('sanitizeFilenamePart', () => {
    it('keeps alphanumerics and collapses the rest', () => {
        expect(sanitizeFilenamePart('Kenya HIS / Prod')).toBe('Kenya-HIS-Prod')
    })

    it('falls back when nothing usable remains', () => {
        expect(sanitizeFilenamePart('***')).toBe('assessment')
    })
})

describe('escapeHtmlText', () => {
    it('escapes markup characters', () => {
        expect(escapeHtmlText('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    })
})

describe('countCompliance', () => {
    it('tallies each status including missing-as-not-tested via default', () => {
        expect(
            countCompliance([
                ComplianceStatus.COMPLIANT,
                ComplianceStatus.NON_COMPLIANT,
                ComplianceStatus.NOT_TESTED,
            ])
        ).toEqual({
            compliant: 1,
            partiallyCompliant: 0,
            nonCompliant: 1,
            notApplicable: 0,
            notTested: 1,
        })
    })
})

describe('reportBackPath / isOpenAssessment', () => {
    it('returns the form while the assessment is still open', () => {
        expect(isOpenAssessment(SubmissionStatus.DRAFT)).toBe(true)
        expect(reportBackPath(SubmissionStatus.IN_PROGRESS, 'abc')).toBe('/assessments/abc')
    })

    it('returns certificate after pass or fail', () => {
        expect(reportBackPath(SubmissionStatus.PASSED, 'abc')).toBe('/assessments/abc/certificate')
        expect(reportBackPath(SubmissionStatus.FAILED, 'abc')).toBe('/assessments/abc/certificate')
    })

    it('returns summary for completed and withdrawn', () => {
        expect(reportBackPath(SubmissionStatus.COMPLETED, 'abc')).toBe('/assessments/abc/summary')
        expect(reportBackPath(SubmissionStatus.WITHDRAWN, 'abc')).toBe('/assessments/abc/summary')
    })
})

describe('buildAssessmentReport', () => {
    it('joins responses onto template criteria and treats unanswered as not tested', () => {
        const report = buildAssessmentReport(baseSubmission(), null, 'sub-1')

        expect(report.implementationName).toBe('Kenya HIS')
        expect(report.templateVersion).toBe('3')
        expect(report.isOpen).toBe(true)
        expect(report.assessed).toBe(2)
        expect(report.total).toBe(3)
        expect(report.percentage).toBe(67)
        expect(report.distribution).toEqual({
            compliant: 1,
            partiallyCompliant: 0,
            nonCompliant: 1,
            notApplicable: 0,
            notTested: 1,
        })
        expect(report.nonCompliant).toHaveLength(1)
        expect(report.nonCompliant[0].criterion.code).toBe('DB-02')
        expect(report.categories[0].assessed).toBe(2)
        expect(report.categories[1].controls[0].status).toBe(ComplianceStatus.NOT_TESTED)
        expect(report.printTitle).toBe('assessment-Kenya-HIS-in-progress')
        expect(report.backPath).toBe('/assessments/sub-1')
    })

    it('uses summary scores when provided', () => {
        const submission = baseSubmission()
        const report = buildAssessmentReport(
            submission,
            {
                submission,
                categoryScores: [{ categoryId: 'cat-1', categoryName: 'PostgreSQL Database', score: 50, completionRate: 100 }],
                overallScore: 42,
                completionRate: 67,
                passesTargetCG: false,
                certificationResult: null,
                nonCompliantControls: [],
                canResume: false,
            },
            'sub-1'
        )

        expect(report.overallScore).toBe(42)
        expect(report.passesTargetCg).toBe(false)
        expect(report.categories[0].score).toBe(50)
        expect(report.categories[1].score).toBeNull()
    })
})
