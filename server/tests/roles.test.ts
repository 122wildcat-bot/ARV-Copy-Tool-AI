import { describe, expect, it } from 'vitest';
import { isAdminEmail, roleForEmail } from '../src/auth/roles.js';

const ADMINS = ['yourrealtoradamd@gmail.com'];

describe('admin role assignment', () => {
  it('grants admin to the configured email (case/whitespace-insensitive)', () => {
    expect(isAdminEmail('yourrealtoradamd@gmail.com', ADMINS)).toBe(true);
    expect(isAdminEmail('  YourRealtorAdamD@Gmail.com ', ADMINS)).toBe(true);
    expect(roleForEmail('yourrealtoradamd@gmail.com', ADMINS)).toBe('admin');
  });

  it('treats everyone else as a regular user', () => {
    expect(isAdminEmail('someone@example.com', ADMINS)).toBe(false);
    expect(roleForEmail('someone@example.com', ADMINS)).toBe('user');
  });

  it('supports multiple admin emails', () => {
    const admins = ['a@x.com', 'b@y.com'];
    expect(roleForEmail('b@y.com', admins)).toBe('admin');
    expect(roleForEmail('c@z.com', admins)).toBe('user');
  });
});
