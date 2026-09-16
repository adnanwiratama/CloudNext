import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

interface AdjLine { itemId: string; locationId: string; adjustQty: number; unitCost: number; reason: string; }

export default function InventoryAdjustmentForm() {
  const navigate = useNavigate();
  const { items, locations, accounts } = useFormOptions();

  const [form, setForm] = useState({
    adjustmentDate: new Date().toISOString().split('T')[0],
    adjustmentType: 'quantity',
    reason: '',
    accountId: '',
    memo: '',
  });
  const [lines, setLines] = useState<AdjLine[]>([{ itemId: '', locationId: '', adjustQty: 0, unitCost: 0, reason: '' }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addLine = () => setLines(p => [...p, { itemId: '', locationId: '', adjustQty: 0, unitCost: 0, reason: '' }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof AdjLine, v: any) =>
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find((x: any) => x.id === v); if (it) u.unitCost = it.purchase_price || 0; }
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/inventory/adjustments', data),
    onSuccess: () => { toast.success('Inventory adjustment saved'); navigate('/inventory/adjustments'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some(l => !l.itemId)) { toast.error('All lines must have an item'); return; }
    if (lines.some(l => !l.locationId)) { toast.error('All lines must have a location'); return; }
    mutation.mutate({ ...form, lines });
  };

  const REASONS = ['Cycle Count', 'Physical Count', 'Damage', 'Expiry', 'Theft / Loss', 'System Correction', 'Other'];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Inventory', path: '/inventory/adjustments' }, { label: 'Inventory Adjustment' }]}
        title="Inventory Adjustment"
        subtitle="Adjust stock quantity or value for discrepancies"
        actions={
          <>
            <button type="button" onClick={() => navigate('/inventory/adjustments')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="adj-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Post Adjustment
            </button>
          </>
        }
      />
      <form id="adj-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Adjustment Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Adjustment Date *</label>
              <input type="date" className="erp-input" value={form.adjustmentDate} onChange={e => set('adjustmentDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Adjustment Type</label>
              <select className="erp-select" value={form.adjustmentType} onChange={e => set('adjustmentType', e.target.value)}>
                <option value="quantity">Quantity Adjustment</option>
                <option value="value">Value Adjustment</option>
                <option value="both">Quantity & Value</option>
              </select>
            </div>
            <div>
              <label className="erp-label">Adjustment Account</label>
              <select className="erp-select" value={form.accountId} onChange={e => set('accountId', e.target.value)}>
                <option value="">-- Select Account --</option>
                {accounts.filter((a: any) => a.type === 'expense' || a.type === 'inventory').map((a: any) =>
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="erp-label">Memo</label>
              <textarea className="erp-textarea" rows={2} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Reason for adjustment" />
            </div>
          </div>
        </div>
        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Adjustment Lines</span>
            <button type="button" onClick={addLine} className="btn-secondary btn-sm"><Plus size={12} /> Add Item</button>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>Item *</th><th>Location *</th><th className="text-right">Adjust Qty (+/-)</th><th className="text-right">Unit Cost</th><th className="text-right">Value Impact</th><th>Reason</th><th className="w-10"></th></tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="erp-select text-xs" value={line.itemId} onChange={e => setLine(i, 'itemId', e.target.value)} required>
                      <option value="">-- Item --</option>
                      {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="erp-select text-xs" value={line.locationId} onChange={e => setLine(i, 'locationId', e.target.value)} required>
                      <option value="">-- Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.001" className={`erp-input text-right text-xs w-24 ${Number(line.adjustQty) < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                      value={line.adjustQty} onChange={e => setLine(i, 'adjustQty', parseFloat(e.target.value) || 0)}
                      placeholder="e.g. -5 or +10" />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.01" className="erp-input text-right text-xs w-28"
                      value={line.unitCost} onChange={e => setLine(i, 'unitCost', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className={`text-right font-medium text-sm ${Number(line.adjustQty) * Number(line.unitCost) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(Number(line.adjustQty) * Number(line.unitCost))}
                  </td>
                  <td>
                    <select className="erp-select text-xs" value={line.reason} onChange={e => setLine(i, 'reason', e.target.value)}>
                      <option value="">-- Reason --</option>
                      {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
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
