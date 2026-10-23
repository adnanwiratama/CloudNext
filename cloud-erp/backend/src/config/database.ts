import knex, { Knex } from 'knex';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';

dotenv.config();

// ── Production (default) connection ──────────────────────────────────────────
// This is the real connection to the production Postgres instance. It is also
// the fallback used outside of any request (migrations, startup, jobs).
export const prodDb: Knex = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'cloud_erp',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'erp_secure_password',
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
  acquireConnectionTimeout: 10000,
});

// ── Per-request environment binding (Option C) ───────────────────────────────
// The auth middleware binds the resolved environment DB (prod/sandbox) for the
// duration of a request via runWithDb(). Any module that does
// `import db from '../config/database'` and calls db(...) will transparently use
// the request's environment connection — no route changes required.
const als = new AsyncLocalStorage<Knex>();

export function runWithDb<T>(conn: Knex, fn: () => T): T {
  return als.run(conn, fn);
}

/** The Knex active for the current request, or the prod connection as fallback. */
function activeKnex(): Knex {
  return als.getStore() || prodDb;
}

// A callable proxy that behaves exactly like a Knex instance but always targets
// the request's active connection. `db('table')`, `db.raw(...)`,
// `db.transaction(...)`, `db.schema`, etc. all forward to the active Knex.
const db: Knex = new Proxy(function () {} as unknown as Knex, {
  apply(_target, _thisArg, args: any[]) {
    // db(tableName) / db(raw) → call the active knex as a function
    return (activeKnex() as any)(...args);
  },
  get(_target, prop: string | symbol) {
    const value = (activeKnex() as any)[prop];
    // Bind functions so `this` stays the active knex (e.g. db.transaction).
    return typeof value === 'function' ? value.bind(activeKnex()) : value;
  },
  set(_target, prop: string | symbol, value: any) {
    (activeKnex() as any)[prop] = value;
    return true;
  },
}) as Knex;

export default db;
