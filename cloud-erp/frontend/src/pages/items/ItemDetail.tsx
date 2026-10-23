import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Package, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatNumber, formatDate, formatStatus } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import toast from 'react-hot-toast';

type TabKey = 'purchasing' | 'manufacturing' | 'sales' | 'accounting' | 'related';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'purchasing', label: 'Purchasing / Inventory' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'sales', label: 'Sales / Pricing' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'related', label: 'Related Records' },
];

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();
  const [tab, setTab] = useState<TabKey>('purchasing');

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get(`/api/items/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  // Related transaction records for this item
  const [relatedFilter, setRelatedFilter] = useState('');
  const [relatedPage, setRelatedPage] = useState(1);
  const RELATED_PER_PAGE = 50;
  const { data: relatedRecords = [], isLoading: loadingRelated } = useQuery({
    queryKey: ['item-related', id],
    queryFn: () => api.get(`/api/items/${id}/related`).then(r => r.data.data || []),
    enabled: !!id && tab === 'related',
    staleTime: 0,
  });
  const relatedTypes: string[] = Array.from(new Set((relatedRecords as any[]).map((r: any) => r.type))).sort();
  const filteredRelated = (relatedRecords as any[]).filter((r: any) => !relatedFilter || r.type === relatedFilter);
  const relatedTotalPages = Math.max(1, Math.ceil(filteredRelated.length / RELATED_PER_PAGE));
  const pagedRelated = filteredRelated.slice((relatedPage - 1) * RELATED_PER_PAGE, relatedPage * RELATED_PER_PAGE);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!item) return <div className="text-center py-12 text-slate-500">Item not found</div>;

  const inv = item.inventory || {};
  const locationInventory: any[] = item.locationInventory || [];
  const priceLevels: any[] = item.priceLevels || [];
  const boms: any[] = item.boms || [];
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Package size={15} /></div>
              <span className="text-xl font-bold text-slate-800">{item.name}</span>
              <span className="text-xl font-semibold text-slate-500">{item.item_code}</span>
              <span className={item.is_active ? 'badge badge-green' : 'badge badge-gray'}>{item.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/items')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/items')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            <ArrowLeft size={12} /> Back
          </button>
          {canEdit && (
            <EditTransactionButton permKey="item" to={`/items/${id}/edit`} />
          )}
          {canDelete && (
            <button onClick={() => {
              if (confirm(`Delete item "${item.name}"?`)) {
                api.delete(`/api/items/${id}`)
                  .then(() => { toast.success('Item deleted'); navigate('/items'); })
                  .catch((e: any) => toast.error(e.response?.data?.error || 'Cannot delete item'));
              }
            }} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 bg-white text-sm text-red-600 rounded hover:bg-red-50">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {/* ── Primary Information ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">Primary Information</div>
          <div className="grid grid-cols-4 gap-4">
            <div><label className={lbl}>Item Code</label><div className="text-sm font-mono text-blue-600">{item.item_code}</div></div>
            <div><label className={lbl}>SKU</label><div className="text-sm">{item.sku || '-'}</div></div>
            <div><label className={lbl}>Type</label><div className="text-sm capitalize">{item.type?.replace(/_/g, ' ')}</div></div>
            <div><label className={lbl}>Category</label><div className="text-sm">{item.category_name || '-'}</div></div>
            <div><label className={lbl}>Units Type</label><div className="text-sm">{item.uom_type_name || '-'}</div></div>
            <div><label className={lbl}>Base Unit</label><div className="text-sm">{item.uom_name || '-'}</div></div>
            <div><label className={lbl}>Primary Stock Unit</label><div className="text-sm">{item.stock_uom_name || '-'}</div></div>
            <div><label className={lbl}>Primary Purchase Unit</label><div className="text-sm">{item.purchase_uom_name || '-'}</div></div>
            <div><label className={lbl}>Primary Sale Unit</label><div className="text-sm">{item.sales_uom_name || '-'}</div></div>
            <div className="col-span-4"><label className={lbl}>Description</label><div className="text-sm text-slate-700">{item.description || '-'}</div></div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="flex items-center gap-1 border-b border-slate-200 px-2">
            {TABS.map(t => (
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
                <div className="grid grid-cols-4 gap-4">
                  <div><label className={lbl}>Purchase Price</label><div className="text-sm font-medium">{formatCurrency(item.last_purchase_price)}</div></div>
                  <div><label className={lbl}>Standard Cost</label><div className="text-sm font-medium">{formatCurrency(item.standard_cost)}</div></div>
                  <div><label className={lbl}>Average Cost</label><div className="text-sm font-medium">{formatCurrency(item.average_cost)}</div></div>
                  <div><label className={lbl}>Preferred Vendor</label><div className="text-sm">{item.preferred_vendor_name || '-'}</div></div>
                  <div><label className={lbl}>Reorder Point</label><div className="text-sm">{formatNumber(item.reorder_point)}</div></div>
                  <div><label className={lbl}>Safety Stock</label><div className="text-sm">{formatNumber(item.safety_stock)}</div></div>
                  <div><label className={lbl}>Lead Time</label><div className="text-sm">{item.lead_time_days} days</div></div>
                  <div><label className={lbl}>Valuation</label><div className="text-sm capitalize">{item.valuation_method}</div></div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {(() => {
                    const r = (() => { const x = Number(item.stock_uom_rate || 1); return x > 0 ? x : 1; })();
                    // Header Avg Cost = average of the per-location average costs, expressed per stock unit
                    const locs = (locationInventory || []).filter((l: any) => parseFloat(l.qty_on_hand || 0) > 0);
                    const perLocAvg = locs.map((l: any) => {
                      const qtyBase = parseFloat(l.qty_on_hand || 0);
                      const val = parseFloat(l.total_value ?? (qtyBase * parseFloat(l.avg_cost || 0)));
                      const qtyStock = qtyBase / r;
                      return qtyStock > 0 ? val / qtyStock : 0;
                    });
                    const headerAvg = perLocAvg.length > 0 ? perLocAvg.reduce((s: number, v: number) => s + v, 0) / perLocAvg.length : Number(inv.avgCost || 0) * r;
                    return [
                      { label: 'On Hand', value: formatNumber(inv.onHand / r, 2), color: 'text-slate-800' },
                      { label: 'Committed', value: formatNumber(inv.committed / r, 2), color: 'text-amber-600' },
                      { label: 'Available', value: formatNumber(inv.available / r, 2), color: 'text-emerald-600' },
                      { label: 'On Order', value: formatNumber(inv.onOrder / r, 2), color: 'text-blue-600' },
                      { label: 'In Transit', value: formatNumber(inv.inTransit / r, 2), color: 'text-purple-600' },
                      { label: 'Avg Cost', value: formatCurrency(headerAvg), color: 'text-slate-800' },
                    ];
                  })().map(row => (
                    <div key={row.label} className="border border-slate-200 rounded px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-slate-500">{row.label}</span>
                      <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    Stock by Location
                    {(item.stock_uom_name || item.uom_name) && <span className="ml-2 text-xs font-normal text-slate-500">(in {item.stock_uom_name || item.uom_name})</span>}
                  </div>
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
                          <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 text-sm">No stock recorded</td></tr>
                        ) : locationInventory.map((loc: any, i: number) => {
                          // Balances are stored in the item's BASE unit; display in the Primary Stock Unit
                          const rate = (() => { const r = Number(item.stock_uom_rate || 1); return r > 0 ? r : 1; })();
                          const onHandBase = parseFloat(loc.qty_on_hand || 0);
                          const committedBase = parseFloat(loc.qty_committed || 0);
                          const onHand = onHandBase / rate;
                          const committed = committedBase / rate;
                          const totalValue = parseFloat(loc.total_value ?? (onHandBase * parseFloat(loc.avg_cost || 0)));
                          // Average cost per stock unit = total inventory value / qty in that unit
                          const avgPerStockUnit = onHand > 0 ? totalValue / onHand : parseFloat(loc.avg_cost || 0) * rate;
                          return (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-3 py-2">{loc.location_name || '-'}</td>
                              <td className="px-3 py-2 text-slate-500">{loc.warehouse_name || '-'}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatNumber(onHand, 2)}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{formatNumber(committed, 2)}</td>
                              <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNumber(onHand - committed, 2)}</td>
                              <td className="px-3 py-2 text-slate-500">{item.stock_uom_name || item.uom_name || '-'}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(totalValue)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(avgPerStockUnit)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══ MANUFACTURING ══ */}
            {tab === 'manufacturing' && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-800">Bills of Materials</div>
                {boms.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">No Bill of Materials defined for this item.</p>
                ) : boms.map((bom: any) => (
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
                ))}
              </div>
            )}

            {/* ══ SALES / PRICING ══ */}
            {tab === 'sales' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={lbl}>Base Sale Price</label><div className="text-sm font-medium">{formatCurrency(item.sales_price)}</div></div>
                  <div><label className={lbl}>Tax Code</label><div className="text-sm">{item.tax_code ? `${item.tax_code}${item.tax_rate ? ` (${item.tax_rate}%)` : ''}` : '-'}</div></div>
                  <div><label className={lbl}>Sellable</label><div className="text-sm">{item.is_sellable ? 'Yes' : 'No'}</div></div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">Price Levels</div>
                  <div className="border border-slate-200 rounded overflow-hidden max-w-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Price Level</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceLevels.length === 0 ? (
                          <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400 text-sm">No price levels defined</td></tr>
                        ) : priceLevels.map((p: any) => (
                          <tr key={p.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{p.price_level}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══ ACCOUNTING ══ */}
            {tab === 'accounting' && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-800 mb-1">GL Accounts</div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Income Account', val: item.income_account_code, name: item.income_account_name },
                    { label: 'COGS Account', val: item.cogs_account_code, name: item.cogs_account_name },
                    { label: 'Inventory / Asset Account', val: item.inventory_account_code, name: item.inventory_account_name },
                  ].map(acc => (
                    <div key={acc.label}>
                      <label className={lbl}>{acc.label}</label>
                      <div className="text-sm">{acc.val ? `${acc.val} - ${acc.name}` : '-'}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">These accounts are used for automatic GL posting when transactions reference this item.</p>
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
                      <button onClick={() => setRelatedPage(1)} disabled={relatedPage <= 1} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">«</button>
                      <button onClick={() => setRelatedPage(p => Math.max(1, p - 1))} disabled={relatedPage <= 1} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">‹ Prev</button>
                      <span className="px-2">Page {relatedPage} / {relatedTotalPages}</span>
                      <button onClick={() => setRelatedPage(p => Math.min(relatedTotalPages, p + 1))} disabled={relatedPage >= relatedTotalPages} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">Next ›</button>
                      <button onClick={() => setRelatedPage(relatedTotalPages)} disabled={relatedPage >= relatedTotalPages} className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-slate-50">»</button>
                    </div>
                  </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
