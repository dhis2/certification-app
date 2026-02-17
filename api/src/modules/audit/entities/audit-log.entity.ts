import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // User events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Implementation events
  IMPLEMENTATION_CREATED = 'IMPLEMENTATION_CREATED',
  IMPLEMENTATION_UPDATED = 'IMPLEMENTATION_UPDATED',
  IMPLEMENTATION_DELETED = 'IMPLEMENTATION_DELETED',

  // Template events
  TEMPLATE_CREATED = 'TEMPLATE_CREATED',
  TEMPLATE_UPDATED = 'TEMPLATE_UPDATED',
  TEMPLATE_DELETED = 'TEMPLATE_DELETED',
  TEMPLATE_PUBLISHED = 'TEMPLATE_PUBLISHED',
  TEMPLATE_VERSIONED = 'TEMPLATE_VERSIONED',

  // Submission events
  SUBMISSION_CREATED = 'SUBMISSION_CREATED',
  SUBMISSION_UPDATED = 'SUBMISSION_UPDATED',
  SUBMISSION_SUBMITTED = 'SUBMISSION_SUBMITTED',
  SUBMISSION_REVIEWED = 'SUBMISSION_REVIEWED',
  SUBMISSION_APPROVED = 'SUBMISSION_APPROVED',
  SUBMISSION_REJECTED = 'SUBMISSION_REJECTED',
  SUBMISSION_REVISION_REQUESTED = 'SUBMISSION_REVISION_REQUESTED',
  SUBMISSION_WITHDRAWN = 'SUBMISSION_WITHDRAWN',

  // Certificate events
  CERTIFICATE_ISSUED = 'CERTIFICATE_ISSUED',
  CERTIFICATE_REVOKED = 'CERTIFICATE_REVOKED',
  CERTIFICATE_VERIFIED = 'CERTIFICATE_VERIFIED',

  // Security events
  INTEGRITY_CHECK_FAILED = 'INTEGRITY_CHECK_FAILED',

  // Evidence events
  EVIDENCE_UPLOADED = 'EVIDENCE_UPLOADED',
  EVIDENCE_DELETED = 'EVIDENCE_DELETED',
  EVIDENCE_LINKED = 'EVIDENCE_LINKED',
  EVIDENCE_UNLINKED = 'EVIDENCE_UNLINKED',

  // Admin events
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
}

export enum AuditAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  SUBMIT = 'SUBMIT',
  REVIEW = 'REVIEW',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REVOKE = 'REVOKE',
  ISSUE = 'ISSUE',
  VERIFY = 'VERIFY',
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
}

@Entity('audit_log')
@Index(['entityType', 'entityId'])
@Index(['actorId'])
@Index(['createdAt'])
@Index(['archiveAfter'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  /** Denormalized label captured at write time so the trail survives entity deletion. */
  @Column({ name: 'entity_name', type: 'varchar', length: 255, nullable: true })
  entityName!: string | null;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_ip', type: 'inet', nullable: true })
  actorIp!: string | null;

  @Column({ name: 'actor_user_agent', type: 'text', nullable: true })
  actorUserAgent!: string | null;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ name: 'prev_hash', type: 'varchar', length: 64, nullable: true })
  prevHash!: string | null;

  @Column({ name: 'curr_hash', type: 'varchar', length: 64 })
  currHash!: string;

  @Column({ name: 'signature', type: 'varchar', length: 64 })
  signature!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Null means indefinite retention. */
  @Column({ name: 'archive_after', type: 'timestamptz', nullable: true })
  archiveAfter!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;
}
