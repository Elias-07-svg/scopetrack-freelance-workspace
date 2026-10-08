import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db.js';

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const database = getPool();
const client = await database.connect();

try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['scopetrack-schema-migrations']);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (alreadyApplied.rowCount) {
      console.log(`Already applied: ${file}`);
      continue;
    }

    const migration = await readFile(join(migrationsDirectory, file), 'utf8');
    await client.query(migration);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    console.log(`Applied: ${file}`);
  }
  await client.query('COMMIT');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
  throw error;
} finally {
  client.release();
  await database.end();
}
