/**
 * Users repository (BuildSpec §6.1, §7.3). First login/signup creates the
 * account. Stores optional per-user engine-knob defaults (BuildSpec §6.2).
 */
import { getDb } from '../db/client.js';

export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  googleSub: string | null;
  passwordHash: string | null;
  defaults: Record<string, unknown> | null;
}

function mapRow(row: Record<string, unknown> | undefined): UserRow | null {
  if (!row) return null;
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    googleSub: (row.google_sub as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
    defaults: row.defaults_json ? (JSON.parse(row.defaults_json as string) as Record<string, unknown>) : null,
  };
}

export const usersRepo = {
  findByEmail(email: string): UserRow | null {
    return mapRow(
      getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
        | Record<string, unknown>
        | undefined,
    );
  },

  findById(id: number): UserRow | null {
    return mapRow(
      getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined,
    );
  },

  findByGoogleSub(sub: string): UserRow | null {
    return mapRow(
      getDb().prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as
        | Record<string, unknown>
        | undefined,
    );
  },

  create(params: { email: string; name?: string; passwordHash?: string; googleSub?: string }): number {
    const info = getDb()
      .prepare(
        `INSERT INTO users (email, name, google_sub, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        params.email.toLowerCase(),
        params.name ?? null,
        params.googleSub ?? null,
        params.passwordHash ?? null,
        new Date().toISOString(),
      );
    return Number(info.lastInsertRowid);
  },

  setDefaults(id: number, defaults: Record<string, unknown>): void {
    getDb().prepare('UPDATE users SET defaults_json = ? WHERE id = ?').run(JSON.stringify(defaults), id);
  },
};
