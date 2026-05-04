import { Button, CircularLoader, NoticeBox } from '@dhis2/ui'
import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmationModal } from '../../components/index.ts'
import { useAuthAxios } from '../../hooks/use-auth-axios.ts'
import { useCertificateActions } from '../../hooks/use-certificates.ts'
import type { CertificateEntry } from '../../hooks/use-certificates.ts'
import { formatDateTime, extractErrorMessage } from '../../utils/format.ts'
import styles from './certificate-detail.module.css'

export const CertificateDetail = () => {
    const { id } = useParams<{ id: string }>()

    const [certificate, setCertificate] = useState<CertificateEntry | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const [{ data, loading: fetchLoading, error: fetchError }, execute] = useAuthAxios<CertificateEntry>({ url: id ? `/certificates/${id}` : '', method: 'GET' }, { manual: true })

    const { revokeCertificate, loading: actionLoading } = useCertificateActions()

    const [revokeReason, setRevokeReason] = useState('')
    const [showRevokeModal, setShowRevokeModal] = useState(false)
    const [actionError, setActionError] = useState('')
    const [actionSuccess, setActionSuccess] = useState('')

    const refetch = useCallback(async () => {
        if (!id) {
            return
        }
        try {
            await execute({ url: `/certificates/${id}` })
        } catch {}
    }, [execute, id])

    useEffect(() => {
        if (id) {
            refetch()
        }
    }, [id, refetch])

    useEffect(() => {
        if (data) {
            setCertificate(data)
        }
    }, [data])

    useEffect(() => {
        setLoading(fetchLoading)
    }, [fetchLoading])

    useEffect(() => {
        if (fetchError) {
            setError(new Error(extractErrorMessage(fetchError)))
        } else {
            setError(null)
        }
    }, [fetchError])

    const handleRevoke = useCallback(async () => {
        if (!id) {
            return
        }
        setActionError('')
        try {
            await revokeCertificate(id, revokeReason)
            setActionSuccess('Certificate revoked successfully')
            setShowRevokeModal(false)
            setRevokeReason('')
            await refetch()
        } catch (err) {
            setActionError(extractErrorMessage(err))
            setShowRevokeModal(false)
        }
    }, [id, revokeReason, revokeCertificate, refetch])

    if (loading) {
        return (
            <div className={`dscp-surface ${styles.loadingOuter}`}>
                <div className={styles.loadingContainer}>
                    <CircularLoader />
                </div>
            </div>
        )
    }

    if (error || !certificate) {
        return (
            <div className={`dscp-surface ${styles.container}`}>
                <NoticeBox error title="Error">
                    {error?.message || 'Certificate not found'}
                </NoticeBox>
            </div>
        )
    }

    const isExpired = new Date(certificate.validUntil) < new Date()

    const getStatusBadge = () => {
        if (certificate.isRevoked) {
            return (
                <span className={`${styles.pill} ${styles.pillRevoked}`} role="status">
                    Revoked
                </span>
            )
        }
        if (isExpired) {
            return (
                <span className={`${styles.pill} ${styles.pillExpired}`} role="status">
                    Expired
                </span>
            )
        }
        return (
            <span className={`${styles.pill} ${styles.pillActive}`} role="status">
                Active
            </span>
        )
    }

    const isRevoked = certificate.isRevoked
    const registryValid = certificate.integrityStatus?.valid

    return (
        <div className={`dscp-surface ${styles.container}`}>
            <Link to="/admin/certificates" className={styles.backLink}>
                &larr; Back to Certificates
            </Link>

            <header className={styles.hero}>
                <div className={styles.heroInner}>
                    <p className={styles.heroEyebrow}>DHIS2 server certification</p>
                    <h1 className={styles.heroTitle}>Certificate</h1>
                    <div className={styles.pillRow}>
                        <span className={styles.pillMono}>{certificate.certificateNumber}</span>
                        {getStatusBadge()}
                        <span className={styles.pillMuted}>
                            Valid {formatDateTime(certificate.validFrom)} — {formatDateTime(certificate.validUntil)}
                        </span>
                    </div>
                </div>
            </header>

            {actionSuccess && (
                <NoticeBox valid title="Success">
                    {actionSuccess}
                </NoticeBox>
            )}
            {actionError && (
                <NoticeBox error title="Error">
                    {actionError}
                </NoticeBox>
            )}

            <section className={styles.panel} aria-labelledby="cert-summary-heading">
                <h2 id="cert-summary-heading" className={styles.panelTitle}>
                    Summary
                </h2>
                <table className={styles.summaryTable}>
                    <tbody>
                        <tr>
                            <th scope="row">Certificate number</th>
                            <td>
                                <code className={styles.code}>{certificate.certificateNumber}</code>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Status</th>
                            <td>{getStatusBadge()}</td>
                        </tr>
                        <tr>
                            <th scope="row">Score</th>
                            <td>{Math.round(certificate.finalScore)}%</td>
                        </tr>
                        <tr>
                            <th scope="row">Valid from</th>
                            <td>{formatDateTime(certificate.validFrom)}</td>
                        </tr>
                        <tr>
                            <th scope="row">Valid until</th>
                            <td>{formatDateTime(certificate.validUntil)}</td>
                        </tr>
                        <tr>
                            <th scope="row">Control group</th>
                            <td>{certificate.controlGroup || '—'}</td>
                        </tr>
                        <tr>
                            <th scope="row">Verification code</th>
                            <td>
                                <code className={styles.code}>{certificate.verificationCode}</code>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Issued</th>
                            <td>{formatDateTime(certificate.issuedAt)}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            {registryValid !== undefined && (
                <section className={styles.panel} aria-labelledby="registry-heading">
                    <h2 id="registry-heading" className={styles.panelTitle}>
                        Registry status
                    </h2>
                    <p className={styles.registryLine}>
                        Valid for public verification: <span className={`${styles.pill} ${registryValid ? styles.pillOk : styles.pillWarn}`}>{registryValid ? 'Yes' : 'No'}</span>
                    </p>
                </section>
            )}

            {isRevoked ? (
                <section className={`${styles.panel} ${styles.revocationPanel}`} aria-labelledby="revocation-heading">
                    <h2 id="revocation-heading" className={styles.panelTitle}>
                        Revocation
                    </h2>
                    <table className={styles.summaryTable}>
                        <tbody>
                            <tr>
                                <th scope="row">Revoked at</th>
                                <td>{formatDateTime(certificate.revokedAt)}</td>
                            </tr>
                            <tr>
                                <th scope="row">Revoked by</th>
                                <td>{certificate.revokedBy || '—'}</td>
                            </tr>
                            <tr>
                                <th scope="row">Reason</th>
                                <td>{certificate.revocationReason || '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            ) : (
                <section className={styles.panel} aria-labelledby="revoke-action-heading">
                    <h2 id="revoke-action-heading" className={styles.panelTitle}>
                        Revoke certificate
                    </h2>
                    <div className={styles.revokeForm}>
                        <label>
                            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--colors-grey700)', marginBottom: '4px' }}>
                                Reason for revocation ({revokeReason.trim().length}/10 characters)
                            </span>
                            <textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Enter the reason for revoking this certificate..." />
                        </label>
                        <Button destructive onClick={() => setShowRevokeModal(true)} disabled={revokeReason.trim().length < 10}>
                            Revoke Certificate
                        </Button>
                    </div>
                </section>
            )}

            {showRevokeModal && (
                <ConfirmationModal
                    title="Revoke Certificate"
                    message={`Are you sure you want to revoke certificate ${certificate.certificateNumber}? This action cannot be undone.`}
                    confirmLabel="Revoke"
                    destructive
                    onConfirm={handleRevoke}
                    onCancel={() => setShowRevokeModal(false)}
                    loading={actionLoading}
                />
            )}
        </div>
    )
}
