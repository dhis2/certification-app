import { Button, ButtonStrip, CircularLoader, LogoIcon, NoticeBox } from '@dhis2/ui'
import { useCallback, useMemo, useRef, type FC, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAssessment } from '../../hooks/index.ts'
// eslint-disable-next-line import/no-unresolved -- Vite ?inline emits CSS string at build time
import dscpSurfaceTokens from '../../styles/dscp-tokens.css?inline'
import { CertificationResult, ComplianceStatus } from '../../types/index.ts'
import { dhis2HtmlRootVariablesCss } from '../../utils/dhis2-root-variables-css.ts'
import { formatDate, formatDateTime } from '../../utils/index.ts'
import { buildAssessmentReport, escapeHtmlText, type AssessmentReportModel, type ReportControl } from './assessment-report-model.ts'
import styles from './assessment-report.module.css'
// eslint-disable-next-line import/no-unresolved -- Vite ?inline emits CSS string at build time
import reportCssRaw from './assessment-report.module.css?inline'

const DHIS2_ROBOTO_FONTS = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'

const dash = (value: string | null | undefined): string => (value && value.trim() ? value : '—')

const certificationPreviewLabel = (report: AssessmentReportModel): string => {
    if (report.certificationResult === CertificationResult.PASS) {
        return 'Pass'
    }
    if (report.certificationResult === CertificationResult.FAIL) {
        return 'Fail'
    }
    if (report.passesTargetCg === true) {
        return 'Will pass'
    }
    if (report.passesTargetCg === false) {
        return 'Will fail'
    }
    return 'Not finalized'
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className={styles.block}>
        <div className={styles.blockLabel}>{label}</div>
        {children}
    </div>
)

const TextOrEmpty = ({ value }: { value: string | null | undefined }) => (value && value.trim() ? <>{value}</> : <span className={styles.empty}>None recorded</span>)

const ControlPage = ({ control, pageLabel }: { control: ReportControl; pageLabel: string }) => {
    const { criterion, response, statusLabel, statusTone } = control
    const showRemediation =
        control.status === ComplianceStatus.NON_COMPLIANT ||
        control.status === ComplianceStatus.PARTIALLY_COMPLIANT ||
        Boolean(response?.remediationOwner || response?.remediationTargetDate)

    return (
        <article className={styles.control} data-test={`report-control-${criterion.code}`}>
            <div className={styles.controlHead}>
                <div>
                    <p className={styles.controlCode}>
                        {pageLabel} · {criterion.code}
                    </p>
                    <h3 className={styles.controlName}>{criterion.name}</h3>
                </div>
                <div className={styles.badges}>
                    <span className={styles.badge}>{criterion.controlGroup}</span>
                    <span className={styles.badge}>{criterion.controlType === 'technical' ? 'Technical' : 'Organizational'}</span>
                    {criterion.isMandatory ? <span className={styles.badge}>Required</span> : null}
                </div>
            </div>

            {criterion.description ? <p className={styles.description}>{criterion.description}</p> : null}

            <div className={`${styles.statusRow} ${styles[statusTone]}`}>
                <span className={styles.statusLabel}>{statusLabel}</span>
                {response?.score != null ? <span className={styles.statusMeta}>Score {String(response.score)}</span> : null}
            </div>

            {criterion.guidance ? (
                <Field label="Verification guidance">
                    <TextOrEmpty value={criterion.guidance} />
                </Field>
            ) : null}
            {criterion.cisMapping ? (
                <Field label="CIS mapping">
                    <TextOrEmpty value={criterion.cisMapping} />
                </Field>
            ) : null}
            {criterion.verificationMethod ? (
                <Field label="Verification method">
                    <TextOrEmpty value={criterion.verificationMethod} />
                </Field>
            ) : null}
            {criterion.justification ? (
                <Field label="Justification">
                    <TextOrEmpty value={criterion.justification} />
                </Field>
            ) : null}
            {criterion.verificationCommands ? (
                <Field label="Verification commands">
                    <pre className={styles.commands}>{criterion.verificationCommands}</pre>
                </Field>
            ) : null}

            <Field label="Assessor notes">
                <TextOrEmpty value={response?.findings} />
            </Field>
            {criterion.evidenceRequired || response?.evidenceNotes ? (
                <Field label="Evidence notes">
                    <TextOrEmpty value={response?.evidenceNotes} />
                </Field>
            ) : null}

            {showRemediation ? (
                <>
                    <Field label="Remediation owner">
                        <TextOrEmpty value={response?.remediationOwner} />
                    </Field>
                    <Field label="Remediation target date">
                        <TextOrEmpty value={response?.remediationTargetDate ? formatDate(response.remediationTargetDate) : null} />
                    </Field>
                </>
            ) : null}
        </article>
    )
}

const ReportDocument = ({ report }: { report: AssessmentReportModel }) => {
    const exportedAt = formatDateTime(new Date().toISOString())
    const scoreLabel = report.overallScore == null ? '—' : `${Math.round(report.overallScore)}%`
    const resultLabel = certificationPreviewLabel(report)

    return (
        <>
            <header className={styles.cover}>
                <LogoIcon className={styles.logo} aria-hidden />
                <p className={styles.kicker}>DHIS2 Server Certification</p>
                <h1 className={styles.title}>{report.implementationName}</h1>
                <p className={styles.subtitle}>
                    {report.templateName}
                    {report.templateVersion ? ` · v${report.templateVersion}` : ''}
                </p>

                {report.isOpen ? (
                    <p className={styles.draftBanner} role="status">
                        In-progress snapshot. Some controls may still be untested.
                    </p>
                ) : null}

                <div className={styles.meta}>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Status</span>
                        <span className={styles.metaValue}>{report.statusLabel}</span>
                    </div>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Target control group</span>
                        <span className={styles.metaValue}>{report.targetControlGroup}</span>
                    </div>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Assessor</span>
                        <span className={styles.metaValue}>{report.assessorName}</span>
                    </div>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Assessment date</span>
                        <span className={styles.metaValue}>{formatDate(report.assessmentDate)}</span>
                    </div>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Country</span>
                        <span className={styles.metaValue}>{dash(report.country)}</span>
                    </div>
                    <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>DHIS2 instance</span>
                        <span className={styles.metaValue}>{dash(report.dhis2InstanceUrl)}</span>
                    </div>
                    {report.systemEnvironment ? (
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Environment</span>
                            <span className={styles.metaValue}>{report.systemEnvironment}</span>
                        </div>
                    ) : null}
                    {report.certificateNumber ? (
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Certificate</span>
                            <span className={styles.metaValue}>{report.certificateNumber}</span>
                        </div>
                    ) : null}
                    {report.finalizedAt ? (
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Finalized</span>
                            <span className={styles.metaValue}>{formatDateTime(report.finalizedAt)}</span>
                        </div>
                    ) : report.completedAt ? (
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Completed</span>
                            <span className={styles.metaValue}>{formatDateTime(report.completedAt)}</span>
                        </div>
                    ) : null}
                </div>

                <div className={styles.stats}>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>
                            {String(report.assessed)}/{String(report.total)}
                        </span>
                        <span className={styles.statLabel}>Controls assessed ({String(report.percentage)}%)</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{scoreLabel}</span>
                        <span className={styles.statLabel}>Overall score</span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>{resultLabel}</span>
                        <span className={styles.statLabel}>Certification preview</span>
                    </div>
                </div>

                <div className={styles.distribution} aria-label="Compliance distribution">
                    <span className={styles.pill}>Compliant: {String(report.distribution.compliant)}</span>
                    <span className={styles.pill}>Partial: {String(report.distribution.partiallyCompliant)}</span>
                    <span className={styles.pill}>Non-compliant: {String(report.distribution.nonCompliant)}</span>
                    <span className={styles.pill}>Not applicable: {String(report.distribution.notApplicable)}</span>
                    <span className={styles.pill}>Not tested: {String(report.distribution.notTested)}</span>
                </div>

                <nav className={styles.toc} aria-label="Categories">
                    <h2 className={styles.sectionTitle}>Categories</h2>
                    <table className={styles.tocTable}>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Assessed</th>
                                <th>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.categories.map((category) => (
                                <tr key={category.category.id}>
                                    <td>
                                        <a href={`#category-${category.category.id}`}>
                                            {String(category.index + 1)}. {category.category.name}
                                        </a>
                                    </td>
                                    <td>
                                        {String(category.assessed)}/{String(category.total)}
                                    </td>
                                    <td>{category.score == null ? '—' : `${Math.round(category.score)}%`}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </nav>

                {report.nonCompliant.length > 0 ? (
                    <div className={styles.toc}>
                        <h2 className={styles.sectionTitle}>Gaps ({String(report.nonCompliant.length)})</h2>
                        <table className={styles.gapTable}>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Control</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.nonCompliant.map((control) => (
                                    <tr key={control.criterion.id}>
                                        <td>{control.criterion.code}</td>
                                        <td>{control.criterion.name}</td>
                                        <td>{control.statusLabel}</td>
                                        <td>{dash(control.response?.findings)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {report.assessorNotes ? (
                    <div className={styles.notesBlock}>
                        <div className={styles.blockLabel}>Assessor notes</div>
                        {report.assessorNotes}
                    </div>
                ) : null}

                <p className={styles.footerNote}>Exported {exportedAt}</p>
            </header>

            {report.categories.map((category) => (
                <section key={category.category.id} id={`category-${category.category.id}`} className={styles.category}>
                    <div className={styles.categoryHead}>
                        <h2 className={styles.categoryTitle}>
                            {String(category.index + 1)}. {category.category.name}
                        </h2>
                        {category.category.description ? <p className={styles.categoryDesc}>{category.category.description}</p> : null}
                        <div className={styles.categoryMeta}>
                            <span className={styles.pill}>
                                {String(category.assessed)}/{String(category.total)} assessed
                            </span>
                            {category.score != null ? <span className={styles.pill}>Score {Math.round(category.score)}%</span> : null}
                        </div>
                    </div>
                    {category.controls.map((control) => (
                        <ControlPage key={control.criterion.id} control={control} pageLabel={`${String(category.index + 1)}.${control.criterion.code}`} />
                    ))}
                </section>
            ))}
        </>
    )
}

export const AssessmentReport: FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { submission, summary, loading, error } = useAssessment(id)
    const exportRootRef = useRef<HTMLDivElement>(null)

    const report = useMemo(() => (submission && id ? buildAssessmentReport(submission, summary, id) : null), [submission, summary, id])

    const handleExportPdf = useCallback(() => {
        if (!report) {
            return
        }
        const previous = document.title
        document.title = report.printTitle
        const restore = () => {
            document.title = previous
            window.removeEventListener('afterprint', restore)
        }
        window.addEventListener('afterprint', restore)
        window.print()
    }, [report])

    const handleDownloadHtml = useCallback(() => {
        const root = exportRootRef.current
        if (!root || !report) {
            return
        }
        const title = `${report.implementationName} assessment`
        const baseReset = `*{box-sizing:border-box;}body{margin:0;background:var(--colors-white);color:var(--colors-grey900);font-family:var(--theme-fonts);}`
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtmlText(title)}</title>
<link rel="stylesheet" href="${DHIS2_ROBOTO_FONTS}"/>
<style>${dhis2HtmlRootVariablesCss()}${dscpSurfaceTokens}${baseReset}${reportCssRaw}</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = report.htmlFilename
        a.click()
        URL.revokeObjectURL(url)
    }, [report])

    if (!id) {
        return <Navigate to="/assessments" replace />
    }

    if (loading) {
        return (
            <div className={`dscp-surface ${styles.surface}`}>
                <div className={styles.toolbar}>
                    <ButtonStrip>
                        <Button secondary onClick={() => navigate('/assessments')}>
                            Back
                        </Button>
                    </ButtonStrip>
                </div>
                <div className={styles.wrap}>
                    <CircularLoader />
                </div>
            </div>
        )
    }

    if (error || !submission || !report) {
        return (
            <div className={`dscp-surface ${styles.surface}`}>
                <div className={styles.toolbar}>
                    <ButtonStrip>
                        <Button secondary onClick={() => navigate('/assessments')}>
                            Back to assessments
                        </Button>
                    </ButtonStrip>
                </div>
                <div className={styles.wrap}>
                    <NoticeBox error title="Could not load assessment">
                        {error?.message ?? 'Assessment not found'}
                    </NoticeBox>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className={styles.toolbar}>
                <ButtonStrip>
                    <Button secondary onClick={() => navigate(report.backPath)}>
                        Back
                    </Button>
                    <Button secondary onClick={handleDownloadHtml} data-test="assessment-report-download-html">
                        Download HTML
                    </Button>
                    <Button primary onClick={handleExportPdf} data-test="assessment-report-export-pdf">
                        Export PDF
                    </Button>
                </ButtonStrip>
            </div>

            <div ref={exportRootRef} className={`dscp-surface ${styles.surface} ${styles.wrap}`} data-test="assessment-report-export-root">
                <ReportDocument report={report} />
            </div>
        </>
    )
}
