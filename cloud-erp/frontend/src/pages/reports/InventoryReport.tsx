import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber } from '../../utils/format';

export default function InventoryReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-report'],
    queryFn: () => api.get('/api/reports/inventory').then(r => r.data.data),
  });

  const totalValue = (data || []).reduce((s: number, r: any) => s + parseFloat(r.total_value || 0), 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports' }, { label: 'Inventory Valuation' }]}
        title="Inventory Valuation Report"
        subtitle={`Total Value: ${formatCurrency(totalValue)}`}
        actions={<>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">Refresh</button>
          <button className="btn-secondary btn-sm"><Download size={13} /> Export</button>
        </>}
      />
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Location</th>
                <th className="text-right">On Hand</th>
                <th className="text-right">Committed</th>
                <th className="text-right">Available</th>
                <th className="text-right">Avg Cost</th>
                <th className="text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((row: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono text-blue-600 font-medium">{row.item_code}</td>
                  <td className="font-medium">{row.item_name}</td>
                  <td><span className="text-xs text-slate-500 capitalize">{row.item_type?.replace(/_/g,' ')}</span></td>
                  <td>{row.category_name || '-'}</td>
                  <td>{row.location_name || '-'}</td>
                  <td className="text-right font-medium">{formatNumber(row.qty_on_hand, 2)}</td>
                  <td className="text-right text-amber-600">{formatNumber(row.qty_committed, 2)}</td>
                  <td className="text-right text-emerald-600">{formatNumber(row.available_qty, 2)}</td>
                  <td className="text-right">{formatCurrency(row.avg_cost)}</td>
                  <td className="text-right font-semibold">{formatCurrency(row.total_value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold">
                <td colSpan={10} className="px-3 py-2 text-right text-sm">Total Inventory Value</td>
                <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
