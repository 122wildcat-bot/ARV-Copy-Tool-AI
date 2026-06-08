/**
 * Environment access. Reads from process.env with sane fallbacks so the app
 * boots in development without a fully populated .env (BuildSpec §5).
 *
 * Secrets are intentionally NOT defaulted — absence is surfaced where used.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader (no dependency). Loads KEY=VALUE lines from ./.env into
 * process.env without overriding values already set in the real environment.
 * Runs once at import. Lines starting with # and blank lines are ignored.
 */
function loadDotenv(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes and inline comments on unquoted values.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotenv();

function str(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  appBaseUrl: str('APP_BASE_URL', 'http://localhost:5173'),
  port: num('PORT', 3000),
  sessionSecret: str('SESSION_SECRET'),

  googleOAuthClientId: str('GOOGLE_OAUTH_CLIENT_ID'),
  googleOAuthClientSecret: str('GOOGLE_OAUTH_CLIENT_SECRET'),

  // Emails that are granted the `admin` role on signup/login (comma-separated).
  adminEmails: str('ADMIN_EMAILS', 'yourrealtoradamd@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  models: {
    extract: str('LLM_MODEL_EXTRACT', 'claude-haiku-4-5-20251001'),
    reason: str('LLM_MODEL_REASON', 'claude-sonnet-4-6'),
    deep: str('LLM_MODEL_DEEP', 'claude-opus-4-8'),
  },

  // Empty = auto-select: ATTOM/RentCast if their key is set, else mock.
  dataProvider: str('DATA_PROVIDER', ''),
  attomApiKey: str('ATTOM_API_KEY'),
  houseCanaryApiKey: str('HOUSECANARY_API_KEY'),
  houseCanaryApiSecret: str('HOUSECANARY_API_SECRET'),
  rentcastApiKey: str('RENTCAST_API_KEY'),

  brightMls: {
    baseUrl: str('BRIGHT_MLS_BASE_URL'),
    token: str('BRIGHT_MLS_TOKEN'),
    enabled: bool('BRIGHT_MLS_ENABLED', false),
  },

  geocoder: str('GEOCODER', 'census'),
  googleGeocodeKey: str('GOOGLE_GEOCODE_KEY'),

  databaseUrl: str('DATABASE_URL', 'file:./arv-engine.sqlite'),

  stripe: {
    secretKey: str('STRIPE_SECRET_KEY'),
    webhookSecret: str('STRIPE_WEBHOOK_SECRET'),
    priceId: str('STRIPE_PRICE_ID'),
  },
} as const;

export const isProd = env.nodeEnv === 'production';
