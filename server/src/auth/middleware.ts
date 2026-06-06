/**
 * Auth middleware (BuildSpec §6.1): all /api engine routes require a valid
 * session. Reads the signed session cookie, verifies it, and attaches userId.
 */
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySessionToken } from './session.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: number;
  }
}

/** Minimal cookie parser — avoids pulling in cookie-parser for one cookie. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readCookie(req, SESSION_COOKIE);
  const userId = verifySessionToken(token);
  if (userId === null) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  req.userId = userId;
  next();
}
