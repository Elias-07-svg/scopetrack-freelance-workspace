import pg from 'pg';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Create server/.env from server/.env.example and add your hosted PostgreSQL URL.');
  }
  if (!pool) {
    const connectionUrl = new URL(process.env.DATABASE_URL);
    connectionUrl.searchParams.set('sslmode', 'verify-full');
    pool = new Pool({
      connectionString: connectionUrl.toString(),
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}
