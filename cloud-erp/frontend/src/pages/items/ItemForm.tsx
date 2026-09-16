import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

export default function ItemForm() {
  const navigate = useNavigate();
  const { accounts } = useFormOptions();

  const [form, setForm] = useState({
    itemCode: '', name: '', description: '', type: 'inventory',
    sku: '', barcode: '', weight: '', weightUnit: 'kg',
    salePrice: 0, purchasePrice: 0, standardCost: 0,
    reorderPoint: 0, reorderQty: 0, leadTime: 0,
    incomeAccountId: '', cogsAccountId: '', inventoryAccountId: '',
    isSold: true, isPurchased: true, isManufactured: false,
    isActive: true, notes: '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Filter accounts by type for relevant dropdowns
  const incomeAccounts = accounts.filter((a: any) => a.type === 'revenue');
  const cogsAccounts = accounts.filter((a: any) => ['cogs', 'expense'].includes(a.type));
  const assetAccounts = accounts.filter((a: any) => a.type === 'asset');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/items', data),
    onSuccess: (res) => { toast.success('Item created'); navigate(`/items/${res.data.data.id}`); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create item'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Item name is required'); return; }
    mutation.mutate(form);
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Items', path: '/items' }, { label: 'New Item' }]}
        title="New Item"
        actions={
          <>
            <button type="button" onClick={() => navigate('/items')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="item-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Item
            </button>
          </>
        }
      />
      <form id="item-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Item Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Item Code *</label>
              <input type="text" className="erp-input" value={form.itemCode} onChange={e => set('itemCode', e.target.value)} placeholder="e.g. FG-001" required />
            </div>
            <div className="col-span-2">
              <label className="erp-label">Item Name *</label>
              <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Item Type</label>
              <select className="erp-select" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="inventory">Inventory Item</option>
                <option value="non_inventory">Non-Inventory</option>
                <option value="service">Service</option>
                <option value="assembly">Assembly / BOM</option>
                <option value="raw_material">Raw Material</option>
                <option value="finished_good">Finished Good</option>
              </select>
            </div>
            <div>
              <label className="erp-label">SKU</label>
              <input type="text" className="erp-input" value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Barcode</label>
              <input type="text" className="erp-input" value={form.barcode} onChange={e => set('barcode', e.target.value)} />
            </div>
            <div className="col-span-3">
              <label className="erp-label">Description</label>
              <textarea className="erp-textarea" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="flex items-center gap-4 col-span-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={form.isSold} onChange={e => set('isSold', e.target.checked)} className="rounded" />
                <span>Sold to Customers</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={form.isPurchased} onChange={e => set('isPurchased', e.target.checked)} className="rounded" />
                <span>Purchased from Vendors</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={form.isManufactured} onChange={e => set('isManufactured', e.target.checked)} className="rounded" />
                <span>Manufactured (has BOM)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title">Pricing & Costing</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Sale Price</label>
              <input type="number" min="0" step="0.01" className="erp-input" value={form.salePrice} onChange={e => set('salePrice', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Purchase Price</label>
              <input type="number" min="0" step="0.01" className="erp-input" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Standard Cost</label>
              <input type="number" min="0" step="0.01" className="erp-input" value={form.standardCost} onChange={e => set('standardCost', e.target.value)} />
            </div>
          </div>
        </div>

        {form.type === 'inventory' || form.type === 'raw_material' || form.type === 'finished_good' || form.type === 'assembly' ? (
          <div className="erp-card">
            <div className="form-section-title">Inventory Settings</div>
            <div className="form-grid-3">
              <div>
                <label className="erp-label">Reorder Point</label>
                <input type="number" min="0" step="1" className="erp-input" value={form.reorderPoint} onChange={e => set('reorderPoint', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Reorder Qty</label>
                <input type="number" min="0" step="1" className="erp-input" value={form.reorderQty} onChange={e => set('reorderQty', e.target.value)} />
              </div>
              <div>
                <label className="erp-label">Lead Time (days)</label>
                <input type="number" min="0" step="1" className="erp-input" value={form.leadTime} onChange={e => set('leadTime', e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}

        <div className="erp-card">
          <div className="form-section-title">GL Accounts (for auto-posting)</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Income / Revenue Account</label>
              <select className="erp-select" value={form.incomeAccountId} onChange={e => set('incomeAccountId', e.target.value)}>
                <option value="">-- Select Account --</option>
                {incomeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">COGS Account</label>
              <select className="erp-select" value={form.cogsAccountId} onChange={e => set('cogsAccountId', e.target.value)}>
                <option value="">-- Select Account --</option>
                {cogsAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Inventory Asset Account</label>
              <select className="erp-select" value={form.inventoryAccountId} onChange={e => set('inventoryAccountId', e.target.value)}>
                <option value="">-- Select Account --</option>
                {assetAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className="text-xs text-slate-500">These accounts will be used for automatic GL posting when invoicing or receiving items.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
