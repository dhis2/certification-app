import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogEntityName1737670000000 implements MigrationInterface {
  name = 'AddAuditLogEntityName1737670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = (await queryRunner.query(
      `SELECT to_regclass('public.audit_log') IS NOT NULL AS exists`,
    )) as { exists: boolean }[];
    if (!tableExists[0]?.exists) return;

    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "entity_name" varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN "entity_name"`,
    );
  }
}
