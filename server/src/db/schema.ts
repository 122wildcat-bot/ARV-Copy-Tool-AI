/**
 * Database schema (BuildSpec §7.3). SQLite for solo/MVP; the DDL is written to
 * mirror cleanly onto Postgres for Phase C. Applied idempotently on startup by
 * the migration runner in client.ts.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  google_sub TEXT UNIQUE,
  password_hash TEXT,
  defaults_json TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_subject (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address_key TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_comps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  criteria_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(address_key, criteria_hash)
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_address TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
`;
