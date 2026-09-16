import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Loader2, Package, Trash2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import toast from 'react-hot-toast';

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();
  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get(`/api/items/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!item) return <div className="text-center py-12 text-slate-500">Item not found</div>;

  const inv = item.inventory || {};

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Items', path: '/items' }, { label: item.item_code }]}
        title={item.name}
        subtitle={`${item.item_code} · ${item.type?.replace(/_/g,' ')}`}
        status={<span className={item.is_active ? 'badge badge-green' : 'badge badge-gray'}>{item.is_active ? 'Active' : 'Inactive'}</span>}
        actions={<>
          <button onClick={() => navigate('/items')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Back</button>
          {canEdit && <button className="btn-secondary btn-sm"><Edit size={13} /> Edit</button>}
          {canDelete && (
            <button className="btn-danger btn-sm" onClick={() => {
              if (confirm(`Delete item "${item.name}"?`)) {
                api.delete(`/api/items/${id}`)
                  .then(() => { toast.success('Item deleted'); navigate('/items'); })
                  .catch((e: any) => toast.error(e.response?.data?.error || 'Cannot delete item'));
              }
            }}><Trash2 size={13} /> Delete</button>
          )}
        </>}
      />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Item Details</div>
            <div className="form-grid-3">
              <div><label className="erp-label">Item Code</label><div className="text-sm font-mono text-blue-600">{item.item_code}</div></div>
              <div><label className="erp-label">SKU</label><div className="text-sm">{item.sku || '-'}</div></div>
              <div><label className="erp-label">Type</label><div className="text-sm capitalize">{item.type?.replace(/_/g,' ')}</div></div>
              <div><label className="erp-label">Category</label><div className="text-sm">{item.category_name || '-'}</div></div>
              <div><label className="erp-label">Brand</label><div className="text-sm">{item.brand || '-'}</div></div>
              <div><label className="erp-label">UOM</label><div className="text-sm">{item.uom_name} ({item.uom_code})</div></div>
              <div><label className="erp-label">Standard Cost</label><div className="text-sm font-medium">{formatCurrency(item.standard_cost)}</div></div>
              <div><label className="erp-label">Average Cost</label><div className="text-sm font-medium">{formatCurrency(item.average_cost)}</div></div>
              <div><label className="erp-label">Sales Price</label><div className="text-sm font-medium">{formatCurrency(item.sales_price)}</div></div>
              <div><label className="erp-label">Tax Code</label><div className="text-sm">{item.tax_code || '-'} {item.tax_rate ? `(${item.tax_rate}%)` : ''}</div></div>
              <div><label className="erp-label">Reorder Point</label><div className="text-sm">{formatNumber(item.reorder_point)}</div></div>
              <div><label className="erp-label">Safety Stock</label><div className="text-sm">{formatNumber(item.safety_stock)}</div></div>
              <div><label className="erp-label">Lead Time</label><div className="text-sm">{item.lead_time_days} days</div></div>
              <div><label className="erp-label">Preferred Vendor</label><div className="text-sm">{item.preferred_vendor_name || '-'}</div></div>
              <div><label className="erp-label">Valuation Method</label><div className="text-sm capitalize">{item.valuation_method}</div></div>
            </div>
            {item.description && (
              <div className="px-4 pb-4">
                <label className="erp-label">Description</label>
                <div className="text-sm text-slate-700">{item.description}</div>
              </div>
            )}
          </div>

          {/* Inventory by Location */}
          <div className="erp-card">
            <div className="form-section-title">Inventory by Location</div>
            <table className="erp-table">
              <thead><tr><th>Location</th><th>Lot/Serial</th><th className="text-right">On Hand</th><th className="text-right">Committed</th><th className="text-right">Available</th><th className="text-right">Avg Cost</th></tr></thead>
              <tbody>
                {(item.locationInventory || []).map((loc: any, i: number) => (
                  <tr key={i}>
                    <td>{loc.location_name || '-'}</td>
                    <td>{loc.lot_number || loc.serial_number || '-'}</td>
                    <td className="text-right font-medium">{formatNumber(loc.qty_on_hand, 2)}</td>
                    <td className="text-right text-amber-600">{formatNumber(loc.qty_committed, 2)}</td>
                    <td className="text-right text-emerald-600">{formatNumber(parseFloat(loc.qty_on_hand) - parseFloat(loc.qty_committed), 2)}</td>
                    <td className="text-right">{formatCurrency(loc.avg_cost)}</td>
                  </tr>
                ))}
                {(!item.locationInventory || item.locationInventory.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-4 text-slate-400 text-sm">No inventory</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {/* Inventory Position */}
          <div className="erp-card">
            <div className="form-section-title">Inventory Position</div>
            <div className="p-4 space-y-2">
              {[
                { label: 'On Hand', value: formatNumber(inv.onHand, 2), color: 'text-slate-800' },
                { label: 'Committed', value: formatNumber(inv.committed, 2), color: 'text-amber-600' },
                { label: 'Available', value: formatNumber(inv.available, 2), color: 'text-emerald-600' },
                { label: 'On Order', value: formatNumber(inv.onOrder, 2), color: 'text-blue-600' },
                { label: 'In Transit', value: formatNumber(inv.inTransit, 2), color: 'text-purple-600' },
                { label: 'WIP', value: formatNumber(inv.wip, 2), color: 'text-orange-600' },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-xs text-slate-500">{row.label}</span>
                  <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <span className="text-xs text-slate-500">Inventory Value</span>
                <span className="text-sm font-bold text-slate-800">{formatCurrency(inv.onHand * inv.avgCost)}</span>
              </div>
            </div>
          </div>

          {/* Accounts */}
          <div className="erp-card">
            <div className="form-section-title">GL Accounts</div>
            <div className="p-4 space-y-2">
              {[
                { label: 'Income Account', val: item.income_account_code, name: item.income_account_name },
                { label: 'COGS Account', val: item.cogs_account_code, name: item.cogs_account_name },
                { label: 'Inventory Account', val: item.inventory_account_code, name: item.inventory_account_name },
              ].map(acc => (
                <div key={acc.label}>
                  <label className="erp-label">{acc.label}</label>
                  <div className="text-xs">{acc.val ? `${acc.val} - ${acc.name}` : '-'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="erp-card">
            <div className="form-section-title">Tracking</div>
            <div className="p-4 space-y-1">
              {[
                { label: 'Lot Tracking', val: item.is_lot_tracked },
                { label: 'Serial Tracking', val: item.is_serial_tracked },
                { label: 'Bin Tracking', val: item.is_bin_tracked },
                { label: 'Expiry Tracking', val: item.is_expiry_tracked },
                { label: 'Purchasable', val: item.is_purchasable },
                { label: 'Sellable', val: item.is_sellable },
                { label: 'Stockable', val: item.is_stockable },
              ].map(t => (
                <div key={t.label} className="flex justify-between py-1">
                  <span className="text-xs text-slate-500">{t.label}</span>
                  <span className={t.val ? 'badge badge-green text-2xs' : 'badge badge-gray text-2xs'}>{t.val ? 'Yes' : 'No'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
