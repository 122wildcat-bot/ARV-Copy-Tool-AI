/**
 * Stateless session tokens: HMAC-signed `userId.expiry` payloads stored in a
 * secure HTTP-only cookie (BuildSpec §6.1). No server-side session table needed
 * for the MVP; swap for a session store in Phase C if desired.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, isProd } from '../config/env.js';

export const SESSION_COOKIE = 'ae_session';
const TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function secret(): string {
  // Fall back to a dev-only secret so the app boots without config; never use
  // the fallback in production.
  return env.sessionSecret || 'dev-insecure-session-secret';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const [userIdStr, expiryStr] = payload.split('.');
  const userId = Number(userIdStr);
  const expiry = Number(expiryStr);
  if (!Number.isInteger(userId) || !Number.isFinite(expiry)) return null;
  if (Date.now() > expiry) return null;
  return userId;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: TTL_MS,
    path: '/',
  };
}
