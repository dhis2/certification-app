import {
    ComplianceStatus,
    SubmissionStatus,
    complianceStatusConfig,
    submissionStatusConfig,
    type AssessmentSummary,
    type Category,
    type CategoryScore,
    type Criterion,
    type Submission,
    type SubmissionResponse,
} from '../../types/index.ts'

export interface ComplianceCounts {
    compliant: number
    partiallyCompliant: number
    nonCompliant: number
    notApplicable: number
    notTested: number
}

export interface ReportControl {
    criterion: Criterion
    response: SubmissionResponse | undefined
    status: ComplianceStatus
    statusLabel: string
    statusTone: 'positive' | 'warning' | 'negative' | 'default' | 'info'
}

export interface ReportCategory {
    category: Category
    index: number
    assessed: number
    total: number
    score: number | null
    controls: ReportControl[]
}

export interface AssessmentReportModel {
    implementationName: string
    templateName: string
    templateVersion: string
    status: SubmissionStatus
    statusLabel: string
    isOpen: boolean
    targetControlGroup: Submission['targetControlGroup']
    assessorName: string
    assessmentDate: string | undefined
    systemEnvironment: string | undefined
    completedAt: string | undefined
    finalizedAt: string | undefined
    certificateNumber: string | undefined
    assessorNotes: string | undefined
    dhis2InstanceUrl: string | undefined
    country: string | undefined
    assessed: number
    total: number
    percentage: number
    overallScore: number | null
    certificationResult: AssessmentSummary['certificationResult']
    passesTargetCg: boolean | null
    distribution: ComplianceCounts
    categories: ReportCategory[]
    nonCompliant: ReportControl[]
    printTitle: string
    htmlFilename: string
    backPath: string
}

export const sanitizeFilenamePart = (value: string): string => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'assessment'

export const escapeHtmlText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const isOpenAssessment = (status: SubmissionStatus): boolean => status === SubmissionStatus.DRAFT || status === SubmissionStatus.IN_PROGRESS

export const reportBackPath = (status: SubmissionStatus, id: string): string => {
    if (isOpenAssessment(status)) {
        return `/assessments/${id}`
    }
    if (status === SubmissionStatus.PASSED || status === SubmissionStatus.FAILED) {
        return `/assessments/${id}/certificate`
    }
    return `/assessments/${id}/summary`
}

export const countCompliance = (statuses: ComplianceStatus[]): ComplianceCounts => {
    const counts: ComplianceCounts = {
        compliant: 0,
        partiallyCompliant: 0,
        nonCompliant: 0,
        notApplicable: 0,
        notTested: 0,
    }

    for (const status of statuses) {
        switch (status) {
            case ComplianceStatus.COMPLIANT:
                counts.compliant += 1
                break
            case ComplianceStatus.PARTIALLY_COMPLIANT:
                counts.partiallyCompliant += 1
                break
            case ComplianceStatus.NON_COMPLIANT:
                counts.nonCompliant += 1
                break
            case ComplianceStatus.NOT_APPLICABLE:
                counts.notApplicable += 1
                break
            default:
                counts.notTested += 1
        }
    }

    return counts
}

const toControl = (criterion: Criterion, response: SubmissionResponse | undefined): ReportControl => {
    const status = response?.complianceStatus ?? ComplianceStatus.NOT_TESTED
    const config = complianceStatusConfig[status]
    return {
        criterion,
        response,
        status,
        statusLabel: config.label,
        statusTone: config.color,
    }
}

export const buildAssessmentReport = (submission: Submission, summary: AssessmentSummary | null, submissionId: string): AssessmentReportModel => {
    const categories = [...(submission.template?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    const responses = submission.responses ?? []
    const byCriterion = new Map(responses.map((r) => [r.criterionId, r]))
    const scoresByCategory = new Map((summary?.categoryScores ?? []).map((s: CategoryScore) => [s.categoryId, s.score]))

    const reportCategories: ReportCategory[] = categories.map((category, index) => {
        const controls = (category.criteria ?? []).map((criterion) => toControl(criterion, byCriterion.get(criterion.id)))
        const assessed = controls.filter((c) => c.status !== ComplianceStatus.NOT_TESTED).length
        const score = scoresByCategory.get(category.id)
        return {
            category,
            index,
            assessed,
            total: controls.length,
            score: score === undefined ? null : score,
            controls,
        }
    })

    const allControls = reportCategories.flatMap((c) => c.controls)
    const assessed = allControls.filter((c) => c.status !== ComplianceStatus.NOT_TESTED).length
    const total = allControls.length
    const implementationName = submission.implementation?.name || 'Untitled implementation'
    const templateName = submission.template?.name || 'Untitled template'
    const templateVersion = submission.template?.version == null ? '' : String(submission.template.version)
    const printTitle = `assessment-${sanitizeFilenamePart(implementationName)}-${sanitizeFilenamePart(submission.status)}`

    return {
        implementationName,
        templateName,
        templateVersion,
        status: submission.status,
        statusLabel: submissionStatusConfig[submission.status].label,
        isOpen: isOpenAssessment(submission.status),
        targetControlGroup: submission.targetControlGroup,
        assessorName: submission.assessorName || '—',
        assessmentDate: submission.assessmentDate,
        systemEnvironment: submission.systemEnvironment,
        completedAt: submission.completedAt,
        finalizedAt: submission.finalizedAt,
        certificateNumber: submission.certificateNumber,
        assessorNotes: submission.assessorNotes,
        dhis2InstanceUrl: submission.implementation?.dhis2InstanceUrl,
        country: submission.implementation?.country,
        assessed,
        total,
        percentage: total > 0 ? Math.round((assessed / total) * 100) : 0,
        overallScore: summary ? summary.overallScore : (submission.totalScore ?? null),
        certificationResult: summary?.certificationResult ?? submission.certificationResult ?? null,
        passesTargetCg: summary ? summary.passesTargetCG : null,
        distribution: countCompliance(allControls.map((c) => c.status)),
        categories: reportCategories,
        nonCompliant: allControls.filter((c) => c.status === ComplianceStatus.NON_COMPLIANT || c.status === ComplianceStatus.PARTIALLY_COMPLIANT),
        printTitle,
        htmlFilename: `${printTitle}.html`,
        backPath: reportBackPath(submission.status, submissionId),
    }
}
