# CloudNext ERP — Multi-Tenant SaaS Design (Database-per-Tenant)

> Status: **Design draft for review. No code changes yet.**
> Goal: Turn the single-company ERP into a SaaS where each customer gets **two
> isolated databases** — Production (live) and Sandbox — provisioned and managed
> from a Super Admin **Control Plane**, with one-click create and one-click
> sandbox refresh.

---

## 1. Terminology

| Term | Meaning |
|---|---|
| **Tenant** | One paying customer. Owns 2 databases: prod + sandbox. |
| **Control Plane** | Super-admin app + central registry DB that manages all tenants. Does NOT hold customer business data. |
| **Data Plane** | The ERP app + each tenant's prod/sandbox databases. Where business transactions run. |
| **Provisioning** | The automated process of creating a tenant's databases (create DB → migrate → seed → register → notify). |
| **Company Code** | The code a customer types at login to select their environment. Each tenant has two: `*-PROD` and `*-SBX`. |

Analogy: the Control Plane is the **building management office**; each tenant's
databases are **individual apartments**. The office creates units, holds the
master keys, and tracks occupancy — but does not live inside any unit.

---

## 2. High-Level Architecture

```
                         ┌─────────────────────────────────────┐
                         │          CONTROL PLANE              │
                         │  (separate app + registry DB)       │
                         │                                     │
   Super Admin ────────▶ │  • Super Admin UI (tenant list,     │
   (you, SaaS owner)     │    New Tenant, Refresh Sandbox,     │
                         │    Suspend, Migrate, Backup)        │
                         │  • Provisioning engine (jobs)       │
                         │  • registry DB: `tenants`, ...      │
                         └───────────────┬─────────────────────┘
                                         │ creates / manages
                                         ▼
   ┌───────────────────────────── DATA PLANE ──────────────────────────────┐
   │                                                                        │
   │  Tenant A           Tenant B            Tenant C          ...          │
   │  ├ erp_a_prod       ├ erp_b_prod        ├ erp_c_prod                   │
   │  └ erp_a_sandbox    └ erp_b_sandbox     └ erp_c_sandbox                │
   │                                                                        │
   │  All served by the SAME ERP app (backend), which picks the right DB    │
   │  connection per request based on the logged-in tenant.                 │
   └────────────────────────────────────────────────────────────────────────┘
```

Key principle: **one ERP codebase, many databases.** The ERP app stays the same;
what changes is that it resolves *which database* to talk to per request.

---

## 3. Control Plane — Registry Schema

A small, separate Postgres database (e.g. `cloudnext_control`) holding only
tenant metadata. Never holds customer business data.

### 3.1 `tenants`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | tenant id |
| `customer_name` | varchar | e.g. "PT Maju Jaya" |
| `slug` | varchar unique | url/db-safe key, e.g. `majujaya` |
| `company_code_prod` | varchar unique | e.g. `MAJU-PROD` |
| `company_code_sandbox` | varchar unique | e.g. `MAJU-SBX` |
| `prod_db_name` | varchar | e.g. `erp_majujaya_prod` |
| `sandbox_db_name` | varchar | e.g. `erp_majujaya_sandbox` |
| `db_host` | varchar | which server/instance hosts it (future multi-server) |
| `db_credential_ref` | varchar | reference/key into secret store (NOT the password itself) |
| `plan` | varchar | free / standard / pro |
| `status` | varchar | `provisioning` / `active` / `suspended` / `failed` / `deleting` |
| `schema_version` | varchar | last migration applied (for migration tracking) |
| `admin_email` | varchar | customer's initial admin email |
| `created_at` / `updated_at` | timestamptz | |

### 3.2 `tenant_jobs` (provisioning / refresh audit)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `type` | varchar | `provision` / `refresh_sandbox` / `migrate` / `backup` / `delete` |
| `status` | varchar | `queued` / `running` / `success` / `failed` |
| `log` | text | step-by-step log / error |
| `started_at` / `finished_at` | timestamptz | |

### 3.3 `super_admins`
Separate from tenant `users`. Only SaaS operators. Strong auth (2FA recommended).

### 3.4 `audit_log`
Every control-plane action (who created/suspended/refreshed which tenant, when).

> **Secrets:** `db_credential_ref` points to a secret manager (or an encrypted
> env/vault entry). Never store raw DB passwords in the registry table.

---

## 4. Super Admin UI (pages)

Separate login + separate route namespace (e.g. `admin.cloudnext.id` or
`/superadmin`). Only `super_admins` can access.

1. **Tenants List** — table: Customer, Company Code (Prod/Sandbox), Plan, Status,
   Created, DB size, actions.
2. **New Tenant** — form: customer name, slug, admin email, plan → **Create**
   (kicks off provisioning job; row appears as `provisioning` then `active`).
3. **Tenant Detail / Actions**:
   - **Refresh Sandbox** (prod → sandbox copy; confirm dialog: "sandbox data will
     be overwritten").
   - **Suspend / Activate** (block/unblock tenant login).
   - **Run Migration** (apply latest migrations to this tenant; or "Migrate All").
   - **Backup Now** (on-demand `pg_dump`).
   - **Delete Tenant** (danger: drops both DBs after backup + typed confirmation).
4. **Jobs / Activity** — live status + logs of provisioning/refresh/migrate jobs.
5. **Migrations Dashboard** — shows each tenant's `schema_version` vs latest, so
   you can see who is behind and migrate them.

---

## 5. Provisioning Flow (one-click "New Tenant")

Runs as a **background job** (not a synchronous HTTP request — can take a while).
All-or-nothing: if any step fails, roll back (drop created DBs, mark `failed`).

```
1. Validate input (unique slug, company codes).
2. INSERT tenants row  → status = 'provisioning'.
3. CREATE DATABASE erp_<slug>_prod
   CREATE DATABASE erp_<slug>_sandbox
4. Run ALL migrations on BOTH databases (knex migrate:latest).
5. Seed PROD with baseline data:
     - company record (with company_code_prod)
     - default Chart of Accounts, UOM, currencies, tax codes
     - document/number sequences
     - 1 admin user (random temp password) for admin_email
   Seed SANDBOX similarly (or leave empty until first refresh — your choice).
6. UPDATE tenants  → status = 'active', schema_version = latest.
7. Send onboarding email: login URL + Company Code (prod) + temp admin password.
8. On ANY failure: DROP created DBs, status = 'failed', record error in tenant_jobs.
```

### Rollback safety
- Each step logged in `tenant_jobs.log`.
- DB creation is outside a transaction (Postgres can't `CREATE DATABASE` in a txn),
  so the job must explicitly `DROP DATABASE` on failure.
- Seeding runs inside a transaction per-DB so a half-seeded DB never goes live.

---

## 6. Sandbox Refresh Flow (Option C, per-tenant)

Triggered from Super Admin (or optionally by the tenant's own admin, with a
button that only appears in PROD, never in SBX).

```
1. Confirm (sandbox will be OVERWRITTEN).
2. status → 'refreshing'; create tenant_jobs row.
3. pg_dump  erp_<slug>_prod           → dump file (temp).
4. DROP + CREATE erp_<slug>_sandbox   (clean slate).
5. pg_restore dump → erp_<slug>_sandbox.
6. Post-restore fixups in sandbox:
     - update company record's company_code → company_code_sandbox
     - optionally scrub/obfuscate sensitive data (emails, if needed)
     - reset/keep number sequences per policy
7. status → 'active'; remove temp dump.
```

Because each tenant has its own databases, a refresh for Tenant A never touches
Tenant B, and never risks Tenant A's production (prod is only READ via pg_dump).

---

## 7. Connection Routing (the core refactor)

### 7.1 Today
`backend/src/config/database.ts` exports **one global `db`** Knex instance.
Every module does `import db from '../config/database'`. Auth middleware queries
`users` on that global `db`. All data is `company_id`-scoped within one DB.

### 7.2 Target
Resolve the correct database connection **per request**, based on the logged-in
tenant, using a pool of Knex instances (one per tenant DB), created lazily.

**Connection Manager (new):** `backend/src/config/tenantDb.ts`
```
const pools = new Map<string, Knex>();   // key = db name

function getTenantDb(dbName, credentials): Knex {
  if (!pools.has(dbName)) {
    pools.set(dbName, knex({ client:'pg', connection:{...}, pool:{min:0,max:5} }));
  }
  return pools.get(dbName)!;
}
```

**Login change:** the JWT must encode the **tenant + environment** (prod/sandbox),
derived from the Company Code entered at login. The control-plane registry maps
Company Code → tenant → db name + credentials.

**Request flow:**
```
request → auth middleware:
   1. verify JWT → get tenantId + env (prod/sandbox)
   2. look up tenant in registry (cached) → db name + credentials
   3. req.db = getTenantDb(dbName, creds)
   4. authenticate the user AGAINST req.db (not global db)
→ routes use req.db instead of the imported global db
```

### 7.3 Migration path (incremental, low-risk)
1. Introduce `req.db` and a `getTenantDb()` manager. Keep the global `db` working.
2. Change auth middleware to resolve `req.db` and authenticate against it.
3. Refactor modules route-by-route: replace `import db` usage with `req.db`
   (or inject `db` via a small helper). This is the **largest** change — it
   touches nearly every route file — so do it module by module with tests.
4. Once all routes use `req.db`, the global `db` is only used by the control
   plane + migration runner.

> This refactor is mechanical but broad. Plan it as its own milestone.

---

## 8. Migrations Across All Tenants

Every feature release that changes the schema must be applied to **every** tenant
DB (prod + sandbox).

- **Migration runner (new):** iterates all `active` tenants, runs `knex
  migrate:latest` against each tenant DB, records `schema_version`, logs failures.
- Run it as part of deploy (or a Super Admin "Migrate All" button).
- Track drift in the Migrations Dashboard (who is behind).
- New tenants are always provisioned at the latest version (step 4 above).

---

## 9. Scaling & Operations

| Concern | Plan |
|---|---|
| **Connection limits** | 100 tenants × pools can exceed Postgres `max_connections`. Use small per-tenant pools (max 3–5), lazy open/close idle pools, and **PgBouncer** in front of Postgres. |
| **Backups** | Scheduled `pg_dump` per tenant DB → object storage (S3-compatible). Retention policy per plan. |
| **Monitoring** | Per-tenant DB size, connection count, slow queries; alert on provisioning/refresh failures. |
| **Noisy neighbor** | One heavy tenant shouldn't starve others; consider resource limits or moving big tenants to their own instance (hence `db_host` in registry). |
| **Zero-downtime deploys** | App code is shared; deploy app, then run migrations across tenants (backward-compatible migrations preferred). |

---

## 10. Security

- Super Admin app: **separate auth**, least-privilege, 2FA, IP allowlist if possible.
- DB credentials in a **secret manager**, referenced by `db_credential_ref`; never
  in the registry row or logs.
- **Tenant isolation guarantee:** a request for Tenant A must be *structurally*
  unable to use Tenant B's pool. Because DBs are physically separate, a routing
  bug fails closed (wrong/no data) rather than leaking across customers — but the
  routing resolver must be covered by tests.
- Audit every control-plane action.
- The provisioning DB user needs `CREATEDB` (and `pg_dump`/`pg_restore` access).
  Keep this privileged user **only** in the control plane, never in the ERP app.

---

## 11. Hosting Prerequisites (must confirm for cloudnext.id)

Database-per-tenant with auto-provisioning requires:

1. **Self-managed Postgres** (VPS/dedicated) — so the app can `CREATE DATABASE`
   and run `pg_dump`/`pg_restore` at runtime. ✅ if cloudnext.id is your own VPS.
2. A Postgres role with **`CREATEDB`** privilege for the provisioning engine.
3. `pg_dump` / `pg_restore` binaries available on the server.
4. Enough RAM/CPU/disk for many DBs + PgBouncer.

⚠️ **Managed Postgres (RDS/Supabase/Neon/etc.) caveat:** many restrict
`CREATE DATABASE`, superuser, or `pg_dump`, or bill per database. If cloudnext.id
is managed, verify these before committing to database-per-tenant.

---

## 12. Implementation Milestones (suggested order)

1. **M0 — Confirm hosting** supports self-managed Postgres + `CREATEDB` + `pg_dump`.
2. **M1 — Control-plane registry**: `cloudnext_control` DB + `tenants`,
   `tenant_jobs`, `super_admins`, `audit_log` + migrations.
3. **M2 — Connection manager + auth refactor**: `getTenantDb()`, `req.db`,
   JWT carries tenant+env, auth resolves per-tenant DB. (Keep global `db` working.)
4. **M3 — Route refactor**: migrate modules from global `db` → `req.db`
   (incremental, module-by-module, with tests).
5. **M4 — Provisioning engine**: background job (create DBs → migrate → seed →
   register → email) with rollback.
6. **M5 — Super Admin UI**: tenant list, New Tenant, Jobs/Activity.
7. **M6 — Sandbox refresh** (Option C) per tenant.
8. **M7 — Multi-tenant migration runner** + Migrations Dashboard.
9. **M8 — Ops hardening**: PgBouncer, per-tenant backups, monitoring, secrets.

> Recommended first buildable slice: **M1 + M2 + M4 + M5** = create a tenant and
> log into its prod DB. Sandbox refresh (M6) and the full route refactor (M3) can
> follow once the create-and-login loop works end to end.

---

## 13. Open Decisions (need your input before building)

1. **Hosting:** Is cloudnext.id a self-managed VPS (Postgres you control) or a
   managed Postgres service? (Determines feasibility of auto-create.)
2. **Who can refresh sandbox:** only you (super admin), or also the tenant's admin?
3. **Sandbox seeding at provision time:** start empty, or mirror prod immediately?
4. **Super admin domain:** separate subdomain (`admin.cloudnext.id`) vs a guarded
   route inside the main app?
5. **Data residency / backup retention** per plan.
6. **Sensitive-data scrubbing** on sandbox refresh (e.g. mask customer emails)?

---

### Appendix A — Why not shared DB (`company_id`) for SaaS?
It works for a single company (your current setup) but for many paying customers:
isolation depends on every query filtering `company_id` correctly — one missed
filter leaks data across customers. Database-per-tenant removes that class of bug
structurally, at the cost of more operational tooling (this document).
