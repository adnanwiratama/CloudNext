import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, X, Check, Shield, Users } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';

// ─── Permission Matrix Definition ────────────────────────────────────────────
const PERMISSION_LEVELS = ['NONE', 'VIEW', 'CREATE', 'EDIT', 'FULL'] as const;
type PermLevel = typeof PERMISSION_LEVELS[number];

const PERMISSION_SECTIONS = [
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

const LEVEL_COLORS: Record<PermLevel, string> = {
  NONE:   'bg-slate-100 text-slate-400',
  VIEW:   'bg-sky-100 text-sky-700',
  CREATE: 'bg-emerald-100 text-emerald-700',
  EDIT:   'bg-amber-100 text-amber-700',
  FULL:   'bg-blue-600 text-white',
};

// ─── Role Form Modal ──────────────────────────────────────────────────────────
function RoleModal({ onClose, onSaved, editing }: any) {
  const initPerms = () => {
    const base: Record<string, PermLevel> = {};
    PERMISSION_SECTIONS.forEach(s => s.items.forEach(i => { base[i.key] = 'NONE'; }));
    if (editing?.permissions) {
      try {
        const perms = typeof editing.permissions === 'string' ? JSON.parse(editing.permissions) : editing.permissions;
        Object.assign(base, perms);
      } catch {}
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
function UserModal({ onClose, onSaved, roles, editing }: any) {
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

// ─── Main Users/Roles Page ────────────────────────────────────────────────────
export default function UsersRolesPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [userModal, setUserModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });
  const [roleModal, setRoleModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/settings/users').then(r => r.data.data || []),
  });
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/api/settings/roles').then(r => r.data.data || []),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/users/${id}`),
    onSuccess: () => { toast.success('User removed'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to remove user'),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/roles/${id}`),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete role'),
  });

  const handleTabAction = () => {
    if (activeTab === 'users') setUserModal({ open: true, editing: null });
    else setRoleModal({ open: true, editing: null });
  };

  const parsePermissions = (role: any) => {
    if (!role.permissions) return {};
    try {
      return typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;
    } catch { return {}; }
  };

  const countPerms = (role: any) => {
    const perms = parsePermissions(role);
    return Object.values(perms).filter((v: any) => v !== 'NONE').length;
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Settings', path: '/settings' }, { label: 'Users / Roles' }]}
        title="Users / Roles"
        actions={
          <button onClick={handleTabAction} className="btn-primary btn-sm">
            <Plus size={13} /> {activeTab === 'users' ? 'New User' : 'New Role'}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-slate-200">
        <button onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Users size={14} /> Manage Users ({users.length})
        </button>
        <button onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'roles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Shield size={14} /> Manage Roles ({roles.length})
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="erp-card">
          {usersLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Admin</th>
                  <th>Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className="font-medium">{user.name}</span>
                        {user.id === currentUser?.id && <span className="badge badge-blue text-2xs">You</span>}
                      </div>
                    </td>
                    <td className="text-slate-600 text-xs">{user.email}</td>
                    <td>
                      {user.role_name
                        ? <span className="badge badge-purple text-2xs">{user.role_name}</span>
                        : <span className="text-slate-400 text-xs">-</span>}
                    </td>
                    <td className="text-slate-400 text-xs">{formatDate(user.last_login_at)}</td>
                    <td>{user.is_admin && <span className="badge badge-orange text-2xs">Admin</span>}</td>
                    <td><span className={user.is_active ? 'badge badge-green text-2xs' : 'badge badge-gray text-2xs'}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setUserModal({ open: true, editing: user })} className="p-1 text-slate-400 hover:text-blue-600"><Pencil size={13} /></button>
                        {user.id !== currentUser?.id && (
                          <button onClick={() => { if (confirm(`Remove user ${user.name}?`)) deleteUserMutation.mutate(user.id); }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-3">
          {rolesLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : roles.length === 0 ? (
            <div className="erp-card flex flex-col items-center py-16 text-slate-400">
              <Shield size={32} className="mb-3 opacity-30" />
              <p className="text-sm">No roles defined yet.</p>
              <button onClick={() => setRoleModal({ open: true, editing: null })} className="btn-primary btn-sm mt-3"><Plus size={13} /> Create First Role</button>
            </div>
          ) : (
            <div className="erp-card">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Role Name</th>
                    <th>Description</th>
                    <th>Active Permissions</th>
                    <th>System</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role: any) => (
                    <tr key={role.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-blue-500" />
                          <span className="font-medium">{role.name}</span>
                        </div>
                      </td>
                      <td className="text-slate-500 text-xs">{role.description || '-'}</td>
                      <td>
                        <span className="badge badge-blue text-2xs">{countPerms(role)} permissions</span>
                      </td>
                      <td>{role.is_system && <span className="badge badge-gray text-2xs">System</span>}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setRoleModal({ open: true, editing: role })} className="p-1 text-slate-400 hover:text-blue-600"><Pencil size={13} /></button>
                          {!role.is_system && (
                            <button onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteRoleMutation.mutate(role.id); }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {userModal.open && (
        <UserModal
          onClose={() => setUserModal({ open: false, editing: null })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['users'] })}
          roles={roles}
          editing={userModal.editing}
        />
      )}
      {roleModal.open && (
        <RoleModal
          onClose={() => setRoleModal({ open: false, editing: null })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['roles'] })}
          editing={roleModal.editing}
        />
      )}
    </div>
  );
}
