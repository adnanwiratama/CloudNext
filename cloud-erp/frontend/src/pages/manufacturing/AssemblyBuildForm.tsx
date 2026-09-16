import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency, formatNumber } from '../../utils/format';
import toast from 'react-hot-toast';

export default function AssemblyBuildForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items, locations } = useFormOptions();

  const preItemId = searchParams.get('itemId') || '';
  const preBomId = searchParams.get('bomId') || '';

  const [form, setForm] = useState({
    buildDate: new Date().toISOString().split('T')[0],
    assemblyItemId: preItemId,
    bomId: preBomId,
    buildQty: 1,
    locationId: '',
    workOrderId: searchParams.get('workOrderId') || '',
    memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Load BOM lines when item selected
  const { data: bomData } = useQuery({
    queryKey: ['bom-detail', form.bomId],
    queryFn: () => api.get(`/api/manufacturing/boms/${form.bomId}`).then(r => r.data.data),
    enabled: !!form.bomId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/manufacturing/assembly-builds', data),
    onSuccess: () => { toast.success('Assembly build recorded. Inventory updated.'); navigate('/manufacturing/assembly-builds'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record assembly'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assemblyItemId) { toast.error('Assembly Item is required'); return; }
    if (!form.buildQty || form.buildQty <= 0) { toast.error('Build Quantity must be greater than 0'); return; }
    if (!form.locationId) { toast.error('Location is required'); return; }
    mutation.mutate({ ...form, buildQty: Number(form.buildQty) });
  };

  const assemblyItems = items.filter((it: any) => it.item_type === 'assembly' || it.item_type === 'finished_good');

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing', path: '/manufacturing/work-orders' }, { label: 'Assembly Build' }]}
        title="Assembly Build"
        subtitle="Record production / assembly of finished goods from components"
        actions={
          <>
            <button type="button" onClick={() => navigate('/manufacturing/assembly-builds')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="assembly-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Post Assembly Build
            </button>
          </>
        }
      />
      <form id="assembly-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Assembly Build Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Assembly Item *</label>
              <select className="erp-select" value={form.assemblyItemId} onChange={e => set('assemblyItemId', e.target.value)} required>
                <option value="">-- Select Assembly Item --</option>
                {assemblyItems.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Build Date *</label>
              <input type="date" className="erp-input" value={form.buildDate} onChange={e => set('buildDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Build Quantity *</label>
              <input type="number" min="0.001" step="0.001" className="erp-input" value={form.buildQty} onChange={e => set('buildQty', parseFloat(e.target.value))} required />
            </div>
            <div>
              <label className="erp-label">Finish To Location *</label>
              <select className="erp-select" value={form.locationId} onChange={e => set('locationId', e.target.value)} required>
                <option value="">-- Select Location --</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Linked Work Order</label>
              <input type="text" className="erp-input" value={form.workOrderId} onChange={e => set('workOrderId', e.target.value)} placeholder="WO-XXXX (optional)" />
            </div>
            <div>
              <label className="erp-label">Memo</label>
              <input type="text" className="erp-input" value={form.memo} onChange={e => set('memo', e.target.value)} />
            </div>
          </div>
        </div>

        {bomData && bomData.lines && (
          <div className="erp-card">
            <div className="form-section-title">Components to Consume (from BOM)</div>
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm text-blue-700">
              Building <strong>{form.buildQty} units</strong> requires the following components:
            </div>
            <table className="erp-table">
              <thead>
                <tr><th>Component</th><th>Item Code</th><th className="text-right">Qty per Unit</th><th className="text-right">Total Required</th><th className="text-right">Unit Cost</th></tr>
              </thead>
              <tbody>
                {bomData.lines.map((comp: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{comp.item_name}</td>
                    <td className="font-mono text-xs text-slate-500">{comp.item_code}</td>
                    <td className="text-right">{formatNumber(comp.quantity)} {comp.unit}</td>
                    <td className="text-right font-semibold text-blue-600">{formatNumber(comp.quantity * form.buildQty)} {comp.unit}</td>
                    <td className="text-right text-slate-500">{formatCurrency(comp.unit_cost || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="erp-card border-emerald-200 bg-emerald-50/30">
          <div className="p-4 text-sm text-emerald-800">
            <p className="font-medium">GL & Inventory Impact</p>
            <p className="text-xs text-emerald-700 mt-1">
              <strong>Inventory (Finished Good) +{form.buildQty}</strong> at finish location<br />
              <strong>Inventory (Components) —</strong> consumed quantities deducted<br />
              Journal: Dr. Finished Goods Inventory → Cr. WIP / Component Inventory
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
