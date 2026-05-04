import { useCallback, useMemo } from 'react'
import type { PageInfo } from '../types/pagination.ts'
import { useAuthAxios } from './use-auth-axios.ts'
import { useCursorPagination } from './use-cursor-pagination.ts'

interface CertificateEntry {
    id: string
    certificateNumber: string
    implementationId: string
    implementationName?: string
    finalScore: number
    isRevoked: boolean
    controlGroup: string
    validFrom: string
    validUntil: string
    verificationCode: string
    issuedAt: string
    revokedAt?: string | null
    revocationReason?: string | null
    revokedBy?: string | null
    integrityStatus?: {
        valid: boolean
    }
}

interface CertificatesListFilters {
    implementationId?: string
    status?: string
    first?: number
    after?: string
}

interface UseCertificatesListReturn {
    certificates: CertificateEntry[]
    totalCount: number
    pageInfo: PageInfo
    loading: boolean
    error: Error | null
    refetch: () => Promise<void>
}

const DEFAULT_PAGE_SIZE = 20

export const useCertificatesList = (filters: CertificatesListFilters = {}): UseCertificatesListReturn => {
    const { implementationId, status, first = DEFAULT_PAGE_SIZE, after } = filters

    const params = useMemo(
        () => ({
            implementationId,
            status: status && status !== 'all' ? status : undefined,
        }),
        [implementationId, status]
    )

    const { items, totalCount, pageInfo, loading, error, refetch } = useCursorPagination<CertificateEntry>({
        endpoint: '/certificates',
        params,
        pageSize: first,
        after,
    })

    return { certificates: items, totalCount, pageInfo, loading, error, refetch }
}

interface UseCertificateActionsReturn {
    revokeCertificate: (id: string, reason: string) => Promise<void>
    loading: boolean
}

export const useCertificateActions = (): UseCertificateActionsReturn => {
    const [{ loading: revokeLoading }, executeRevoke] = useAuthAxios({ method: 'POST' }, { manual: true })

    const revokeCertificate = useCallback(
        async (id: string, reason: string): Promise<void> => {
            await executeRevoke({ url: `/certificates/${id}/revoke`, data: { reason } })
        },
        [executeRevoke]
    )

    return {
        revokeCertificate,
        loading: revokeLoading,
    }
}

export type { CertificateEntry, CertificatesListFilters }
