import { Knex } from 'knex';
import { prodDb } from '../../config/database';
import { getEnvDb } from '../../config/envDb';

/**
 * Refresh the sandbox database with a fresh copy of production (Option C).
 *
 * Pure-Knex logical copy (no pg_dump dependency): reads every table from the
 * production connection and replaces the sandbox contents. Foreign-key order is
 * ignored by setting `session_replication_role = replica` during the load, which
 * disables FK checks and triggers for the copy transaction.
 *
 * One-directional: production is only READ; sandbox is fully overwritten.
 */
export interface RefreshResult {
  tables: number;
  rowsCopied: number;
  durationMs: number;
  lastRefreshAt: string;
  refreshCount: number;
}

// Tables that must NOT be copied (infrastructure / knex bookkeeping).
// app_settings holds the refresh metadata and must NOT be overwritten by a copy.
const SKIP_TABLES = new Set(['knex_migrations', 'knex_migrations_lock', 'app_settings']);

// ── Refresh metadata (stored on production in a small key/value table) ───────
let _appSettingsEnsured = false;
async function ensureAppSettings(): Promise<void> {
  if (_appSettingsEnsured) return;
  if (!(await prodDb.schema.hasTable('app_settings'))) {
    await prodDb.schema.createTable('app_settings', (t: any) => {
      t.string('key', 100).primary();
      t.text('value').nullable();
      t.timestamp('updated_at').defaultTo(prodDb.fn.now());
    });
  }
  _appSettingsEnsured = true;
}

async function getSetting(key: string): Promise<string | null> {
  await ensureAppSettings();
  const row = await prodDb('app_settings').where({ key }).first();
  return row ? row.value : null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await ensureAppSettings();
  await prodDb('app_settings')
    .insert({ key, value, updated_at: new Date() })
    .onConflict('key')
    .merge({ value, updated_at: new Date() });
}

/** Return the persisted sandbox-refresh metadata (from production). */
export async function getSandboxRefreshMeta(): Promise<{ lastRefreshAt: string | null; refreshCount: number }> {
  const at = await getSetting('sandbox_last_refresh_at');
  const cnt = await getSetting('sandbox_refresh_count');
  return { lastRefreshAt: at, refreshCount: cnt ? parseInt(cnt) || 0 : 0 };
}

export async function refreshSandbox(): Promise<RefreshResult> {
  const started = Date.now();
  const source: Knex = prodDb;
  const target: Knex = getEnvDb('sandbox');

  // 1. List all base tables in the public schema of production.
  const tablesRes = await source.raw(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const tables: string[] = (tablesRes.rows || [])
    .map((r: any) => r.tablename)
    .filter((t: string) => !SKIP_TABLES.has(t));

  let rowsCopied = 0;

  // 2. Replace sandbox data inside one transaction with FK checks disabled.
  await target.transaction(async (trx) => {
    await trx.raw(`SET session_replication_role = replica`);

    // Clear all target tables first (FK checks are off, so order doesn't matter).
    for (const t of tables) {
      await trx(t).del();
    }

    // Copy rows table-by-table from production, chunked to bound memory.
    for (const t of tables) {
      const CHUNK = 1000;
      let offset = 0;
      // Order by nothing specific; stable enough for a full copy.
      // Loop until a page returns fewer rows than the chunk size.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await source(t).select('*').limit(CHUNK).offset(offset);
        if (!rows.length) break;
        await trx(t).insert(rows);
        rowsCopied += rows.length;
        offset += rows.length;
        if (rows.length < CHUNK) break;
      }
    }

    await trx.raw(`SET session_replication_role = DEFAULT`);
  });

  // Record refresh metadata on production (increment count, stamp time).
  const prev = await getSandboxRefreshMeta();
  const refreshCount = prev.refreshCount + 1;
  const lastRefreshAt = new Date().toISOString();
  await setSetting('sandbox_refresh_count', String(refreshCount));
  await setSetting('sandbox_last_refresh_at', lastRefreshAt);

  return { tables: tables.length, rowsCopied, durationMs: Date.now() - started, lastRefreshAt, refreshCount };
}
