import { Request, Response, NextFunction } from 'express';
import db from '../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Role permission enforcement.
//
// Roles store a JSON map { permKey: 'NONE'|'VIEW'|'CREATE'|'EDIT'|'FULL' }.
// Level semantics:
//   NONE   → no access (block all, incl. GET)
//   VIEW   → read only (GET)
//   CREATE → VIEW + create (POST)
//   EDIT   → CREATE + edit (PUT/PATCH)
//   FULL   → EDIT + delete (DELETE)
//
// We map the request (method + URL) to a permission key and required action,
// then check the role's stored level. Admins bypass. Unmapped routes are allowed
// (so this never blocks things the matrix doesn't model, e.g. auth, files, lookups).
// ─────────────────────────────────────────────────────────────────────────────

type Level = 'NONE' | 'VIEW' | 'CREATE' | 'EDIT' | 'FULL';
const LEVEL_RANK: Record<Level, number> = { NONE: 0, VIEW: 1, CREATE: 2, EDIT: 3, FULL: 4 };

// Minimum level required for an action.
const actionForMethod = (method: string): { action: string; minLevel: Level } => {
  switch (method) {
    case 'GET': return { action: 'view', minLevel: 'VIEW' };
    case 'POST': return { action: 'create', minLevel: 'CREATE' };
    case 'PUT':
    case 'PATCH': return { action: 'edit', minLevel: 'EDIT' };
    case 'DELETE': return { action: 'delete', minLevel: 'FULL' };
    default: return { action: 'view', minLevel: 'VIEW' };
  }
};

// Map an API path (after /api/) to a permission key. Order matters: first match wins.
// Only transaction/master routes that exist in the role matrix are mapped.
const PATH_MAP: Array<{ re: RegExp; key: string }> = [
  // ── Purchasing ──
  { re: /^purchasing\/orders/,            key: 'purchase_order' },
  { re: /^purchasing\/requisitions/,      key: 'purchase_requisition' },
  { re: /^purchasing\/bills/,             key: 'vendor_bill' },
  { re: /^purchasing\/payments/,          key: 'bill_payment' },
  { re: /^purchasing\/prepayments/,       key: 'bill_payment' },
  { re: /^purchasing\/vendor-credits/,    key: 'vendor_credit' },
  { re: /^purchasing\/vendor-returns/,    key: 'vendor_return' },
  { re: /^purchasing\/receipts/,          key: 'item_receipt' },
  // ── Sales ──
  { re: /^sales\/orders/,                 key: 'sales_order' },
  { re: /^sales\/quotations/,             key: 'quotation' },
  { re: /^sales\/invoices/,               key: 'invoice' },
  { re: /^sales\/payments/,               key: 'customer_payment' },
  { re: /^sales\/deposits/,               key: 'customer_payment' },
  { re: /^sales\/refunds/,                key: 'customer_refund' },
  { re: /^sales\/credit-memos/,           key: 'credit_memo' },
  { re: /^sales\/return-authorizations/,  key: 'return_authorization' },
  { re: /^sales\/fulfillments/,           key: 'item_fulfillment' },
  // ── Inventory ──
  { re: /^inventory\/adjustments/,        key: 'inventory_adjustment' },
  { re: /^inventory\/transfer-orders/,    key: 'transfer_order' },
  { re: /^inventory\/transfers/,          key: 'transfer_order' },
  // ── Manufacturing ──
  { re: /^manufacturing\/work-orders/,    key: 'work_order' },
  { re: /^manufacturing\/assembly-builds/,key: 'work_order' },
  { re: /^manufacturing\/boms/,           key: 'bom' },
  { re: /^manufacturing\/work-centers/,   key: 'work_center' },
  // ── Accounting ──
  { re: /^accounting\/journals/,          key: 'journal_entry' },
  { re: /^accounting\/accounts/,          key: 'chart_of_accounts' },
  // ── Bank ──
  { re: /^bank\/checks/,                  key: 'check' },
  { re: /^bank\/deposits/,                key: 'deposit' },
  // ── Employee / Expense ──
  { re: /^employee\/expenses/,            key: 'expense_report' },
  // ── Master data ──
  { re: /^customers/,                     key: 'customer' },
  { re: /^vendors/,                       key: 'vendor' },
  { re: /^items/,                         key: 'item' },
];

function resolveKey(pathAfterApi: string): string | null {
  const clean = pathAfterApi.replace(/^\/+/, '').toLowerCase();
  for (const m of PATH_MAP) if (m.re.test(clean)) return m.key;
  return null;
}

// Cache role permissions briefly to avoid a DB hit on every request.
const permCache = new Map<string, { perms: Record<string, Level>; at: number }>();
const CACHE_MS = 30_000;

async function getRolePermissions(roleId: string): Promise<Record<string, Level>> {
  const cached = permCache.get(roleId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.perms;
  const role = await db('roles').where({ id: roleId }).first();
  let perms: Record<string, Level> = {};
  if (role?.permissions) {
    try { perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions; } catch { perms = {}; }
  }
  permCache.set(roleId, { perms, at: Date.now() });
  return perms;
}

export function clearPermCache(roleId?: string): void {
  if (roleId) permCache.delete(roleId); else permCache.clear();
}

export const enforcePermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) { next(); return; }           // auth middleware handles missing user
    if (req.user.isAdmin) { next(); return; }     // admins bypass
    if (!req.user.roleId) { next(); return; }     // no role assigned → don't block (legacy users)

    const key = resolveKey(req.path);
    if (!key) { next(); return; }                 // route not modelled → allow

    const perms = await getRolePermissions(req.user.roleId);
    // If the matrix doesn't mention this key at all, don't block (backward compatible).
    if (!(key in perms)) { next(); return; }

    const level = (perms[key] || 'NONE') as Level;
    const { action, minLevel } = actionForMethod(req.method);

    if (LEVEL_RANK[level] >= LEVEL_RANK[minLevel]) { next(); return; }

    res.status(403).json({
      success: false,
      error: `Your role does not allow you to ${action} this record (access level: ${level}).`,
    });
  } catch (e: any) {
    // Fail open on unexpected errors so a bug here never locks everyone out.
    console.error('[PERM] enforce error:', e.message);
    next();
  }
};
