/**
 * Auth routes (BuildSpec §6.1). Email/password signup + login with signed
 * session cookies. Google OAuth is scaffolded (see TODO) — the users table and
 * session layer already support a google_sub-based account.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '../auth/session.js';
import { usersRepo } from '../auth/users.js';

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const authRouter = Router();

authRouter.post('/signup', (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, name } = parsed.data;
  if (usersRepo.findByEmail(email)) {
    res.status(409).json({ error: 'account already exists' });
    return;
  }
  const id = usersRepo.create({ email, name, passwordHash: hashPassword(password) });
  res.cookie(SESSION_COOKIE, createSessionToken(id), sessionCookieOptions());
  res.status(201).json({ id, email, name: name ?? null });
});

authRouter.post('/login', (req, res) => {
  const parsed = credsSchema.omit({ name: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = usersRepo.findByEmail(parsed.data.email);
  if (!user?.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.cookie(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  res.json({ id: user.id, email: user.email, name: user.name });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = usersRepo.findById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, defaults: user.defaults });
});

// TODO(Phase 1): Google OAuth callback — exchange code, upsert by google_sub,
// then issue the same session cookie via createSessionToken(user.id).
