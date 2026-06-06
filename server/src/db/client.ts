/**
 * Database client (BuildSpec §7.3, Phase 0). Uses Node's built-in SQLite
 * (`node:sqlite`) so the MVP has zero native build dependencies. The query
 * surface is deliberately thin and ORM-agnostic so the Phase C swap to
 * Postgres (Drizzle/Prisma) is a config-level change, not a rewrite.
 */
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';
import { SCHEMA_SQL } from './schema.js';

let db: DatabaseSync | null = null;

/** Resolve DATABASE_URL into a SQLite path. `file:./x.sqlite` → `./x.sqlite`. */
function resolvePath(databaseUrl: string): string {
  if (!databaseUrl || databaseUrl === ':memory:') return ':memory:';
  if (databaseUrl.startsWith('file:')) return databaseUrl.slice('file:'.length);
  // A postgres:// URL here means Phase C; not handled by this SQLite client.
  if (databaseUrl.startsWith('postgres')) {
    throw new Error('Postgres DATABASE_URL requires the Phase C client; SQLite client got a postgres URL');
  }
  return databaseUrl;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(resolvePath(env.databaseUrl));
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/** Idempotent migration runner — applies the schema on startup. */
export function migrate(): void {
  getDb().exec(SCHEMA_SQL);
}

/** Health probe used by the /health route (BuildSpec §14 Phase 0). */
export function dbHealthy(): boolean {
  try {
    const row = getDb().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  } catch {
    return false;
  }
}

export function closeDb(): void {
  db?.close();
  db = null;
}
