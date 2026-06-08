/**
 * Role helpers (admin access). The admin allowlist is env-driven
 * (ADMIN_EMAILS), defaulting to the owner's email. Pure + testable.
 */
import { env } from '../config/env.js';

export type Role = 'user' | 'admin';

export function isAdminEmail(email: string, allow: string[] = env.adminEmails): boolean {
  const e = email.trim().toLowerCase();
  return allow.some((a) => a.trim().toLowerCase() === e);
}

export function roleForEmail(email: string, allow: string[] = env.adminEmails): Role {
  return isAdminEmail(email, allow) ? 'admin' : 'user';
}
