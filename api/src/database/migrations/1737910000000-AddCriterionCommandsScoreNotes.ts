import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCriterionCommandsScoreNotes1737910000000 implements MigrationInterface {
  name = 'AddCriterionCommandsScoreNotes1737910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "criteria" ADD COLUMN IF NOT EXISTS "verification_commands" TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE "criteria" ADD COLUMN IF NOT EXISTS "score" DECIMAL(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "criteria" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "criteria" DROP COLUMN IF EXISTS "notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "criteria" DROP COLUMN IF EXISTS "score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "criteria" DROP COLUMN IF EXISTS "verification_commands"`,
    );
  }
}
