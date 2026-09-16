import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
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
  // Additional common countries
  'Australia','China','India','Japan','South Korea','United States','United Kingdom',
  'Germany','Netherlands','Saudi Arabia','United Arab Emirates',
];

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold">{editing ? 'Edit Subsidiary' : 'New Subsidiary'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Checkboxes row */}
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
              <label className="erp-label">Name <span className="text-red-500">*</span></label>
              <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Parent Subsidiary <span className="text-red-500">*</span></label>
              <select className="erp-select" value={form.parentId} onChange={e => set('parentId', e.target.value)}>
                <option value="">-- Top Level (No Parent) --</option>
                {otherSubs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Legal Name</label>
              <input type="text" className="erp-input" value={form.legalName} onChange={e => set('legalName', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Web Site</label>
              <input type="url" className="erp-input" value={form.webSite} onChange={e => set('webSite', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className="erp-label">Document Number Prefix</label>
              <input type="text" className="erp-input" value={form.documentNumberPrefix} onChange={e => set('documentNumberPrefix', e.target.value)} placeholder="e.g. CMI-" />
            </div>
            <div>
              <label className="erp-label">Return Email Address</label>
              <input type="email" className="erp-input" value={form.returnEmail} onChange={e => set('returnEmail', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Fax</label>
              <input type="text" className="erp-input" value={form.fax} onChange={e => set('fax', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">State/Province <span className="text-red-500">*</span></label>
              <select className="erp-select" value={form.state} onChange={e => set('state', e.target.value)}>
                <option value="">-- Select Province --</option>
                {INDONESIA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Country <span className="text-red-500">*</span></label>
              <select className="erp-select" value={form.country} onChange={e => set('country', e.target.value)} required>
                {ASEAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="erp-label">Address</label>
              <textarea className="erp-textarea" rows={3} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary btn-sm">
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

  const [form, setForm] = useState<any>(null);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Populate form when company data loads
  if (company && !form) {
    setForm({
      name: company.name || '',
      legalName: company.legal_name || '',
      taxId: company.tax_id || '',
      email: company.email || '',
      phone: company.phone || '',
      website: company.website || '',
      address: company.address || '',
      city: company.city || '',
      country: company.country || 'Indonesia',
      postalCode: company.postal_code || '',
      timezone: company.timezone || 'Asia/Jakarta',
      fiscalYearStart: company.fiscal_year_start || 'January',
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

  if (isLoading || !form) return (
    <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Settings', path: '/settings' }, { label: 'Company' }]}
        title="Company Settings"
        subtitle={company?.name}
        actions={activeTab === 'company' ? (
          <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary btn-sm">
            {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Changes
          </button>
        ) : (
          <button onClick={() => setSubModal({ open: true, editing: null })} className="btn-primary btn-sm">
            <Plus size={13} /> New Subsidiary
          </button>
        )}
      />

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-slate-200">
        {(['company', 'subsidiaries'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'company' ? 'Company' : `Subsidiaries (${subsidiaries.length})`}
          </button>
        ))}
      </div>

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="space-y-4 max-w-3xl">
          <div className="erp-card">
            <div className="form-section-title">Company Information</div>
            <div className="form-grid-2">
              <div>
                <label className="erp-label">Company Code</label>
                <input className="erp-input" value={company?.code || ''} readOnly disabled />
              </div>
              <div>
                <label className="erp-label">Company Name <span className="text-red-500">*</span></label>
                <input className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Legal Name</label>
                <input className="erp-input" value={form.legalName} onChange={e => set('legalName', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Tax ID (NPWP)</label>
                <input className="erp-input" value={form.taxId} onChange={e => set('taxId', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Email</label>
                <input type="email" className="erp-input" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Phone</label>
                <input className="erp-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Website</label>
                <input className="erp-input" value={form.website} onChange={e => set('website', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Base Currency</label>
                <input className="erp-input" value={company?.base_currency || 'IDR'} readOnly disabled />
              </div>
            </div>
            <div className="form-grid-2 pt-0">
              <div>
                <label className="erp-label">Timezone</label>
                <select className="erp-select" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="erp-label">Fiscal Year Start</label>
                <select className="erp-select" value={form.fiscalYearStart} onChange={e => set('fiscalYearStart', e.target.value)}>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="px-4 pb-4">
              <label className="erp-label">Address</label>
              <textarea className="erp-textarea" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="form-grid-3 pt-0">
              <div>
                <label className="erp-label">City</label>
                <input className="erp-input" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Country</label>
                <select className="erp-select" value={form.country} onChange={e => set('country', e.target.value)}>
                  {ASEAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="erp-label">Postal Code</label>
                <input className="erp-input" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subsidiaries Tab */}
      {activeTab === 'subsidiaries' && (
        <div className="erp-card">
          {subsidiaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <p className="text-sm">No subsidiaries yet.</p>
              <button onClick={() => setSubModal({ open: true, editing: null })} className="btn-primary btn-sm mt-3">
                <Plus size={13} /> Add First Subsidiary
              </button>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Legal Name</th>
                  <th>Country</th>
                  <th>State/Province</th>
                  <th>Prefix</th>
                  <th>Parent</th>
                  <th>Flags</th>
                  <th>Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {subsidiaries.map((sub: any) => (
                  <tr key={sub.id}>
                    <td className="font-medium">{sub.name}</td>
                    <td className="text-slate-500 text-xs">{sub.legal_name || '-'}</td>
                    <td>{sub.country || '-'}</td>
                    <td>{sub.state || '-'}</td>
                    <td className="font-mono text-xs">{sub.document_number_prefix || '-'}</td>
                    <td className="text-xs text-slate-500">
                      {subsidiaries.find((s: any) => s.id === sub.parent_id)?.name || '-'}
                    </td>
                    <td>
                      {sub.elimination && <span className="badge badge-purple text-2xs mr-1">Elim</span>}
                    </td>
                    <td>
                      <span className={`badge ${sub.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {sub.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSubModal({ open: true, editing: sub })}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => {
                          if (confirm(`Delete subsidiary "${sub.name}"?`))
                            deleteSubMutation.mutate(sub.id);
                        }} className="p-1 text-slate-400 hover:text-red-600 rounded">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Subsidiary Modal */}
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
