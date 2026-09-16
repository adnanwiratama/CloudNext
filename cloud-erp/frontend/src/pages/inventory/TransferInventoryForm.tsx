import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

interface TransferLine { itemId: string; qty: number; unitCost: number; }

export default function TransferInventoryForm() {
  const navigate = useNavigate();
  const { items, locations } = useFormOptions();

  const [form, setForm] = useState({
    transferDate: new Date().toISOString().split('T')[0],
    fromLocationId: '',
    toLocationId: '',
    memo: '',
    reference: '',
  });
  const [lines, setLines] = useState<TransferLine[]>([{ itemId: '', qty: 1, unitCost: 0 }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addLine = () => setLines(p => [...p, { itemId: '', qty: 1, unitCost: 0 }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof TransferLine, v: any) =>
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find((x: any) => x.id === v); if (it) u.unitCost = it.purchase_price || 0; }
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/inventory/transfers', data),
    onSuccess: () => { toast.success('Inventory transfer completed'); navigate('/inventory/transfers'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromLocationId) { toast.error('From Location is required'); return; }
    if (!form.toLocationId) { toast.error('To Location is required'); return; }
    if (form.fromLocationId === form.toLocationId) { toast.error('From and To locations must be different'); return; }
    if (lines.some(l => !l.itemId)) { toast.error('All lines must have an item'); return; }
    mutation.mutate({ ...form, lines });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Inventory', path: '/inventory/transfers' }, { label: 'Transfer Inventory' }]}
        title="Transfer Inventory"
        subtitle="Move stock between locations"
        actions={
          <>
            <button type="button" onClick={() => navigate('/inventory/transfers')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="transfer-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Post Transfer
            </button>
          </>
        }
      />
      <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Transfer Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Transfer Date *</label>
              <input type="date" className="erp-input" value={form.transferDate} onChange={e => set('transferDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Reference</label>
              <input type="text" className="erp-input" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="Reference number" />
            </div>
            <div></div>
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="erp-label">From Location *</label>
                <select className="erp-select" value={form.fromLocationId} onChange={e => set('fromLocationId', e.target.value)} required>
                  <option value="">-- Select Location --</option>
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="pt-5"><ArrowRight size={20} className="text-slate-400" /></div>
              <div className="flex-1">
                <label className="erp-label">To Location *</label>
                <select className="erp-select" value={form.toLocationId} onChange={e => set('toLocationId', e.target.value)} required>
                  <option value="">-- Select Location --</option>
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="px-4 pb-4">
            <label className="erp-label">Memo</label>
            <input type="text" className="erp-input" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Purpose of transfer" />
          </div>
        </div>
        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Items to Transfer</span>
            <button type="button" onClick={addLine} className="btn-secondary btn-sm"><Plus size={12} /> Add Item</button>
          </div>
          <table className="erp-table">
            <thead><tr><th>Item *</th><th className="text-right">Quantity *</th><th className="text-right">Unit Cost</th><th className="w-10"></th></tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="erp-select text-xs" value={line.itemId} onChange={e => setLine(i, 'itemId', e.target.value)} required>
                      <option value="">-- Select Item --</option>
                      {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="0.001" step="0.001" className="erp-input text-right text-xs w-24" value={line.qty} onChange={e => setLine(i, 'qty', parseFloat(e.target.value))} /></td>
                  <td><input type="number" min="0" step="0.01" className="erp-input text-right text-xs w-32" value={line.unitCost} onChange={e => setLine(i, 'unitCost', parseFloat(e.target.value) || 0)} /></td>
                  <td><button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </div>
  );
}
