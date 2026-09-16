import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

interface Component { itemId: string; quantity: number; scrapPercent: number; supplyType: string; notes: string; }
const emptyComp = (): Component => ({ itemId: '', quantity: 1, scrapPercent: 0, supplyType: 'pull', notes: '' });

export default function BOMForm() {
  const navigate = useNavigate();
  const { items } = useFormOptions();

  const [form, setForm] = useState({
    name: '', finishedGoodId: '', quantity: 1, revision: '1',
    effectiveDate: new Date().toISOString().split('T')[0],
    yieldPercent: 100, status: 'active', description: '',
  });
  const [components, setComponents] = useState<Component[]>([emptyComp()]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const updateComp = useCallback((idx: number, key: string, value: any) => {
    setComponents(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: value }; return next; });
  }, []);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/manufacturing/boms', data),
    onSuccess: (res) => { toast.success('BOM created'); navigate(`/manufacturing/boms/${res.data.data.id}`); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create BOM'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.finishedGoodId) { toast.error('Finished good is required'); return; }
    if (!form.name) { toast.error('BOM name is required'); return; }
    mutation.mutate({
      ...form,
      components: components.filter(c => c.itemId).map((c, idx) => ({ ...c, sequence: (idx + 1) * 10 })),
    });
  };

  const finishedGoods = items.filter((i: any) => ['finished_good', 'assembly', 'inventory'].includes(i.type));
  const rawMaterials = items.filter((i: any) => ['raw_material', 'inventory', 'non_inventory', 'service'].includes(i.type));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Bill of Materials', path: '/manufacturing/boms' }, { label: 'New BOM' }]}
        title="New Bill of Materials"
        actions={
          <>
            <button type="button" onClick={() => navigate('/manufacturing/boms')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="bom-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save BOM
            </button>
          </>
        }
      />
      <form id="bom-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">BOM Header</div>
          <div className="form-grid-3">
            <div className="col-span-2">
              <label className="erp-label">BOM Name *</label>
              <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Produk A - Standard BOM" />
            </div>
            <div>
              <label className="erp-label">Revision</label>
              <input type="text" className="erp-input" value={form.revision} onChange={e => set('revision', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="erp-label">Finished Good / Assembly *</label>
              <select className="erp-select" value={form.finishedGoodId} onChange={e => set('finishedGoodId', e.target.value)} required>
                <option value="">-- Select Finished Good --</option>
                {finishedGoods.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Output Qty</label>
              <input type="number" min="0.01" step="0.01" className="erp-input" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Effective Date</label>
              <input type="date" className="erp-input" value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Yield %</label>
              <input type="number" min="1" max="100" step="0.1" className="erp-input" value={form.yieldPercent} onChange={e => set('yieldPercent', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Status</label>
              <select className="erp-select" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="erp-label">Description</label>
              <textarea className="erp-textarea" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Components / Materials</span>
            <button type="button" onClick={() => setComponents(c => [...c, emptyComp()])} className="btn-secondary btn-sm"><Plus size={12} /> Add Component</button>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-8">Seq</th>
                  <th className="w-64">Component Item *</th>
                  <th className="w-24 text-right">Qty</th>
                  <th className="w-24 text-right">Scrap %</th>
                  <th className="w-32">Supply Type</th>
                  <th>Notes</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {components.map((comp, idx) => (
                  <tr key={idx}>
                    <td className="text-slate-400 text-center text-xs">{(idx + 1) * 10}</td>
                    <td>
                      <select className="erp-select text-xs" value={comp.itemId} onChange={e => updateComp(idx, 'itemId', e.target.value)}>
                        <option value="">-- Select Component --</option>
                        {rawMaterials.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                      </select>
                    </td>
                    <td><input type="number" min="0" step="0.001" className="erp-input text-right text-xs" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                    <td><input type="number" min="0" max="100" step="0.1" className="erp-input text-right text-xs" value={comp.scrapPercent} onChange={e => updateComp(idx, 'scrapPercent', e.target.value)} /></td>
                    <td>
                      <select className="erp-select text-xs" value={comp.supplyType} onChange={e => updateComp(idx, 'supplyType', e.target.value)}>
                        <option value="pull">Pull</option>
                        <option value="push">Push</option>
                        <option value="manual">Manual</option>
                      </select>
                    </td>
                    <td><input className="erp-input text-xs" value={comp.notes} onChange={e => updateComp(idx, 'notes', e.target.value)} /></td>
                    <td>
                      <button type="button" onClick={() => setComponents(c => c.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
  );
}
