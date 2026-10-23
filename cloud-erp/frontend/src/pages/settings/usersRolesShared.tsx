import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, X, Check, Shield } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

// ─── Permission Matrix Definition ────────────────────────────────────────────
export const PERMISSION_LEVELS = ['NONE', 'VIEW', 'CREATE', 'EDIT', 'FULL'] as const;
export type PermLevel = typeof PERMISSION_LEVELS[number];

export const PERMISSION_SECTIONS = [
  {
    section: '1. Transactions',
    items: [
      { key: 'purchase_order',        label: 'Purchase Order' },
      { key: 'vendor_bill',           label: 'Vendor Bill' },
      { key: 'bill_payment',          label: 'Bill Payment' },
      { key: 'vendor_credit',         label: 'Vendor Credit' },
      { key: 'vendor_return',         label: 'Vendor Return Authorization' },
      { key: 'sales_order',           label: 'Sales Order' },
      { key: 'invoice',               label: 'Invoice' },
      { key: 'cash_sale',             label: 'Cash Sale' },
      { key: 'customer_payment',      label: 'Customer Payment' },
      { key: 'customer_refund',       label: 'Customer Refund' },
      { key: 'credit_memo',           label: 'Credit Memo' },
      { key: 'return_authorization',  label: 'Return Authorization' },
      { key: 'item_fulfillment',      label: 'Item Fulfillment' },
      { key: 'item_receipt',          label: 'Item Receipt' },
      { key: 'transfer_order',        label: 'Transfer Order' },
      { key: 'inventory_adjustment',  label: 'Inventory Adjustment' },
      { key: 'inventory_count',       label: 'Inventory Count' },
      { key: 'journal_entry',         label: 'Journal Entry' },
      { key: 'check',                 label: 'Check' },
      { key: 'deposit',               label: 'Deposit' },
      { key: 'bank_reconciliation',   label: 'Bank Reconciliation' },
      { key: 'expense_report',        label: 'Expense Report' },
      { key: 'work_order',            label: 'Work Order (Manufacturing)' },
      { key: 'purchase_requisition',  label: 'Purchase Requisition' },
      { key: 'quotation',             label: 'Quotation' },
    ],
  },
  {
    section: '2. Reports',
    items: [
      { key: 'report_pl',             label: 'Profit & Loss' },
      { key: 'report_bs',             label: 'Balance Sheet' },
      { key: 'report_cashflow',       label: 'Cash Flow Statement' },
      { key: 'report_trial_balance',  label: 'Trial Balance' },
      { key: 'report_gl',             label: 'General Ledger Report' },
      { key: 'report_ar_aging',       label: 'AR Aging Summary' },
      { key: 'report_ap_aging',       label: 'AP Aging Summary' },
      { key: 'report_ar_register',    label: 'AR Register' },
      { key: 'report_ap_register',    label: 'AP Register' },
      { key: 'report_inventory',      label: 'Inventory Stock Status' },
      { key: 'report_inv_valuation',  label: 'Inventory Valuation' },
      { key: 'report_sales_customer', label: 'Sales by Customer' },
      { key: 'report_sales_item',     label: 'Sales by Item' },
      { key: 'report_manufacturing',  label: 'Manufacturing Report' },
      { key: 'report_mrp',            label: 'MRP Report' },
      { key: 'dashboard',             label: 'Dashboard' },
    ],
  },
  {
    section: '3. Lists (Master Data)',
    items: [
      { key: 'customer',              label: 'Customer' },
      { key: 'vendor',                label: 'Vendor' },
      { key: 'employee',              label: 'Employee' },
      { key: 'item',                  label: 'Item' },
      { key: 'contact',               label: 'Contact' },
      { key: 'uom',                   label: 'Unit of Measure' },
      { key: 'price_level',           label: 'Price Level' },
      { key: 'location',              label: 'Location' },
      { key: 'subsidiary',            label: 'Subsidiary' },
      { key: 'chart_of_accounts',     label: 'Chart of Accounts' },
      { key: 'currency',              label: 'Currency' },
      { key: 'tax_code',              label: 'Tax Code' },
      { key: 'bom',                   label: 'Bill of Materials' },
      { key: 'work_center',           label: 'Work Center' },
      { key: 'department',            label: 'Department' },
      { key: 'accounting_period',     label: 'Accounting Period' },
    ],
  },
];

export const LEVEL_COLORS: Record<PermLevel, string> = {
  NONE:   'bg-slate-100 text-slate-400',
  VIEW:   'bg-sky-100 text-sky-700',
  CREATE: 'bg-emerald-100 text-emerald-700',
  EDIT:   'bg-amber-100 text-amber-700',
  FULL:   'bg-blue-600 text-white',
};

export const parsePermissions = (role: any) => {
  if (!role?.permissions) return {};
  try {
    return typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;
  } catch { return {}; }
};

export const countPerms = (role: any) =>
  Object.values(parsePermissions(role)).filter((v: any) => v !== 'NONE').length;

// ─── Role Form Modal ──────────────────────────────────────────────────────────
export function RoleModal({ onClose, onSaved, editing }: any) {
  const initPerms = () => {
    const base: Record<string, PermLevel> = {};
    PERMISSION_SECTIONS.forEach(s => s.items.forEach(i => { base[i.key] = 'NONE'; }));
    if (editing?.permissions) {
      try {
        const perms = typeof editing.permissions === 'string' ? JSON.parse(editing.permissions) : editing.permissions;
        Object.assign(base, perms);
      } catch { /* ignore */ }
    }
    return base;
  };

  const [name, setName] = useState(editing?.name || '');
  const [desc, setDesc] = useState(editing?.description || '');
  const [perms, setPerms] = useState<Record<string, PermLevel>>(initPerms);

  const setLevel = (key: string, level: PermLevel) => setPerms(p => ({ ...p, [key]: level }));
  const setAllInSection = (items: { key: string }[], level: PermLevel) => {
    setPerms(p => {
      const next = { ...p };
      items.forEach(i => { next[i.key] = level; });
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.put(`/api/settings/roles/${editing.id}`, data)
      : api.post('/api/settings/roles', data),
    onSuccess: () => { toast.success(editing ? 'Role updated' : 'Role created'); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save role'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { toast.error('Role name is required'); return; }
    mutation.mutate({ name, description: desc, permissions: JSON.stringify(perms) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto pt-10 pb-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold flex items-center gap-2"><Shield size={16} className="text-blue-600" />{editing ? 'Edit Role' : 'New Role'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
            <div>
              <label className="erp-label">Role Name <span className="text-red-500">*</span></label>
              <input type="text" className="erp-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Finance Manager" required />
            </div>
            <div>
              <label className="erp-label">Description</label>
              <input type="text" className="erp-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Role description" />
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="px-6 py-4 space-y-6 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center gap-3 text-xs text-slate-500 pb-2 border-b border-slate-100">
              <span className="font-medium">Levels:</span>
              {PERMISSION_LEVELS.map(l => (
                <span key={l} className={`px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[l]}`}>{l}</span>
              ))}
              <span className="ml-1 text-slate-400">FULL = View + Create + Edit + Delete</span>
            </div>

            {PERMISSION_SECTIONS.map(section => (
              <div key={section.section}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">{section.section}</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-1">Set all:</span>
                    {PERMISSION_LEVELS.map(l => (
                      <button key={l} type="button"
                        onClick={() => setAllInSection(section.items, l)}
                        className={`px-2 py-0.5 rounded text-2xs font-medium ${LEVEL_COLORS[l]} hover:opacity-80`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 w-64">Permission</th>
                        <th className="text-center px-2 py-2 text-xs font-medium text-slate-600">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item, idx) => (
                        <tr key={item.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-1.5 text-xs text-slate-700">{item.label}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1 justify-center">
                              {PERMISSION_LEVELS.map(l => (
                                <button
                                  key={l}
                                  type="button"
                                  onClick={() => setLevel(item.key, l)}
                                  className={`px-2 py-0.5 rounded text-2xs font-medium transition-opacity ${
                                    perms[item.key] === l
                                      ? `${LEVEL_COLORS[l]} ring-1 ring-offset-1 ring-blue-400`
                                      : 'bg-slate-100 text-slate-400 hover:opacity-80'
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 sticky bottom-0">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editing ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────
export function UserModal({ onClose, onSaved, roles, editing }: any) {
  const [form, setForm] = useState({
    name: editing?.name || '', email: editing?.email || '',
    password: '', phone: editing?.phone || '',
    roleId: editing?.role_id || '', isAdmin: editing?.is_admin || false,
    isActive: editing?.is_active !== false,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.put(`/api/settings/users/${editing.id}`, data)
      : api.post('/api/settings/users', data),
    onSuccess: () => { toast.success(editing ? 'User updated' : 'User created'); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save user'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">{editing ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div>
            <label className="erp-label">Full Name <span className="text-red-500">*</span></label>
            <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="erp-label">Email <span className="text-red-500">*</span></label>
            <input type="email" className="erp-input" value={form.email} onChange={e => set('email', e.target.value)} required disabled={!!editing} />
          </div>
          <div>
            <label className="erp-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input type="password" className="erp-input" value={form.password} onChange={e => set('password', e.target.value)} required={!editing} />
          </div>
          <div>
            <label className="erp-label">Phone</label>
            <input type="text" className="erp-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="erp-label">Role</label>
            <select className="erp-select" value={form.roleId} onChange={e => set('roleId', e.target.value)}>
              <option value="">-- No Role --</option>
              {(roles || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isAdmin} onChange={e => set('isAdmin', e.target.checked)} className="rounded" />
              Administrator
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded" />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editing ? 'Update' : 'Create'} User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
