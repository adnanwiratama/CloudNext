import knex, { Knex } from 'knex';
import dotenv from 'dotenv';
import { prodDb } from './database';

dotenv.config();

/**
 * Per-environment database connection manager (Option C).
 *
 * The app serves two environments backed by two separate Postgres instances:
 *   - 'prod'    → the production database (the existing global `db`)
 *   - 'sandbox' → a mirror used for testing/training, refreshable from prod
 *
 * A request's environment is resolved at login from the Company Code
 * (a "-SB" suffix selects sandbox). getEnvDb(env) returns the right Knex
 * instance; pools are created lazily and cached.
 */
export type DbEnv = 'prod' | 'sandbox';

// Whether the sandbox environment is available at all.
export const SANDBOX_ENABLED = String(process.env.SANDBOX_ENABLED ?? 'true') === 'true';

let _sandboxDb: Knex | null = null;

function buildSandboxDb(): Knex {
  return knex({
    client: 'pg',
    connection: {
      // Defaults match the docker sandbox instance so this works even if the
      // backend container was started before DB_SANDBOX_* env was added.
      host: process.env.DB_SANDBOX_HOST || 'cloud-erp-db-sandbox',
      port: parseInt(process.env.DB_SANDBOX_PORT || '5432'),
      database: process.env.DB_SANDBOX_NAME || 'cloud_erp',
      user: process.env.DB_SANDBOX_USER || 'erp_user',
      password: process.env.DB_SANDBOX_PASSWORD || 'erp_secure_password',
    },
    pool: { min: 0, max: 5, acquireTimeoutMillis: 30000, idleTimeoutMillis: 30000 },
    acquireConnectionTimeout: 10000,
  });
}

/** Return the Knex instance for the given environment (lazy for sandbox). */
export function getEnvDb(env: DbEnv): Knex {
  if (env === 'sandbox') {
    if (!SANDBOX_ENABLED) return prodDb; // fall back to prod if sandbox disabled
    if (!_sandboxDb) _sandboxDb = buildSandboxDb();
    return _sandboxDb;
  }
  return prodDb; // 'prod' uses the real production connection
}

/**
 * Normalize a login Company Code into { code, env }.
 * A trailing "-SB" (case-insensitive) selects the sandbox environment.
 *   "CMI"     -> { code: 'CMI', env: 'prod' }
 *   "CMI-SB"  -> { code: 'CMI', env: 'sandbox' }
 */
export function resolveCompanyEnv(rawCode: string | undefined | null): { code: string; env: DbEnv } {
  const code = String(rawCode || '').trim();
  const m = code.match(/^(.*?)[-_\s]?SB$/i);
  if (m && m[1]) return { code: m[1].trim(), env: 'sandbox' };
  return { code, env: 'prod' };
}
