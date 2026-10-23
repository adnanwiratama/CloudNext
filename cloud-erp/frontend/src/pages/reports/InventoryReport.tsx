import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/format';
import ReportShell from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

export default function InventoryReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-report'],
    queryFn: () => api.get('/api/reports/inventory').then(r => r.data.data),
  });

  const rows: any[] = data || [];
  const totalValue = rows.reduce((s: number, r: any) => s + parseFloat(r.total_value || 0), 0);

  const buildModel = (): ReportModel | null => {
    if (!rows.length) return null;
    return {
      title: 'Inventory Valuation Report',
      subtitle: `Total Value: ${formatCurrency(totalValue)}`,
      columns: [
        { label: 'Item Code' }, { label: 'Item Name' }, { label: 'Type' }, { label: 'Category' }, { label: 'Location' },
        { label: 'On Hand', align: 'right' }, { label: 'Committed', align: 'right' }, { label: 'Available', align: 'right' },
        { label: 'Avg Cost', align: 'right' }, { label: 'Total Value', align: 'right' },
      ],
      rows: [
        ...rows.map(r => ({ cells: [r.item_code, r.item_name, (r.item_type || '').replace(/_/g, ' '), r.category_name || '-', r.location_name || '-', formatNumber(r.qty_on_hand, 2), formatNumber(r.qty_committed, 2), formatNumber(r.available_qty, 2), formatCurrency(r.avg_cost), formatCurrency(r.total_value)] })),
        { cells: ['Total Inventory Value', '', '', '', '', '', '', '', '', formatCurrency(totalValue)], bold: true },
      ],
    };
  };

  const filterBar = (
    <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
  );

  return (
    <ReportShell title="Inventory Valuation Report" subtitle={`Total Value: ${formatCurrency(totalValue)}`} buildModel={buildModel} exportDisabled={!rows.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Item Code</th><th className="px-3 py-1.5 text-left">Item Name</th><th className="px-3 py-1.5 text-left">Type</th><th className="px-3 py-1.5 text-left">Category</th><th className="px-3 py-1.5 text-left">Location</th>
                <th className="px-3 py-1.5 text-right">On Hand</th><th className="px-3 py-1.5 text-right">Committed</th><th className="px-3 py-1.5 text-right">Available</th><th className="px-3 py-1.5 text-right">Avg Cost</th><th className="px-3 py-1.5 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={10} className="text-center py-10 text-slate-400">No inventory data found.</td></tr>
                : rows.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600 font-medium">{row.item_code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{row.item_name}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500 capitalize">{row.item_type?.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.category_name || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.location_name || '-'}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatNumber(row.qty_on_hand, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-amber-600">{formatNumber(row.qty_committed, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600">{formatNumber(row.available_qty, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(row.avg_cost)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(row.total_value)}</td>
                  </tr>
                ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                  <td colSpan={9} className="px-3 py-2 text-right text-slate-900">Total Inventory Value</td>
                  <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(totalValue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </ReportShell>
  );
}
