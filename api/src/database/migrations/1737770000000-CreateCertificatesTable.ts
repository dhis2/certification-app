import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCertificatesTable1737770000000 implements MigrationInterface {
  name = 'CreateCertificatesTable1737770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "certificates" (
        "id" UUID PRIMARY KEY,
        "submission_id" UUID NOT NULL UNIQUE REFERENCES "submissions"("id") ON DELETE RESTRICT,
        "implementation_id" UUID NOT NULL REFERENCES "implementations"("id") ON DELETE RESTRICT,
        "certificate_number" VARCHAR(100) NOT NULL UNIQUE,
        "certification_result" "certification_result_enum" NOT NULL,
        "control_group" "control_group_enum" NOT NULL,
        "final_score" DECIMAL(10, 4) NOT NULL,
        "valid_from" DATE NOT NULL,
        "valid_until" DATE NOT NULL,
        "verification_code" VARCHAR(50) UNIQUE,
        "is_revoked" BOOLEAN NOT NULL DEFAULT FALSE,
        "revoked_at" TIMESTAMPTZ,
        "revoked_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "revocation_reason" TEXT,
        "issued_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "issued_by" UUID REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_certificates_submission" ON "certificates"("submission_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_certificates_implementation" ON "certificates"("implementation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_certificates_verification" ON "certificates"("verification_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_certificates_revoked" ON "certificates"("is_revoked")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_certificates_revoked"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_certificates_verification"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_certificates_implementation"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_certificates_submission"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "certificates"`);
  }
}
