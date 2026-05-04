import { Card, CircularLoader, NoticeBox } from '@dhis2/ui'
import axios from 'axios'
import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { baseURL } from '../../hooks/use-auth-axios.ts'
import type { VerificationResult } from '../../types/index.ts'
import styles from './verify-certificate.module.css'

const invalidStatusLabel = (checks: VerificationResult['checks']): string => {
    if (!checks.found) {
        return 'Not found'
    }
    if (!checks.notRevoked) {
        return 'Revoked'
    }
    if (!checks.notExpired) {
        return 'Expired'
    }
    return 'Invalid'
}

export const VerifyCertificate: FC = () => {
    const { code } = useParams<{ code: string }>()
    const [result, setResult] = useState<VerificationResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!code) {
            setError('No verification code provided')
            setLoading(false)
            return
        }

        axios
            .get<VerificationResult>(`${baseURL}/verify/${code}`)
            .then((res) => {
                setResult(res.data)
                setError(null)
            })
            .catch((err) => {
                setError(err.response?.data?.message || err.message || 'Verification failed')
            })
            .finally(() => setLoading(false))
    }, [code])

    const invalidLabel = useMemo(() => (result ? invalidStatusLabel(result.checks) : 'Invalid'), [result])

    if (loading) {
        return (
            <div className={`dscp-surface ${styles.page}`}>
                <div className={styles.loadingContainer} data-test="verification-loading" role="status" aria-live="polite" aria-busy="true">
                    <CircularLoader />
                    <p className={styles.loadingText}>Verifying certificate...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`dscp-surface ${styles.page}`}>
                <Card className={styles.card}>
                    <div className={`${styles.sheet} ${styles.sheetNeutral}`} data-test="verification-sheet">
                        <div className={styles.header}>
                            <h1 className={styles.title}>Certificate verification</h1>
                        </div>
                        <div data-test="verification-error">
                            <NoticeBox className={styles.neutralNotice} error title="Verification failed">
                                {error}
                            </NoticeBox>
                        </div>
                    </div>
                </Card>
            </div>
        )
    }

    if (!result) {
        return (
            <div className={`dscp-surface ${styles.page}`}>
                <Card className={styles.card}>
                    <div className={`${styles.sheet} ${styles.sheetNeutral}`} data-test="verification-sheet">
                        <div className={styles.header}>
                            <h1 className={styles.title}>Certificate verification</h1>
                        </div>
                        <div data-test="verification-error">
                            <NoticeBox className={styles.neutralNotice} error title="Could not verify">
                                Unable to verify certificate. Please check the verification code.
                            </NoticeBox>
                        </div>
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className={`dscp-surface ${styles.page}`}>
            <Card className={styles.card}>
                <div className={`${styles.sheet} ${result.valid ? styles.sheetValid : styles.sheetInvalid}`} data-test="verification-sheet">
                    <div className={styles.header}>
                        <h1 className={styles.title}>DHIS2 certificate verification</h1>
                    </div>

                    {result.valid ? (
                        <div className={styles.validResult} data-test="verification-valid">
                            <span className={styles.validTag} role="status">
                                Valid
                            </span>
                            <div className={styles.statusIcon} aria-hidden>
                                ✓
                            </div>
                            <h2 className={styles.statusTitle}>Certificate is valid</h2>
                            <p className={styles.statusDescription}>This certificate is registered and currently valid for verification.</p>

                            {result.certificate && (
                                <div className={styles.certificateDetails} data-test="verify-certificate-details">
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Implementation</span>
                                        <span className={styles.detailValue}>{result.certificate.implementation?.name}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Certificate Number</span>
                                        <span className={styles.detailValue}>{result.certificate.certificateNumber}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Control Group</span>
                                        <span className={styles.detailValue}>{result.certificate.controlGroup}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Score</span>
                                        <span className={styles.detailValue}>{Math.round(result.certificate.finalScore)}%</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Valid From</span>
                                        <span className={styles.detailValue}>{new Date(result.certificate.validFrom).toLocaleDateString()}</span>
                                    </div>
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Valid Until</span>
                                        <span className={styles.detailValue}>{new Date(result.certificate.validUntil).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            )}

                            <div className={styles.checksSection}>
                                <h3 className={styles.checksTitle}>Verification checks</h3>
                                <ul className={styles.checksList} data-test="verification-checks">
                                    <li className={styles.checkItem}>
                                        <span className={styles.checkIcon} aria-hidden>
                                            ✓
                                        </span>
                                        Certificate found in registry
                                    </li>
                                    <li className={styles.checkItem}>
                                        <span className={styles.checkIcon} aria-hidden>
                                            ✓
                                        </span>
                                        Certificate not revoked
                                    </li>
                                    <li className={styles.checkItem}>
                                        <span className={styles.checkIcon} aria-hidden>
                                            ✓
                                        </span>
                                        Certificate not expired
                                    </li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.invalidResult} data-test="verification-invalid">
                            <span className={styles.revokedTag} role="status">
                                {invalidLabel}
                            </span>
                            <div className={styles.statusIconInvalid} aria-hidden>
                                ✗
                            </div>
                            <h2 className={styles.statusTitleInvalid}>Certificate cannot be verified</h2>
                            <p className={styles.statusDescription}>This verification link does not resolve to an active certificate.</p>

                            <div className={styles.checksSection}>
                                <h3 className={styles.checksTitle}>Verification checks</h3>
                                <ul className={styles.checksList} data-test="verification-checks">
                                    <li className={result.checks.found ? styles.checkItem : styles.checkItemFailed}>
                                        <span className={result.checks.found ? styles.checkIcon : styles.checkIconFailed} aria-hidden>
                                            {result.checks.found ? '✓' : '✗'}
                                        </span>
                                        {result.checks.found ? 'Certificate found in registry' : 'Certificate not found in registry'}
                                    </li>
                                    {result.checks.found && (
                                        <>
                                            <li className={result.checks.notRevoked ? styles.checkItem : styles.checkItemFailed}>
                                                <span className={result.checks.notRevoked ? styles.checkIcon : styles.checkIconFailed} aria-hidden>
                                                    {result.checks.notRevoked ? '✓' : '✗'}
                                                </span>
                                                {result.checks.notRevoked ? 'Certificate not revoked' : 'Certificate has been revoked'}
                                            </li>
                                            <li className={result.checks.notExpired ? styles.checkItem : styles.checkItemFailed}>
                                                <span className={result.checks.notExpired ? styles.checkIcon : styles.checkIconFailed} aria-hidden>
                                                    {result.checks.notExpired ? '✓' : '✗'}
                                                </span>
                                                {result.checks.notExpired ? 'Certificate not expired' : 'Certificate has expired'}
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        </div>
                    )}

                    <div className={styles.footer}>
                        <p className={styles.footerText}>DHIS2 Server Certification Program</p>
                    </div>
                </div>
            </Card>
        </div>
    )
}
