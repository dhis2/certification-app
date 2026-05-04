import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVcColumnsAndAddJustification1737780000000 implements MigrationInterface {
  name = 'DropVcColumnsAndAddJustification1737780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP COLUMN IF EXISTS "vc_json"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP COLUMN IF EXISTS "signature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP COLUMN IF EXISTS "signing_key_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP COLUMN IF EXISTS "status_list_index"`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP COLUMN IF EXISTS "certificate_hash"`,
    );

    await queryRunner.query(
      `ALTER TABLE "criteria" ADD COLUMN IF NOT EXISTS "justification" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "criteria" DROP COLUMN IF EXISTS "justification"`,
    );

    await queryRunner.query(
      `ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "certificate_hash" VARCHAR(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "status_list_index" INT`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "signing_key_version" INT`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "signature" TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "vc_json" JSONB`,
    );
  }
}
