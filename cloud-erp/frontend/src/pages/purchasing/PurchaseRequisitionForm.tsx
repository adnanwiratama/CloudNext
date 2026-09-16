import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import CurrencyInput from '../../components/common/CurrencyInput';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

interface ReqLine { itemId: string; description: string; qty: number; estimatedPrice: number; unit: string; }

export default function PurchaseRequisitionForm() {
  const navigate = useNavigate();
  const { items, locations } = useFormOptions();

  const [form, setForm] = useState({
    requestDate: new Date().toISOString().split('T')[0],
    requiredDate: '',
    requestedBy: '',
    department: '',
    locationId: '',
    priority: 'normal',
    memo: '',
  });
  const [lines, setLines] = useState<ReqLine[]>([{ itemId: '', description: '', qty: 1, estimatedPrice: 0, unit: 'pcs' }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.estimatedPrice), 0);
  const addLine = () => setLines(p => [...p, { itemId: '', description: '', qty: 1, estimatedPrice: 0, unit: 'pcs' }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof ReqLine, v: any) =>
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find((x: any) => x.id === v); if (it) { u.description = it.name; u.unit = it.unit_of_measure || 'pcs'; } }
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/requisitions', data),
    onSuccess: () => { toast.success('Purchase requisition submitted'); navigate('/purchasing/requisitions'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some(l => !l.itemId)) { toast.error('All lines must have an item selected'); return; }
    mutation.mutate({ ...form, lines, totalEstimated: total });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Purchase Request', path: '/purchasing/requisitions' }, { label: 'New Purchase Request' }]}
        title="Purchase Request"
        subtitle="Submit a purchase requisition for approval"
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchasing/requisitions')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="pr-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Submit Request
            </button>
          </>
        }
      />
      <form id="pr-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Request Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Request Date *</label>
              <input type="date" className="erp-input" value={form.requestDate} onChange={e => set('requestDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Required Date</label>
              <input type="date" className="erp-input" value={form.requiredDate} onChange={e => set('requiredDate', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Priority</label>
              <select className="erp-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="erp-label">Requested By</label>
              <input type="text" className="erp-input" value={form.requestedBy} onChange={e => set('requestedBy', e.target.value)} placeholder="Employee name" />
            </div>
            <div>
              <label className="erp-label">Department</label>
              <input type="text" className="erp-input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Department name" />
            </div>
            <div>
              <label className="erp-label">Deliver To Location</label>
              <select className="erp-select" value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                <option value="">-- Select Location --</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="erp-label">Memo / Justification</label>
              <textarea className="erp-textarea" rows={2} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Reason for purchase request" />
            </div>
          </div>
        </div>
        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Items Requested</span>
            <button type="button" onClick={addLine} className="btn-secondary btn-sm"><Plus size={12} /> Add Item</button>
          </div>
          <table className="erp-table">
            <thead><tr><th>Item *</th><th>Description</th><th>Unit</th><th className="text-right">Qty *</th><th className="text-right">Est. Price</th><th className="text-right">Est. Total</th><th className="w-10"></th></tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="erp-select text-xs" value={line.itemId} onChange={e => setLine(i, 'itemId', e.target.value)} required>
                      <option value="">-- Select Item --</option>
                      {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
                    </select>
                  </td>
                  <td><input type="text" className="erp-input text-xs" value={line.description} onChange={e => setLine(i, 'description', e.target.value)} /></td>
                  <td><input type="text" className="erp-input text-xs w-16" value={line.unit} onChange={e => setLine(i, 'unit', e.target.value)} /></td>
                  <td><input type="number" min="0.01" step="0.01" className="erp-input text-right text-xs w-20" value={line.qty} onChange={e => setLine(i, 'qty', parseFloat(e.target.value))} /></td>
                  <td><CurrencyInput value={line.estimatedPrice} onChange={v => setLine(i, 'estimatedPrice', v)} className="text-xs text-right" /></td>
                  <td className="text-right font-medium text-sm">{formatCurrency(Number(line.qty) * Number(line.estimatedPrice))}</td>
                  <td><button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right text-sm">Total Estimated</td>
                <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </form>
    </div>
  );
}
