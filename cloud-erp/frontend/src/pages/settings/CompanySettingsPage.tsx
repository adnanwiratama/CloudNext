import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Plus, Pencil, Trash2, X, Check, Building, DatabaseBackup, Image as ImageIcon } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

// ─── Static Data ────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const INDONESIA_PROVINCES = [
  'Aceh','Bali','Banten','Bengkulu','DI Yogyakarta','DKI Jakarta','Gorontalo',
  'Jambi','Jawa Barat','Jawa Tengah','Jawa Timur','Kalimantan Barat','Kalimantan Selatan',
  'Kalimantan Tengah','Kalimantan Timur','Kalimantan Utara','Kepulauan Bangka Belitung',
  'Kepulauan Riau','Lampung','Maluku','Maluku Utara','Nusa Tenggara Barat',
  'Nusa Tenggara Timur','Papua','Papua Barat','Papua Barat Daya','Papua Pegunungan',
  'Papua Selatan','Papua Tengah','Riau','Sulawesi Barat','Sulawesi Selatan',
  'Sulawesi Tengah','Sulawesi Tenggara','Sulawesi Utara','Sumatera Barat',
  'Sumatera Selatan','Sumatera Utara',
];

const ASEAN_COUNTRIES = [
  'Indonesia','Malaysia','Singapore','Thailand','Philippines','Vietnam',
  'Myanmar','Cambodia','Laos','Brunei Darussalam','Timor-Leste',
  'Australia','China','India','Japan','South Korea','United States','United Kingdom',
  'Germany','Netherlands','Saudi Arabia','United Arab Emirates',
];

const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
const sel = `${inp} bg-white`;
const lbl = 'block text-xs text-slate-500 mb-1';

const emptySubsidiary = () => ({
  name: '', isInactive: false, parentId: '', webSite: '', documentNumberPrefix: '',
  state: '', country: 'Indonesia', legalName: '', returnEmail: '', fax: '',
  elimination: false, address: '',
});

// ─── Subsidiary Form Modal ───────────────────────────────────────────────────
function SubsidiaryModal({ onClose, onSaved, subsidiaries, editing }: any) {
  const [form, setForm] = useState(editing ? {
    name: editing.name || '', isInactive: !editing.is_active,
    parentId: editing.parent_id || '', webSite: editing.web_site || '',
    documentNumberPrefix: editing.document_number_prefix || '',
    state: editing.state || '', country: editing.country || 'Indonesia',
    legalName: editing.legal_name || '', returnEmail: editing.return_email || '',
    fax: editing.fax || '', elimination: editing.elimination || false,
    address: editing.address || '',
  } : emptySubsidiary());
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.put(`/api/settings/subsidiaries/${editing.id}`, data)
      : api.post('/api/settings/subsidiaries', data),
    onSuccess: () => { toast.success(editing ? 'Subsidiary updated' : 'Subsidiary created'); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save subsidiary'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    if (!form.country) { toast.error('Country is required'); return; }
    mutation.mutate(form);
  };

  const otherSubs = subsidiaries.filter((s: any) => !editing || s.id !== editing.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{editing ? 'Edit Subsidiary' : 'New Subsidiary'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isInactive} onChange={e => set('isInactive', e.target.checked)} className="rounded" />
              <span className="text-slate-700">Subsidiary is Inactive</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.elimination} onChange={e => set('elimination', e.target.checked)} className="rounded" />
              <span className="text-slate-700">Elimination</span>
              <span className="text-xs text-slate-400">(Consolidation use only)</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lbl}>Name <span className="text-red-500">*</span></label>
              <input type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className={lbl}>Parent Subsidiary</label>
              <select className={sel} value={form.parentId} onChange={e => set('parentId', e.target.value)}>
                <option value="">-- Top Level (No Parent) --</option>
                {otherSubs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Legal Name</label>
              <input type="text" className={inp} value={form.legalName} onChange={e => set('legalName', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Web Site</label>
              <input type="url" className={inp} value={form.webSite} onChange={e => set('webSite', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className={lbl}>Document Number Prefix</label>
              <input type="text" className={inp} value={form.documentNumberPrefix} onChange={e => set('documentNumberPrefix', e.target.value)} placeholder="e.g. CMI-" />
            </div>
            <div>
              <label className={lbl}>Return Email Address</label>
              <input type="email" className={inp} value={form.returnEmail} onChange={e => set('returnEmail', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Fax</label>
              <input type="text" className={inp} value={form.fax} onChange={e => set('fax', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>State/Province</label>
              <select className={sel} value={form.state} onChange={e => set('state', e.target.value)}>
                <option value="">-- Select Province --</option>
                {INDONESIA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Country <span className="text-red-500">*</span></label>
              <select className={sel} value={form.country} onChange={e => set('country', e.target.value)} required>
                {ASEAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Address</label>
              <textarea className={inp} rows={3} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editing ? 'Update' : 'Create'} Subsidiary
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Company Settings Page ──────────────────────────────────────────────
export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore(s => s.user?.isAdmin);
  const userEnv = useAuthStore(s => s.user?.env) || 'prod';
  const [activeTab, setActiveTab] = useState<'company' | 'subsidiaries'>('company');
  const [subModal, setSubModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });

  const { data: company, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => api.get('/api/settings/company').then(r => r.data.data),
  });

  const { data: subsidiaries = [] } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });

  // Sandbox environment status (Option C): whether we're in prod/sandbox and may refresh.
  // Key on userEnv so prod and sandbox sessions never share a cached status entry.
  const { data: sandboxStatus } = useQuery({
    queryKey: ['sandbox-status', userEnv],
    queryFn: () => api.get('/api/settings/sandbox/status').then(r => r.data.data),
  });

  const refreshSandboxMutation = useMutation({
    mutationFn: () => api.post('/api/settings/sandbox/refresh').then(r => r.data.data),
    onSuccess: (d: any) => {
      toast.success(`Sandbox refreshed from production — ${d.tables} tables, ${d.rowsCopied} rows (${(d.durationMs / 1000).toFixed(1)}s)`);
      qc.invalidateQueries({ queryKey: ['sandbox-status', userEnv] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to refresh sandbox'),
  });

  // Format the last-refresh timestamp for display (local date + time).
  const lastRefreshText = sandboxStatus?.lastRefreshAt
    ? new Date(sandboxStatus.lastRefreshAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const onRefreshSandbox = () => {
    if (window.confirm('Refresh the SANDBOX database with a fresh copy of PRODUCTION?\n\nAll current sandbox data will be permanently overwritten. This cannot be undone.')) {
      refreshSandboxMutation.mutate();
    }
  };

  const [form, setForm] = useState<any>(null);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (company && !form) {
    setForm({
      name: company.name || '', legalName: company.legal_name || '', taxId: company.tax_id || '',
      email: company.email || '', phone: company.phone || '', website: company.website || '',
      address: company.address || '', city: company.city || '', country: company.country || 'Indonesia',
      postalCode: company.postal_code || '', timezone: company.timezone || 'Asia/Jakarta',
      fiscalYearStart: typeof company.fiscal_year_start === 'number'
        ? (MONTHS[company.fiscal_year_start - 1] || 'January')
        : (company.fiscal_year_start || 'January'),
    });
  }

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/api/settings/company', data),
    onSuccess: () => { toast.success('Company settings saved'); qc.invalidateQueries({ queryKey: ['company-settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save company settings'),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/subsidiaries/${id}`),
    onSuccess: () => { toast.success('Subsidiary deleted'); qc.invalidateQueries({ queryKey: ['subsidiaries'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete subsidiary'),
  });

  // Company logo upload (stored as a base64 data URL on the company record).
  const logoMutation = useMutation({
    mutationFn: (logo: string | null) => api.put('/api/settings/company/logo', { logo }),
    onSuccess: () => {
      toast.success('Logo updated');
      qc.invalidateQueries({ queryKey: ['company-settings'] });
      qc.invalidateQueries({ queryKey: ['company-logo'] }); // header logo
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update logo'),
  });

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { toast.error('Image too large. Max ~1.5MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => logoMutation.mutate(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (isLoading || !form) return (
    <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Building size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Company Settings</h1>
            {company?.name && <span className="text-sm text-slate-500">{company.name}</span>}
            {userEnv === 'sandbox' && (
              <span className="text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">SB</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'company' ? (
              <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
                {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Changes
              </button>
            ) : (
              <button onClick={() => setSubModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
                <Plus size={14} /> New Subsidiary
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-screen-xl mx-auto px-4 flex gap-0 border-t border-slate-100">
          {(['company', 'subsidiaries'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab === 'company' ? 'Company' : `Subsidiaries (${subsidiaries.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto">
        {/* Company Tab */}
        {activeTab === 'company' && (
          <div className="bg-white border border-slate-200 rounded shadow-sm max-w-4xl">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-800">Company Information</div>
            <div className="p-4 grid grid-cols-2 gap-x-10 gap-y-4">
              <div><label className={lbl}>Company Code</label><input className={`${inp} bg-slate-50 text-slate-500`} value={company?.code || ''} readOnly disabled /></div>
              <div><label className={lbl}>Company Name <span className="text-red-500">*</span></label><input className={inp} value={form.name} onChange={e => set('name', e.target.value)} /></div>
              <div><label className={lbl}>Legal Name</label><input className={inp} value={form.legalName} onChange={e => set('legalName', e.target.value)} /></div>
              <div><label className={lbl}>Tax ID (NPWP)</label><input className={inp} value={form.taxId} onChange={e => set('taxId', e.target.value)} /></div>
              <div><label className={lbl}>Email</label><input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div><label className={lbl}>Phone</label><input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              <div><label className={lbl}>Website</label><input className={inp} value={form.website} onChange={e => set('website', e.target.value)} /></div>
              <div><label className={lbl}>Base Currency</label><input className={`${inp} bg-slate-50 text-slate-500`} value={company?.base_currency || 'IDR'} readOnly disabled /></div>
              <div>
                <label className={lbl}>Timezone</label>
                <select className={sel} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Fiscal Year Start</label>
                <select className={sel} value={form.fiscalYearStart} onChange={e => set('fiscalYearStart', e.target.value)}>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className={lbl}>Address</label><textarea className={inp} rows={2} value={form.address} onChange={e => set('address', e.target.value)} /></div>
              <div><label className={lbl}>City</label><input className={inp} value={form.city} onChange={e => set('city', e.target.value)} /></div>
              <div>
                <label className={lbl}>Country</label>
                <select className={sel} value={form.country} onChange={e => set('country', e.target.value)}>
                  {ASEAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Postal Code</label><input className={inp} value={form.postalCode} onChange={e => set('postalCode', e.target.value)} /></div>

              {/* Company Logo — shown in the top header to the right of the CloudNext logo */}
              <div className="col-span-2">
                <label className={lbl}>Company Logo <span className="text-slate-400">(appears in the top header; PNG/JPG/SVG, max ~1.5MB)</span></label>
                <div className="flex items-center gap-4">
                  <div className="h-11 min-w-[44px] px-2 flex items-center justify-center bg-slate-100 border border-slate-200 rounded overflow-hidden">
                    {company?.logo_url
                      ? <img src={company.logo_url} alt="Company logo" className="max-h-9 max-w-[180px] object-contain" />
                      : <span className="text-2xs text-slate-400">No logo</span>}
                  </div>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 cursor-pointer">
                    <ImageIcon size={14} /> {company?.logo_url ? 'Change Logo' : 'Upload Logo'}
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={onLogoFile} disabled={logoMutation.isPending} />
                  </label>
                  {company?.logo_url && (
                    <button type="button" onClick={() => { if (confirm('Remove the company logo?')) logoMutation.mutate(null); }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-red-600 rounded hover:bg-red-50">
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                  {logoMutation.isPending && <Loader2 size={15} className="animate-spin text-blue-500" />}
                </div>
              </div>
            </div>

            {/* Sandbox Refresh — super-admin, production-only, at the bottom of the form.
                Gated on the live session env (userEnv) so it never shows in sandbox. */}
            {isAdmin && userEnv === 'prod' && sandboxStatus?.canRefresh && (
              <div className="px-4 py-4 border-t border-slate-100 bg-amber-50/40">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><DatabaseBackup size={14} className="text-amber-600" /> Sandbox</div>
                    <p className="text-xs text-slate-500 mt-0.5">Overwrite the sandbox database with a fresh copy of production. All current sandbox data is replaced.</p>
                    <p className="text-2xs text-slate-400 mt-1">
                      {lastRefreshText
                        ? `Last refreshed: ${lastRefreshText} · ${sandboxStatus.refreshCount}×`
                        : 'Never refreshed'}
                    </p>
                  </div>
                  <button onClick={onRefreshSandbox} disabled={refreshSandboxMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium rounded hover:bg-amber-100 disabled:opacity-60 flex-shrink-0">
                    {refreshSandboxMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <DatabaseBackup size={14} />} Refresh Sandbox
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subsidiaries Tab */}
        {activeTab === 'subsidiaries' && (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            {subsidiaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <p className="text-sm">No subsidiaries yet.</p>
                <button onClick={() => setSubModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 mt-3">
                  <Plus size={14} /> Add First Subsidiary
                </button>
              </div>
            ) : (
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left">Legal Name</th><th className="px-3 py-1.5 text-left">Country</th><th className="px-3 py-1.5 text-left">State/Province</th><th className="px-3 py-1.5 text-left">Prefix</th><th className="px-3 py-1.5 text-left">Parent</th><th className="px-3 py-1.5 text-left">Flags</th><th className="px-3 py-1.5 text-left">Status</th><th className="px-3 py-1.5 text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subsidiaries.map((sub: any) => (
                    <tr key={sub.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-700">{sub.name}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{sub.legal_name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{sub.country || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{sub.state || '-'}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{sub.document_number_prefix || '-'}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-500">{subsidiaries.find((s: any) => s.id === sub.parent_id)?.name || '-'}</td>
                      <td className="px-3 py-1.5">{sub.elimination && <span className="badge badge-purple text-2xs">Elim</span>}</td>
                      <td className="px-3 py-1.5"><span className={`badge text-2xs ${sub.is_active ? 'badge-green' : 'badge-gray'}`}>{sub.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSubModal({ open: true, editing: sub })} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Pencil size={13} /></button>
                          <button onClick={() => { if (confirm(`Delete subsidiary "${sub.name}"?`)) deleteSubMutation.mutate(sub.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {subModal.open && (
        <SubsidiaryModal
          onClose={() => setSubModal({ open: false, editing: null })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['subsidiaries'] })}
          subsidiaries={subsidiaries}
          editing={subModal.editing}
        />
      )}
    </div>
  );
}
