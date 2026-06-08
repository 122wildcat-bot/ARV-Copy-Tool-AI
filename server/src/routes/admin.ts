/**
 * Admin routes — gated by requireAuth + requireAdmin. The admin role is granted
 * to ADMIN_EMAILS (default: the owner's email) on signup/login.
 */
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { usersRepo } from '../auth/users.js';

export const adminRouter = Router();

// All admin routes require an authenticated admin.
adminRouter.use(requireAuth, requireAdmin);

/** List all accounts (id, email, role, created). */
adminRouter.get('/users', (_req, res) => {
  res.json({ users: usersRepo.listAll() });
});
