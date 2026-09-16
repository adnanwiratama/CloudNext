import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

interface TaxForm { name: string; code: string; rate: number; description: string; isActive: boolean; taxType: string; }
const EMPTY: TaxForm = { name: '', code: '', rate: 0, description: '', isActive: true, taxType: 'vat' };

export default function TaxCodePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxForm>(EMPTY);
  const setF = (k: keyof TaxForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['tax-codes'],
    queryFn: () => api.get('/api/settings/tax-codes').then(r => r.data.data || []),
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editId ? api.put(`/api/settings/tax-codes/${editId}`, d) : api.post('/api/settings/tax-codes', d),
    onSuccess: () => {
      toast.success(editId ? 'Tax code updated' : 'Tax code created');
      qc.invalidateQueries({ queryKey: ['tax-codes'] });
      setShowForm(false); setEditId(null); setForm(EMPTY);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openEdit = (t: any) => { setForm({ name: t.name, code: t.code, rate: t.rate, description: t.description, isActive: t.is_active, taxType: t.tax_type }); setEditId(t.id); setShowForm(true); };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Setup', path: '/settings' }, { label: 'Tax Codes' }]}
        title="Tax Code"
        subtitle="Manage tax rates and codes for transactions"
        actions={<button className="btn-primary btn-sm" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}><Plus size={13} /> New Tax Code</button>}
      />
      {showForm && (
        <div className="erp-card mb-4">
          <div className="form-section-title">{editId ? 'Edit Tax Code' : 'New Tax Code'}</div>
          <div className="form-grid-3">
            <div><label className="erp-label">Tax Name *</label><input type="text" className="erp-input" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. PPN 11%" required /></div>
            <div><label className="erp-label">Tax Code *</label><input type="text" className="erp-input" value={form.code} onChange={e => setF('code', e.target.value)} placeholder="e.g. PPN11" required /></div>
            <div><label className="erp-label">Rate (%) *</label><input type="number" min="0" max="100" step="0.01" className="erp-input" value={form.rate} onChange={e => setF('rate', parseFloat(e.target.value) || 0)} /></div>
            <div>
              <label className="erp-label">Tax Type</label>
              <select className="erp-select" value={form.taxType} onChange={e => setF('taxType', e.target.value)}>
                <option value="vat">VAT / PPN</option>
                <option value="withholding">Withholding Tax / PPh</option>
                <option value="sales_tax">Sales Tax</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label className="erp-label">Description</label><input type="text" className="erp-input" value={form.description} onChange={e => setF('description', e.target.value)} /></div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="taxActive" checked={form.isActive} onChange={e => setF('isActive', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <label htmlFor="taxActive" className="erp-label mb-0">Active</label>
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save
            </button>
            <button className="btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="erp-card">
        {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
          <table className="erp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th className="text-right">Rate (%)</th><th>Description</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No tax codes defined. Click "New Tax Code" to add one.</td></tr>
              ) : data.map((t: any) => (
                <tr key={t.id}>
                  <td className="font-mono text-sm font-semibold text-blue-600">{t.code}</td>
                  <td className="font-medium">{t.name}</td>
                  <td><span className="badge badge-blue">{t.tax_type}</span></td>
                  <td className="text-right font-semibold">{t.rate}%</td>
                  <td className="text-slate-500 text-sm">{t.description}</td>
                  <td><span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td><button className="btn-ghost btn-sm" onClick={() => openEdit(t)}><Pencil size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
