import { Button, Card, CircularLoader, SingleSelectField, SingleSelectOption } from '@dhis2/ui'
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heading, CursorPagination } from '../../components/index.ts'
import { useCertificatesList, usePaginationNavigation } from '../../hooks/index.ts'
import type { CertificateEntry } from '../../hooks/use-certificates.ts'
import { formatDate } from '../../utils/format.ts'
import styles from './certificates-list.module.css'

const PAGE_SIZE = 20

const getStatusBadge = (cert: CertificateEntry) => {
    if (cert.isRevoked) {
        return (
            <span className={`${styles.pill} ${styles.pillRevoked}`} role="status">
                Revoked
            </span>
        )
    }
    if (new Date(cert.validUntil) < new Date()) {
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

export const CertificatesList = () => {
    const navigate = useNavigate()
    const [status, setStatus] = useState('all')
    const pagination = usePaginationNavigation()
    const { afterCursor, cursorStack, goToNextPage, goToPreviousPage, resetPagination, getDisplayRange } = pagination

    const { certificates, totalCount, pageInfo, loading } = useCertificatesList({
        status,
        first: PAGE_SIZE,
        after: afterCursor,
    })

    const { start: displayStart, end: displayEnd } = getDisplayRange(PAGE_SIZE, totalCount)

    const handleStatusChange = useCallback(
        ({ selected }: { selected: string }) => {
            setStatus(selected)
            resetPagination()
        },
        [resetPagination]
    )

    return (
        <div className={`dscp-surface ${styles.container}`}>
            <Heading title="Certificate Management" />

            <div className={styles.filters}>
                <SingleSelectField label="Status" selected={status} onChange={handleStatusChange}>
                    <SingleSelectOption label="All" value="all" />
                    <SingleSelectOption label="Active" value="active" />
                    <SingleSelectOption label="Revoked" value="revoked" />
                    <SingleSelectOption label="Expired" value="expired" />
                </SingleSelectField>
            </div>

            <Card className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loadingContainer}>
                        <CircularLoader />
                    </div>
                ) : certificates.length === 0 ? (
                    <div className={styles.emptyState}>No certificates found</div>
                ) : (
                    <>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Certificate #</th>
                                    <th>Score</th>
                                    <th>Status</th>
                                    <th>Valid From</th>
                                    <th>Valid Until</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {certificates.map((cert) => (
                                    <tr key={cert.id}>
                                        <td>{cert.certificateNumber}</td>
                                        <td>{Math.round(cert.finalScore)}%</td>
                                        <td>{getStatusBadge(cert)}</td>
                                        <td>{formatDate(cert.validFrom)}</td>
                                        <td>{formatDate(cert.validUntil)}</td>
                                        <td>
                                            <div className={styles.actionsCell}>
                                                <Button small onClick={() => navigate(`/admin/certificates/${cert.id}`)}>
                                                    View
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <CursorPagination
                            start={displayStart}
                            end={displayEnd}
                            total={totalCount}
                            hasNextPage={pageInfo.hasNextPage}
                            hasPreviousPage={cursorStack.length > 0}
                            onNextPage={() => goToNextPage(pageInfo.endCursor)}
                            onPreviousPage={goToPreviousPage}
                        />
                    </>
                )}
            </Card>
        </div>
    )
}
