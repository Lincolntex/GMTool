import 'dotenv/config';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: path.resolve('server/db/migrations'),
  });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (import.meta.url === entrypoint) {
  runMigrations()
    .then(async () => {
      console.log('Database migrations applied.');
      await pool.end();
    })
    .catch(async (error: unknown) => {
      console.error('Database migration failed.', error);
      await pool.end();
      process.exitCode = 1;
    });
}
