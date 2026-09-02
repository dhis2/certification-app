import { Button, ButtonStrip, CircularLoader, LogoIcon, NoticeBox } from '@dhis2/ui'
import { useCallback, useEffect, useRef, type FC } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useTemplate } from '../../hooks/index.ts'
// eslint-disable-next-line import/no-unresolved -- Vite ?inline emits CSS string at build time
import dscpSurfaceTokens from '../../styles/dscp-tokens.css?inline'
import type { CategoryResponse, ComplianceStatusScoring, CriterionResponse, TemplateResponse } from '../../types/template.ts'
import { dhis2HtmlRootVariablesCss } from '../../utils/dhis2-root-variables-css.ts'
import styles from './template-preview.module.css'
// eslint-disable-next-line import/no-unresolved -- Vite ?inline emits CSS string at build time
import previewCssRaw from './template-preview.module.css?inline'

const DHIS2_ROBOTO_FONTS = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'

const sanitizeFilenamePart = (value: string): string => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'template'

const escapeHtmlText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const formatScore = (value: number | null): string => (value === null ? '—' : String(value))

const sortedCategories = (template: TemplateResponse): CategoryResponse[] => [...(template.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

const sortedCriteria = (category: CategoryResponse): CriterionResponse[] => [...(category.criteria ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

const criterionHasExpandedContent = (c: CriterionResponse): boolean =>
    Boolean(c.description || c.verificationMethod || c.justification || c.verificationCommands || c.notes)

const ScoringTable = ({ scoring }: { scoring: ComplianceStatusScoring }) => {
    const rows: Array<{ label: string; value: string }> = [
        { label: 'Compliant', value: formatScore(scoring.compliant) },
        { label: 'Partially compliant', value: formatScore(scoring.partially_compliant) },
        { label: 'Non-compliant', value: formatScore(scoring.non_compliant) },
        { label: 'Not applicable', value: formatScore(scoring.not_applicable) },
        { label: 'Not tested', value: formatScore(scoring.not_tested) },
    ]
    return (
        <div className={styles.scoringSection}>
            <div className={styles.scoringHead}>Compliance scoring</div>
            <table className={styles.scoringTable}>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td>{row.label}</td>
                            <td>{row.value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export const TemplatePreview: FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { isAdmin } = useAuth()
    const { template, loading, error } = useTemplate(id)
    const exportRootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let snapshot: Array<{ el: HTMLDetailsElement; open: boolean }> = []
        const onBefore = () => {
            const root = exportRootRef.current
            if (!root) {
                return
            }
            const els = Array.from(root.querySelectorAll('details'))
            snapshot = els.map((el) => ({ el, open: el.open }))
            els.forEach((el) => {
                el.open = true
            })
        }
        const onAfter = () => {
            snapshot.forEach(({ el, open }) => {
                el.open = open
            })
            snapshot = []
        }
        window.addEventListener('beforeprint', onBefore)
        window.addEventListener('afterprint', onAfter)
        return () => {
            window.removeEventListener('beforeprint', onBefore)
            window.removeEventListener('afterprint', onAfter)
        }
    }, [])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    const handleDownloadHtml = useCallback(() => {
        const root = exportRootRef.current
        if (!root || !template) {
            return
        }
        const title = `${template.templateName} · v${String(template.version)}`
        const baseReset = `*{box-sizing:border-box;}body{margin:0;background:var(--colors-white);color:var(--colors-grey900);font-family:var(--theme-fonts);}`
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtmlText(title)}</title>
<link rel="stylesheet" href="${DHIS2_ROBOTO_FONTS}"/>
<style>${dhis2HtmlRootVariablesCss()}${dscpSurfaceTokens}${baseReset}${previewCssRaw}</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dscp-template-${sanitizeFilenamePart(template.templateName)}-v${String(template.version)}.html`
        a.click()
        URL.revokeObjectURL(url)
    }, [template])

    if (!id) {
        return <Navigate to="/templates" replace />
    }

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />
    }

    if (loading) {
        return (
            <div className={`dscp-surface ${styles.surface}`}>
                <div className={styles.toolbar}>
                    <ButtonStrip>
                        <Button secondary onClick={() => navigate(`/templates/${id}`)}>
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

    if (error || !template) {
        return (
            <div className={`dscp-surface ${styles.surface}`}>
                <div className={styles.toolbar}>
                    <ButtonStrip>
                        <Button secondary onClick={() => navigate('/templates')}>
                            Back to templates
                        </Button>
                    </ButtonStrip>
                </div>
                <div className={styles.wrap}>
                    <NoticeBox error title="Could not load template">
                        {error?.message ?? 'Template not found'}
                    </NoticeBox>
                </div>
            </div>
        )
    }

    const categories = sortedCategories(template)
    const displayName = template.templateName || template.name
    const displayDesc = template.templateDescription ?? template.description

    return (
        <>
            <div className={styles.toolbar}>
                <ButtonStrip>
                    <Button secondary onClick={() => navigate(`/templates/${template.id}`)}>
                        Back to details
                    </Button>
                    <Button secondary onClick={handlePrint} data-test="template-preview-print">
                        Print
                    </Button>
                    <Button primary onClick={handleDownloadHtml} data-test="template-preview-download-html">
                        Download HTML
                    </Button>
                </ButtonStrip>
            </div>

            <div ref={exportRootRef} className={`dscp-surface ${styles.surface} ${styles.wrap}`} data-test="template-preview-export-root">
                <header className={styles.header}>
                    <LogoIcon className={styles.logo} aria-hidden />
                    <h1 className={styles.title}>{displayName}</h1>
                    {displayDesc ? <p className={styles.subtitle}>{displayDesc}</p> : null}
                    <div className={styles.meta}>
                        <span className={styles.pill}>
                            Version: <span className={styles.inlineCode}>{String(template.version)}</span>
                        </span>
                        {template.effectiveFrom ? <span className={styles.pill}>Effective from: {template.effectiveFrom}</span> : null}
                        {template.effectiveTo ? <span className={styles.pill}>Effective to: {template.effectiveTo}</span> : null}
                    </div>
                </header>

                {categories.length === 0 ? (
                    <p className={styles.emptyHint}>No categories in this template.</p>
                ) : (
                    categories.map((category) => (
                        <section key={category.id} className={styles.category}>
                            <div className={styles.categoryHead}>
                                <h2 className={styles.categoryTitle}>{category.name}</h2>
                                {category.description ? <p className={styles.categoryDesc}>{category.description}</p> : null}
                                <div className={styles.categoryMeta}>
                                    <span className={styles.pill}>Weight: {String(category.weight)}</span>
                                    <span className={styles.pill}>Sort order: {String(category.sortOrder)}</span>
                                </div>
                            </div>
                            <table className={styles.criteria}>
                                <thead>
                                    <tr>
                                        <th className={styles.colCode}>Code</th>
                                        <th>Name</th>
                                        <th className={styles.colType}>Type</th>
                                        <th className={styles.colGroup}>Group</th>
                                        <th className={styles.colCis}>CIS</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedCriteria(category).map((c) => (
                                        <tr key={c.id}>
                                            <td className={styles.colCode}>
                                                <code className={styles.inlineCode}>{c.code}</code>
                                            </td>
                                            <td>{c.name}</td>
                                            <td className={styles.colType}>{c.controlType}</td>
                                            <td className={styles.colGroup}>{c.controlGroup}</td>
                                            <td className={styles.colCis}>{c.cisMapping ?? '—'}</td>
                                            <td>
                                                {criterionHasExpandedContent(c) ? (
                                                    <div className={styles.detailsWrap}>
                                                        <details className={styles.detailsBlock}>
                                                            <summary className={styles.summary}>Criterion details</summary>
                                                            {c.description ? (
                                                                <div className={styles.block}>
                                                                    <div className={styles.blockLabel}>Description</div>
                                                                    {c.description}
                                                                </div>
                                                            ) : null}
                                                            {c.verificationMethod ? (
                                                                <div className={styles.block}>
                                                                    <div className={styles.blockLabel}>Verification</div>
                                                                    {c.verificationMethod}
                                                                </div>
                                                            ) : null}
                                                            {c.justification ? (
                                                                <div className={styles.block}>
                                                                    <div className={styles.blockLabel}>Justification</div>
                                                                    {c.justification}
                                                                </div>
                                                            ) : null}
                                                            {c.verificationCommands ? (
                                                                <div className={styles.block}>
                                                                    <div className={styles.blockLabel}>Verification commands</div>
                                                                    <pre className={styles.commands}>{c.verificationCommands}</pre>
                                                                </div>
                                                            ) : null}
                                                            {c.notes ? (
                                                                <div className={styles.block}>
                                                                    <div className={styles.blockLabel}>Notes</div>
                                                                    {c.notes}
                                                                </div>
                                                            ) : null}
                                                        </details>
                                                    </div>
                                                ) : (
                                                    <span className={styles.cellDash}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    ))
                )}

                <ScoringTable scoring={template.complianceStatusScoring} />
            </div>
        </>
    )
}
