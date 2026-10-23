import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Package } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency, formatNumber, formatDate, formatStatus } from '../../utils/format';
import NumberInput from '../../components/common/NumberInput';
import toast from 'react-hot-toast';

type TabKey = 'purchasing' | 'manufacturing' | 'sales' | 'accounting' | 'related';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'purchasing', label: 'Purchasing / Inventory' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'sales', label: 'Sales / Pricing' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'related', label: 'Related Records' },
];

const PRICE_LEVELS = ['Base Price', 'Alternate Price 1', 'Alternate Price 2', 'Alternate Price 3'];

export default function ItemForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { accounts, vendors, taxCodes } = useFormOptions();

  const [tab, setTab] = useState<TabKey>('purchasing');

  // UOM Types (conversion groups) for the Units Type selector
  const { data: uomTypes = [] } = useQuery({
    queryKey: ['uom-types-options'],
    queryFn: () => api.get('/api/settings/uom-types').then(r => r.data.data || []),
    staleTime: 60000,
  });

  const [form, setForm] = useState({
    itemCode: '', name: '', description: '', type: 'inventory',
    sku: '', barcode: '',
    // units of measure
    uomTypeId: '', stockUomId: '', purchaseUomId: '', salesUomId: '',
    // purchasing / inventory
    purchasePrice: 0, standardCost: 0, preferredVendorId: '',
    reorderPoint: 0, safetyStock: 0, leadTime: 0,
    isPurchased: true, isStockable: true,
    // sales
    salePrice: 0, isSold: true, taxCodeId: '',
    // accounting
    incomeAccountId: '', cogsAccountId: '', inventoryAccountId: '', assetAccountId: '',
    isManufactured: false, isActive: true,
  });

  // Units available for the currently selected UOM Type
  const selectedType = (uomTypes as any[]).find((t: any) => t.id === form.uomTypeId);
  const typeUnits: any[] = selectedType?.units || [];
  const baseUnit = typeUnits.find((u: any) => u.is_base_unit);

  const [priceLevels, setPriceLevels] = useState<{ priceLevel: string; price: number | string }[]>(
    PRICE_LEVELS.map(pl => ({ priceLevel: pl, price: '' }))
  );

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ── Load existing item (edit mode) ──────────────────────────────────────────
  const { data: existing, isLoading: loadingItem } = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get(`/api/items/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  // Primary Stock Unit (name + conversion rate) — balances are stored in the base unit,
  // so dividing by this rate expresses them in the Primary Stock Unit.
  const stockUnit = typeUnits.find((u: any) => u.id === form.stockUomId);
  const stockUnitName = stockUnit?.name || existing?.stock_uom_name || existing?.uom_name || '';
  const stockRate = (() => { const r = Number(stockUnit?.conversion_rate_to_base || 1); return r > 0 ? r : 1; })();

  useEffect(() => {
    if (!existing) return;
    setForm(f => ({
      ...f,
      itemCode: existing.item_code || '', name: existing.name || '', description: existing.description || '',
      type: existing.type || 'inventory', sku: existing.sku || '', barcode: existing.barcode || '',
      uomTypeId: existing.uom_type_id || '', stockUomId: existing.stock_uom_id || '',
      purchaseUomId: existing.purchase_uom_id || '', salesUomId: existing.sales_uom_id || '',
      purchasePrice: existing.last_purchase_price || 0, standardCost: existing.standard_cost || 0,
      preferredVendorId: existing.preferred_vendor_id || '',
      reorderPoint: existing.reorder_point || 0, safetyStock: existing.safety_stock || 0, leadTime: existing.lead_time_days || 0,
      salePrice: existing.sales_price || 0, taxCodeId: existing.tax_code_id || '',
      incomeAccountId: existing.income_account_id || '', cogsAccountId: existing.cogs_account_id || '',
      inventoryAccountId: existing.inventory_account_id || '', assetAccountId: existing.asset_account_id || '',
      isPurchased: existing.is_purchasable !== false, isSold: existing.is_sellable !== false,
      isStockable: existing.is_stockable !== false, isActive: existing.is_active !== false,
    }));
    // hydrate price levels — keep the 4 fixed rows, fill from saved
    const saved: any[] = existing.priceLevels || [];
    setPriceLevels(PRICE_LEVELS.map(pl => {
      const hit = saved.find(s => s.price_level === pl);
      return { priceLevel: pl, price: hit ? Number(hit.price) : '' };
    }));
  }, [existing]);

  // Exclude header/summary accounts from selectable lists
  const notHeader = (a: any) => !String(a.subtype || '').endsWith('_header');
  const incomeAccounts = accounts.filter((a: any) => a.type === 'income' && notHeader(a));
  const cogsAccounts = accounts.filter((a: any) => a.type === 'cost_of_goods' && notHeader(a));
  const inventoryAccounts = accounts.filter((a: any) => a.type === 'asset' && a.subtype === 'inventory');

  const locationInventory: any[] = existing?.locationInventory || [];
  const boms: any[] = existing?.boms || [];

  // Related transaction records for this item (loaded only in edit mode)
  const [relatedFilter, setRelatedFilter] = useState('');
  const [relatedPage, setRelatedPage] = useState(1);
  const RELATED_PER_PAGE = 50;
  const { data: relatedRecords = [], isLoading: loadingRelated } = useQuery({
    queryKey: ['item-related', id],
    queryFn: () => api.get(`/api/items/${id}/related`).then(r => r.data.data || []),
    enabled: isEdit && tab === 'related',
    staleTime: 0,
  });
  const relatedTypes: string[] = Array.from(new Set((relatedRecords as any[]).map((r: any) => r.type))).sort();
  const filteredRelated = (relatedRecords as any[]).filter((r: any) => !relatedFilter || r.type === relatedFilter);
  const relatedTotalPages = Math.max(1, Math.ceil(filteredRelated.length / RELATED_PER_PAGE));
  const pagedRelated = filteredRelated.slice((relatedPage - 1) * RELATED_PER_PAGE, relatedPage * RELATED_PER_PAGE);

  const setLevel = (idx: number, price: number) =>
    setPriceLevels(prev => prev.map((p, i) => i === idx ? { ...p, price } : p));

  const payload = () => ({
    ...form,
    // base UOM follows the selected type's base unit
    baseUomId: baseUnit?.id || null,
    priceLevels: priceLevels
      .filter(p => Number(p.price) > 0)
      .map(p => ({ priceLevel: p.priceLevel, price: Number(p.price), currency: 'IDR' })),
  });

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/items/${id}`, data) : api.post('/api/items', data),
    onSuccess: (res) => {
      toast.success(isEdit ? 'Item updated' : 'Item created');
      navigate(`/items/${isEdit ? id : res.data.data.id}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save item'),
  });

  const handleSave = () => {
    if (!form.itemCode) { toast.error('Item Code is required'); return; }
    if (!form.name) { toast.error('Item name is required'); return; }
    mutation.mutate(payload());
  };

  const sel = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white';
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  if (isEdit && loadingItem) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={28} /></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Package size={15} /></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Item' : 'New Item'}</span>
              {isEdit && existing?.item_code && <span className="text-xl font-semibold text-slate-500">{existing.item_code}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/items')} className="hover:underline">List</button>
              {isEdit && <button onClick={() => navigate(`/items/${id}`)} className="hover:underline">View</button>}
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
          <button onClick={() => navigate('/items')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            <ArrowLeft size={12} /> Cancel
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {/* ── Primary Information (always visible) ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">Primary Information</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Item Code *</label>
              <input className={inp} value={form.itemCode} onChange={e => set('itemCode', e.target.value)} placeholder="e.g. FG-001" disabled={isEdit} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Item Name *</label>
              <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Item Type</label>
              <select className={sel} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="inventory">Inventory Item</option>
                <option value="non_inventory">Non-Inventory</option>
                <option value="service">Service</option>
                <option value="assembly">Assembly / BOM</option>
                <option value="raw_material">Raw Material</option>
                <option value="finished_good">Finished Good</option>
              </select>
            </div>
            <div>
              <label className={lbl}>SKU</label>
              <input className={inp} value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Barcode</label>
              <input className={inp} value={form.barcode} onChange={e => set('barcode', e.target.value)} />
            </div>

            {/* ── Units of Measure ── */}
            <div>
              <label className={lbl}>Units Type</label>
              <select className={sel} value={form.uomTypeId}
                onChange={e => {
                  const typeId = e.target.value;
                  const t = (uomTypes as any[]).find((x: any) => x.id === typeId);
                  const base = (t?.units || []).find((u: any) => u.is_base_unit) || (t?.units || [])[0];
                  const baseId = base?.id || '';
                  // Default all primary units to the base unit of the chosen type
                  setForm(f => ({ ...f, uomTypeId: typeId, stockUomId: baseId, purchaseUomId: baseId, salesUomId: baseId }));
                }}>
                <option value="">-- Select Units Type --</option>
                {(uomTypes as any[]).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="text-2xs text-slate-400 mt-1">From Unit of Measure (UOM Type).</p>
            </div>
            <div>
              <label className={lbl}>Primary Stock Unit *</label>
              <select className={sel} value={form.stockUomId} disabled={!form.uomTypeId} onChange={e => set('stockUomId', e.target.value)}>
                <option value="">--</option>
                {typeUnits.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <p className="text-2xs text-slate-400 mt-1">Default unit shown on item reports.</p>
            </div>
            <div>
              <label className={lbl}>Base Unit</label>
              <input readOnly value={baseUnit?.name || '—'} className={`${inp} bg-slate-50 text-slate-600`} />
            </div>
            <div>
              <label className={lbl}>Primary Purchase Unit *</label>
              <select className={sel} value={form.purchaseUomId} disabled={!form.uomTypeId} onChange={e => set('purchaseUomId', e.target.value)}>
                <option value="">--</option>
                {typeUnits.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <p className="text-2xs text-slate-400 mt-1">Default Unit on all Purchase records.</p>
            </div>
            <div>
              <label className={lbl}>Primary Sale Unit *</label>
              <select className={sel} value={form.salesUomId} disabled={!form.uomTypeId} onChange={e => set('salesUomId', e.target.value)}>
                <option value="">--</option>
                {typeUnits.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <p className="text-2xs text-slate-400 mt-1">Default Unit on all Sales records.</p>
            </div>

            <div className="col-span-3">
              <label className={lbl}>Description</label>
              <textarea rows={2} className={inp} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} /> Active
            </label>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="flex items-center gap-1 border-b border-slate-200 px-2">
            {TABS.filter(t => t.key !== 'related' || isEdit).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* ══ PURCHASING / INVENTORY ══ */}
            {tab === 'purchasing' && (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-3">Purchase &amp; Cost</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl}>Purchase Price</label>
                      <NumberInput className={inp} value={form.purchasePrice} min={0} onChange={v => set('purchasePrice', v)} />
                      <p className="text-2xs text-slate-400 mt-1">Auto-fills unit price on Purchase Orders &amp; Vendor Bills.</p>
                    </div>
                    <div>
                      <label className={lbl}>Standard Cost</label>
                      <NumberInput className={inp} value={form.standardCost} min={0} onChange={v => set('standardCost', v)} />
                    </div>
                    <div>
                      <label className={lbl}>Preferred Vendor</label>
                      <select className={sel} value={form.preferredVendorId} onChange={e => set('preferredVendorId', e.target.value)}>
                        <option value="">-- Select Vendor --</option>
                        {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Reorder Point</label>
                      <NumberInput className={inp} value={form.reorderPoint} min={0} decimals={0} onChange={v => set('reorderPoint', v)} />
                    </div>
                    <div>
                      <label className={lbl}>Safety Stock</label>
                      <NumberInput className={inp} value={form.safetyStock} min={0} decimals={0} onChange={v => set('safetyStock', v)} />
                    </div>
                    <div>
                      <label className={lbl}>Lead Time (days)</label>
                      <NumberInput className={inp} value={form.leadTime} min={0} decimals={0} onChange={v => set('leadTime', v)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-5 mt-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.isPurchased} onChange={e => set('isPurchased', e.target.checked)} /> Purchased from Vendors
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.isStockable} onChange={e => set('isStockable', e.target.checked)} /> Stockable
                    </label>
                  </div>
                </div>

                {/* Stock per location */}
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    Stock by Location
                    {stockUnitName && <span className="ml-2 text-xs font-normal text-slate-500">(in {stockUnitName})</span>}
                  </div>
                  {!isEdit ? (
                    <p className="text-xs text-slate-400 py-4">Stock positions appear here after the item is saved and transactions are recorded.</p>
                  ) : (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Location</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Warehouse</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">On Hand</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Committed</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Available</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">UOM</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Total Value</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Avg Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationInventory.length === 0 ? (
                            <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 text-sm">No stock recorded yet</td></tr>
                          ) : locationInventory.map((loc: any, i: number) => {
                            // Balances are stored in the item's BASE unit; show them in the Primary Stock Unit
                            const onHandBase = parseFloat(loc.qty_on_hand || 0);
                            const committedBase = parseFloat(loc.qty_committed || 0);
                            const onHand = onHandBase / stockRate;
                            const committed = committedBase / stockRate;
                            const totalValue = parseFloat(loc.total_value ?? (onHandBase * parseFloat(loc.avg_cost || 0)));
                            // Average cost per stock unit = total inventory value / qty in that unit
                            const avgPerStockUnit = onHand > 0 ? totalValue / onHand : parseFloat(loc.avg_cost || 0) * stockRate;
                            return (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-3 py-2">{loc.location_name || '-'}</td>
                                <td className="px-3 py-2 text-slate-500">{loc.warehouse_name || '-'}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatNumber(onHand, 2)}</td>
                                <td className="px-3 py-2 text-right text-amber-600">{formatNumber(committed, 2)}</td>
                                <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNumber(onHand - committed, 2)}</td>
                                <td className="px-3 py-2 text-slate-500">{stockUnitName || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(totalValue)}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(avgPerStockUnit)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══ MANUFACTURING ══ */}
            {tab === 'manufacturing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">Bills of Materials</div>
                  {isEdit && (
                    <button onClick={() => navigate(`/manufacturing/boms/new?finishedGoodId=${id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-blue-600 rounded hover:bg-slate-50">
                      <Plus size={13} /> New BOM
                    </button>
                  )}
                </div>
                {!isEdit ? (
                  <p className="text-xs text-slate-400 py-4">Save the item first, then create a Bill of Materials with this item as the finished good.</p>
                ) : boms.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">No Bill of Materials defined for this item.</p>
                ) : (
                  boms.map((bom: any) => (
                    <div key={bom.id} className="border border-slate-200 rounded overflow-hidden">
                      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                        <div className="text-sm">
                          <span className="font-mono text-blue-600">{bom.bom_number}</span>
                          <span className="text-slate-600 ml-2">{bom.name}</span>
                          <span className="text-2xs text-slate-400 ml-2">rev {bom.revision || bom.version} · {bom.status}</span>
                        </div>
                        <button onClick={() => navigate(`/manufacturing/boms/${bom.id}`)} className="text-xs text-blue-600 hover:underline">Open</button>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-white border-b border-slate-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Component</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">UoM</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Scrap %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(bom.components || []).map((c: any) => (
                            <tr key={c.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-500">{c.sequence}</td>
                              <td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{c.item_code}</span> {c.item_name}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(c.quantity, 4)}</td>
                              <td className="px-3 py-2 text-slate-500">{c.uom_code || '-'}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{formatNumber(c.scrap_percent, 2)}%</td>
                            </tr>
                          ))}
                          {(!bom.components || bom.components.length === 0) && (
                            <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 text-sm">No components</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ══ RELATED RECORDS ══ */}
            {tab === 'related' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold text-slate-800">Related Transactions</div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Filter by Transaction</label>
                    <select value={relatedFilter} onChange={e => { setRelatedFilter(e.target.value); setRelatedPage(1); }}
                      className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
                      <option value="">All Transactions</option>
                      {relatedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                {loadingRelated ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
                ) : filteredRelated.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded">
                    No related transactions found for this item.
                  </p>
                ) : (
                  <>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Transaction</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Document #</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Status</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Item Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedRelated.map((r: any, i: number) => (
                          <tr key={`${r.type}-${r.id}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 text-slate-700">{r.type}</td>
                            <td className="px-3 py-1.5"><button onClick={() => navigate(r.path)} className="text-blue-600 hover:underline font-mono">{r.doc_number}</button></td>
                            <td className="px-3 py-1.5 text-slate-500">{r.date ? formatDate(r.date) : '-'}</td>
                            <td className="px-3 py-1.5"><span className="capitalize">{r.status ? formatStatus(r.status) : '-'}</span></td>
                            <td className={`px-3 py-1.5 text-right font-medium ${r.item_qty != null && r.item_qty < 0 ? 'text-red-600' : r.item_qty != null && r.item_qty > 0 ? 'text-emerald-600' : ''}`}>{r.item_qty != null ? formatNumber(r.item_qty, 2) : '-'}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{r.amount != null ? formatCurrency(r.amount) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>Showing {(relatedPage - 1) * RELATED_PER_PAGE + 1}–{Math.min(relatedPage * RELATED_PER_PAGE, filteredRelated.length)} of {filteredRelated.length}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setRelatedPage(1)} disabled={relatedPage <= 1} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">«</button>
                      <button type="button" onClick={() => setRelatedPage(p => Math.max(1, p - 1))} disabled={relatedPage <= 1} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">‹ Prev</button>
                      <span className="px-2">Page {relatedPage} / {relatedTotalPages}</span>
                      <button type="button" onClick={() => setRelatedPage(p => Math.min(relatedTotalPages, p + 1))} disabled={relatedPage >= relatedTotalPages} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">Next ›</button>
                      <button type="button" onClick={() => setRelatedPage(relatedTotalPages)} disabled={relatedPage >= relatedTotalPages} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">»</button>
                    </div>
                  </div>
                  </>
                )}
              </div>
            )}

            {/* ══ SALES / PRICING ══ */}
            {tab === 'sales' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={lbl}>Base Sale Price</label>
                    <NumberInput className={inp} value={form.salePrice} min={0} onChange={v => set('salePrice', v)} />
                    <p className="text-2xs text-slate-400 mt-1">Auto-fills unit price on Sales Orders &amp; Quotations.</p>
                  </div>
                  <div>
                    <label className={lbl}>Tax Code</label>
                    <select className={sel} value={form.taxCodeId} onChange={e => set('taxCodeId', e.target.value)}>
                      <option value="">-- None --</option>
                      {taxCodes.map((t: any) => <option key={t.id} value={t.id}>{t.code} ({t.rate}%)</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                      <input type="checkbox" checked={form.isSold} onChange={e => set('isSold', e.target.checked)} /> Sold to Customers
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">Price Levels</div>
                  <div className="border border-slate-200 rounded overflow-hidden max-w-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Price Level</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Price (IDR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceLevels.map((p, i) => (
                          <tr key={p.priceLevel} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{p.priceLevel}</td>
                            <td className="px-3 py-1.5">
                              <NumberInput value={p.price} min={0} onChange={v => setLevel(i, v)}
                                className="w-full border border-slate-300 rounded text-sm px-2 py-1 text-right focus:outline-none focus:border-blue-400" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-2xs text-slate-400 mt-1">Price levels are available for selection in Sales Orders and Quotations.</p>
                </div>
              </div>
            )}

            {/* ══ ACCOUNTING ══ */}
            {tab === 'accounting' && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-800 mb-1">Accounts</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={lbl}>Income / Revenue Account</label>
                    <select className={sel} value={form.incomeAccountId} onChange={e => set('incomeAccountId', e.target.value)}>
                      <option value="">-- Select Account --</option>
                      {incomeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>COGS Account</label>
                    <select className={sel} value={form.cogsAccountId} onChange={e => set('cogsAccountId', e.target.value)}>
                      <option value="">-- Select Account --</option>
                      {cogsAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Inventory / Asset Account</label>
                    <select className={sel} value={form.inventoryAccountId}
                      onChange={e => setForm(f => ({ ...f, inventoryAccountId: e.target.value, assetAccountId: e.target.value }))}>
                      <option value="">-- Select Account --</option>
                      {inventoryAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500">These accounts drive automatic GL posting: Income on invoicing, COGS on shipment, Inventory/Asset on receipt.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom action bar ── */}
        <div className="flex items-center gap-2 pt-1 pb-4">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
          <button onClick={() => navigate('/items')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            <ArrowLeft size={12} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
