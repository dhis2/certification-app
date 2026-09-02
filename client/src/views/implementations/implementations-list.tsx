import {
    Button,
    Card,
    CircularLoader,
    DataTable,
    DataTableHead,
    DataTableBody,
    DataTableRow,
    DataTableCell,
    DataTableColumnHeader,
    InputField,
    NoticeBox,
    Pagination,
    Modal,
    ModalTitle,
    ModalContent,
    ModalActions,
    ButtonStrip,
    SingleSelectField,
    SingleSelectOption,
} from '@dhis2/ui'
import { useState, useMemo, useCallback } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heading, ConfirmationModal } from '../../components/index.ts'
import { useAuth, useImplementations } from '../../hooks/index.ts'
import type { Implementation, CreateImplementationDto } from '../../types/index.ts'
import { ImplementationForm } from './implementation-form.tsx'
import styles from './implementations-list.module.css'

const PAGE_SIZE = 10

type StatusFilter = 'active' | 'archived' | 'all'

const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' },
]

const ARCHIVE_MESSAGE = 'It will leave the working list. Existing assessments and certificates stay. New assessments cannot be started.'

export const ImplementationsList: FC = () => {
    const navigate = useNavigate()
    const { isAdmin } = useAuth()
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
    const isActive = statusFilter === 'all' ? undefined : statusFilter === 'active'
    const { implementations, loading, error, createImplementation, restoreImplementation, deleteImplementation, refetch } = useImplementations({ isActive })

    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [archiveTarget, setArchiveTarget] = useState<Implementation | null>(null)
    const [restoreTarget, setRestoreTarget] = useState<Implementation | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [actionError, setActionError] = useState('')

    const filteredImplementations = useMemo(() => {
        if (!searchTerm.trim()) {
            return implementations
        }
        const term = searchTerm.toLowerCase()
        return implementations.filter(
            (impl) => impl.name.toLowerCase().includes(term) || impl.country?.toLowerCase().includes(term) || impl.contactEmail?.toLowerCase().includes(term)
        )
    }, [implementations, searchTerm])

    const totalPages = Math.ceil(filteredImplementations.length / PAGE_SIZE)
    const paginatedImplementations = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE
        return filteredImplementations.slice(start, start + PAGE_SIZE)
    }, [filteredImplementations, currentPage])

    const handleCreate = useCallback(
        async (data: CreateImplementationDto) => {
            setIsSubmitting(true)
            setActionError('')
            try {
                await createImplementation(data)
                setShowCreateModal(false)
            } catch (err) {
                setActionError(err instanceof Error ? err.message : 'Failed to create implementation')
            } finally {
                setIsSubmitting(false)
            }
        },
        [createImplementation]
    )

    const handleArchive = useCallback(async () => {
        if (!archiveTarget) {
            return
        }
        setIsSubmitting(true)
        setActionError('')
        try {
            await deleteImplementation(archiveTarget.id)
            setArchiveTarget(null)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to archive implementation')
        } finally {
            setIsSubmitting(false)
        }
    }, [archiveTarget, deleteImplementation])

    const handleRestore = useCallback(async () => {
        if (!restoreTarget) {
            return
        }
        setIsSubmitting(true)
        setActionError('')
        try {
            await restoreImplementation(restoreTarget.id)
            setRestoreTarget(null)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to restore implementation')
        } finally {
            setIsSubmitting(false)
        }
    }, [restoreTarget, restoreImplementation])

    if (loading) {
        return (
            <div className={styles.container}>
                <Heading title="Implementations" />
                <div className={styles.loadingContainer}>
                    <CircularLoader />
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.container}>
                <Heading title="Implementations" />
                <NoticeBox error title="Error loading implementations">
                    {error.message}
                    <Button small secondary onClick={refetch}>
                        Retry
                    </Button>
                </NoticeBox>
            </div>
        )
    }

    const emptyMessage = searchTerm ? 'No implementations match your search.' : statusFilter === 'archived' ? 'No archived implementations.' : 'No implementations yet.'

    return (
        <div className={styles.container}>
            <Heading title="Implementations" />

            {actionError && (
                <NoticeBox error title="Error">
                    {actionError}
                </NoticeBox>
            )}

            <Card className={styles.card}>
                <div className={styles.toolbar}>
                    <div className={styles.filters}>
                        <div className={styles.searchWrapper}>
                            <InputField
                                placeholder="Search implementations..."
                                value={searchTerm}
                                onChange={(e: { value: string }) => {
                                    setSearchTerm(e.value)
                                    setCurrentPage(1)
                                }}
                                data-test="search-implementations"
                            />
                        </div>
                        <SingleSelectField
                            label="Status"
                            selected={statusFilter}
                            onChange={(e: { selected: string }) => {
                                setStatusFilter(e.selected as StatusFilter)
                                setCurrentPage(1)
                            }}
                            className={styles.statusFilter}
                            data-test="status-filter"
                        >
                            {statusOptions.map((option) => (
                                <SingleSelectOption key={option.value} value={option.value} label={option.label} />
                            ))}
                        </SingleSelectField>
                    </div>
                    <Button primary onClick={() => setShowCreateModal(true)} data-test="create-implementation">
                        Add Implementation
                    </Button>
                </div>

                {paginatedImplementations.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>{emptyMessage}</p>
                        {!searchTerm && statusFilter === 'active' && (
                            <Button small onClick={() => setShowCreateModal(true)}>
                                Create your first implementation
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <DataTable>
                            <DataTableHead>
                                <DataTableRow>
                                    <DataTableColumnHeader>Name</DataTableColumnHeader>
                                    <DataTableColumnHeader>Country</DataTableColumnHeader>
                                    <DataTableColumnHeader>Contact Email</DataTableColumnHeader>
                                    <DataTableColumnHeader>DHIS2 Instance</DataTableColumnHeader>
                                    <DataTableColumnHeader>Actions</DataTableColumnHeader>
                                </DataTableRow>
                            </DataTableHead>
                            <DataTableBody>
                                {paginatedImplementations.map((impl) => {
                                    const isArchived = impl.isActive === false
                                    return (
                                        <DataTableRow key={impl.id} data-test={`implementation-row-${impl.id}`}>
                                            <DataTableCell>
                                                <strong>{impl.name}</strong>
                                            </DataTableCell>
                                            <DataTableCell>{impl.country || '-'}</DataTableCell>
                                            <DataTableCell>{impl.contactEmail || '-'}</DataTableCell>
                                            <DataTableCell>
                                                {impl.dhis2InstanceUrl ? (
                                                    <a
                                                        href={impl.dhis2InstanceUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={styles.instanceLink}
                                                    >
                                                        {(() => {
                                                            try {
                                                                return new URL(impl.dhis2InstanceUrl).hostname
                                                            } catch {
                                                                return impl.dhis2InstanceUrl
                                                            }
                                                        })()}
                                                    </a>
                                                ) : (
                                                    '-'
                                                )}
                                            </DataTableCell>
                                            <DataTableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                <ButtonStrip>
                                                    <Button small onClick={() => navigate(`/implementations/${impl.id}`)} data-test={`view-impl-${impl.id}`}>
                                                        View
                                                    </Button>
                                                    {isAdmin &&
                                                        (isArchived ? (
                                                            <Button small onClick={() => setRestoreTarget(impl)} data-test={`restore-impl-${impl.id}`}>
                                                                Restore
                                                            </Button>
                                                        ) : (
                                                            <Button small destructive onClick={() => setArchiveTarget(impl)} data-test={`archive-impl-${impl.id}`}>
                                                                Archive
                                                            </Button>
                                                        ))}
                                                </ButtonStrip>
                                            </DataTableCell>
                                        </DataTableRow>
                                    )
                                })}
                            </DataTableBody>
                        </DataTable>

                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <Pagination
                                    page={currentPage}
                                    pageCount={totalPages}
                                    pageSize={PAGE_SIZE}
                                    total={filteredImplementations.length}
                                    onPageChange={setCurrentPage}
                                    onPageSizeChange={() => {}}
                                />
                            </div>
                        )}
                    </>
                )}
            </Card>

            {showCreateModal && (
                <Modal onClose={() => setShowCreateModal(false)} position="middle">
                    <ModalTitle>Add Implementation</ModalTitle>
                    <ModalContent>
                        <ImplementationForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
                    </ModalContent>
                    <ModalActions>
                        <ButtonStrip end>
                            <Button secondary onClick={() => setShowCreateModal(false)}>
                                Cancel
                            </Button>
                            <Button primary type="submit" form="implementation-form" loading={isSubmitting} data-test="submit-implementation">
                                Create
                            </Button>
                        </ButtonStrip>
                    </ModalActions>
                </Modal>
            )}

            <ConfirmationModal
                open={!!archiveTarget}
                title="Archive Implementation"
                message={`Archive "${archiveTarget?.name}"? ${ARCHIVE_MESSAGE}`}
                confirmLabel="Archive"
                destructive
                onConfirm={handleArchive}
                onCancel={() => setArchiveTarget(null)}
                loading={isSubmitting}
            />

            <ConfirmationModal
                open={!!restoreTarget}
                title="Restore Implementation"
                message={`Restore "${restoreTarget?.name}" to the working list?`}
                confirmLabel="Restore"
                onConfirm={handleRestore}
                onCancel={() => setRestoreTarget(null)}
                loading={isSubmitting}
            />
        </div>
    )
}
