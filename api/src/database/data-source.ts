import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5433', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: process.env.NODE_ENV === 'production' }
      : false,
  entities:
    process.env.NODE_ENV === 'production'
      ? ['dist/**/*.entity.js']
      : ['src/**/*.entity.ts'],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/database/migrations/*.js']
      : ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});

export default dataSource;
