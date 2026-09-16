import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

interface TOLine { itemId: string; qty: number; requestedDate: string; }

export default function TransferOrderForm() {
  const navigate = useNavigate();
  const { items, locations } = useFormOptions();

  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    fromLocationId: '',
    toLocationId: '',
    expectedDate: '',
    priority: 'normal',
    memo: '',
  });
  const [lines, setLines] = useState<TOLine[]>([{ itemId: '', qty: 1, requestedDate: '' }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addLine = () => setLines(p => [...p, { itemId: '', qty: 1, requestedDate: '' }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof TOLine, v: any) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/inventory/transfer-orders', data),
    onSuccess: () => { toast.success('Transfer order created'); navigate('/inventory/transfer-orders'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromLocationId || !form.toLocationId) { toast.error('Both locations are required'); return; }
    mutation.mutate({ ...form, lines });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Inventory', path: '/inventory/transfer-orders' }, { label: 'Transfer Order' }]}
        title="Transfer Order"
        subtitle="Create a request to move inventory between locations"
        actions={
          <>
            <button type="button" onClick={() => navigate('/inventory/transfer-orders')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="to-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Order
            </button>
          </>
        }
      />
      <form id="to-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Transfer Order Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Order Date *</label>
              <input type="date" className="erp-input" value={form.orderDate} onChange={e => set('orderDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Expected Transfer Date</label>
              <input type="date" className="erp-input" value={form.expectedDate} onChange={e => set('expectedDate', e.target.value)} />
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
              <label className="erp-label">From Location *</label>
              <select className="erp-select" value={form.fromLocationId} onChange={e => set('fromLocationId', e.target.value)} required>
                <option value="">-- Select Location --</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">To Location *</label>
              <select className="erp-select" value={form.toLocationId} onChange={e => set('toLocationId', e.target.value)} required>
                <option value="">-- Select Location --</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Memo</label>
              <input type="text" className="erp-input" value={form.memo} onChange={e => set('memo', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Items Requested</span>
            <button type="button" onClick={addLine} className="btn-secondary btn-sm"><Plus size={12} /> Add Item</button>
          </div>
          <table className="erp-table">
            <thead><tr><th>Item *</th><th className="text-right">Qty *</th><th>Requested Date</th><th className="w-10"></th></tr></thead>
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
                  <td><input type="date" className="erp-input text-xs w-36" value={line.requestedDate} onChange={e => setLine(i, 'requestedDate', e.target.value)} /></td>
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
