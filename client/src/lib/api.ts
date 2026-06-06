/**
 * Thin API client (BuildSpec §13). Cookies carry the session, so every request
 * uses credentials: 'include'. One store holds the AnalysisResult; every edit
 * posts to /recalc and replaces it (BuildSpec §13 state model).
 */

// Mirror of the server's AnalysisResult — kept loose here; tighten by importing
// shared types via a workspace package in a later pass.
export type AnalysisResult = Record<string, unknown>;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (email: string, password: string, name?: string) =>
    req<{ id: number }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    req<{ id: number }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req<{ id: number; email: string }>('/api/auth/me'),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  analyze: (address: string, overrides?: Record<string, number>) =>
    req<{ dealId: number; analysis: AnalysisResult }>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ address, overrides }),
    }),
  recalc: (dealId: number, edits: Record<string, unknown>) =>
    req<{ analysis: AnalysisResult }>(`/api/deals/${dealId}/recalc`, {
      method: 'POST',
      body: JSON.stringify(edits),
    }),
  removeComp: (dealId: number, providerId: string) =>
    req<{ analysis: AnalysisResult }>(`/api/deals/${dealId}/comps/remove`, {
      method: 'POST',
      body: JSON.stringify({ providerId }),
    }),
};
