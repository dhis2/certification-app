import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogTable1737890000000 implements MigrationInterface {
  name = 'CreateAuditLogTable1737890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" BIGSERIAL PRIMARY KEY,
        "event_type" VARCHAR(100) NOT NULL,
        "entity_type" VARCHAR(100) NOT NULL,
        "entity_id" UUID NOT NULL,
        "entity_name" VARCHAR(255),
        "action" VARCHAR(50) NOT NULL,
        "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "actor_ip" INET,
        "actor_user_agent" TEXT,
        "old_values" JSONB,
        "new_values" JSONB,
        "prev_hash" VARCHAR(64),
        "curr_hash" VARCHAR(64) NOT NULL,
        "signature" VARCHAR(64) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "archive_after" TIMESTAMPTZ
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "entity_name" VARCHAR(255)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "audit_log"("entity_type","entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_actor" ON "audit_log"("actor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_created_at" ON "audit_log"("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_archive_after" ON "audit_log"("archive_after")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_event_type" ON "audit_log"("event_type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_event_type"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_archive_after"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }
}
