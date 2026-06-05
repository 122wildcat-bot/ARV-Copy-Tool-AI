/**
 * Repositories over the SQLite client (BuildSpec §7.3). Deals persistence plus
 * the subject/comps cache with TTL checking (BuildSpec §7.3: "Cache lookups
 * check fetched_at against CACHE_TTL_HOURS before re-pulling").
 */
import type { AnalysisResult, CompProperty, SubjectProperty } from '../types.js';
import { getDb } from './client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isFresh(fetchedAt: string, ttlHours: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ttlHours * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export interface DealRow {
  id: number;
  userId: number;
  subjectAddress: string;
  analysis: AnalysisResult;
  createdAt: string;
  updatedAt: string;
}

export interface DealSummary {
  id: number;
  subjectAddress: string;
  createdAt: string;
  updatedAt: string;
}

export const dealsRepo = {
  create(userId: number, subjectAddress: string, analysis: AnalysisResult): number {
    const ts = nowIso();
    const stmt = getDb().prepare(
      `INSERT INTO deals (user_id, subject_address, analysis_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(userId, subjectAddress, JSON.stringify(analysis), ts, ts);
    return Number(info.lastInsertRowid);
  },

  get(id: number): DealRow | null {
    const row = getDb()
      .prepare('SELECT * FROM deals WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as number,
      userId: row.user_id as number,
      subjectAddress: row.subject_address as string,
      analysis: JSON.parse(row.analysis_json as string) as AnalysisResult,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  },

  update(id: number, analysis: AnalysisResult): void {
    getDb()
      .prepare('UPDATE deals SET analysis_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(analysis), nowIso(), id);
  },

  listForUser(userId: number): DealSummary[] {
    const rows = getDb()
      .prepare(
        'SELECT id, subject_address, created_at, updated_at FROM deals WHERE user_id = ? ORDER BY updated_at DESC',
      )
      .all(userId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      subjectAddress: r.subject_address as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  },
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export const cacheRepo = {
  getSubject(addressKey: string, ttlHours: number): { provider: string; subject: SubjectProperty } | null {
    const row = getDb()
      .prepare('SELECT provider, payload, fetched_at FROM cached_subject WHERE address_key = ?')
      .get(addressKey) as Record<string, unknown> | undefined;
    if (!row || !isFresh(row.fetched_at as string, ttlHours)) return null;
    return {
      provider: row.provider as string,
      subject: JSON.parse(row.payload as string) as SubjectProperty,
    };
  },

  putSubject(addressKey: string, provider: string, subject: SubjectProperty): void {
    getDb()
      .prepare(
        `INSERT INTO cached_subject (address_key, provider, payload, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(address_key) DO UPDATE SET provider = excluded.provider,
           payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(addressKey, provider, JSON.stringify(subject), nowIso());
  },

  getComps(addressKey: string, criteriaHash: string, ttlHours: number): CompProperty[] | null {
    const row = getDb()
      .prepare(
        'SELECT payload, fetched_at FROM cached_comps WHERE address_key = ? AND criteria_hash = ?',
      )
      .get(addressKey, criteriaHash) as Record<string, unknown> | undefined;
    if (!row || !isFresh(row.fetched_at as string, ttlHours)) return null;
    return JSON.parse(row.payload as string) as CompProperty[];
  },

  putComps(addressKey: string, provider: string, criteriaHash: string, comps: CompProperty[]): void {
    getDb()
      .prepare(
        `INSERT INTO cached_comps (address_key, provider, criteria_hash, payload, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address_key, criteria_hash) DO UPDATE SET provider = excluded.provider,
           payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(addressKey, provider, criteriaHash, JSON.stringify(comps), nowIso());
  },
};
