import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

export default function StockOnhandReport() {
  const { locations } = useFormOptions();
  const [filters, setFilters] = useState({ locationId: '', itemCode: '', asOfDate: new Date().toISOString().split('T')[0] });
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-onhand', filters],
    queryFn: () => api.get('/api/reports/stock-onhand', { params: filters }).then(r => r.data.data || []),
  });

  const rows: any[] = data || [];
  const totalValue = rows.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);

  const buildModel = (): ReportModel | null => {
    if (!rows.length) return null;
    return {
      title: 'Stock On Hand',
      subtitle: `As of ${filters.asOfDate}`,
      columns: [
        { label: 'Item Code' }, { label: 'Item Name' }, { label: 'Location' },
        { label: 'On Hand', align: 'right' }, { label: 'Available', align: 'right' }, { label: 'Committed', align: 'right' },
        { label: 'On Order', align: 'right' }, { label: 'Unit Cost', align: 'right' }, { label: 'Total Value', align: 'right' },
      ],
      rows: [
        ...rows.map(r => ({ cells: [r.item_code, r.item_name, r.location_name, formatNumber(r.qty_on_hand), formatNumber(r.qty_available), formatNumber(r.qty_committed || 0), formatNumber(r.qty_on_order || 0), formatCurrency(r.unit_cost || 0), formatCurrency(r.total_value || 0)] })),
        { cells: ['Total Inventory Value', '', '', '', '', '', '', '', formatCurrency(totalValue)], bold: true },
      ],
    };
  };

  const filterBar = (
    <>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>As Of</span>
        <input type="date" className={reportFilterInput} value={filters.asOfDate} onChange={e => setF('asOfDate', e.target.value)} /></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Location</span>
        <select className={reportFilterInput} value={filters.locationId} onChange={e => setF('locationId', e.target.value)}>
          <option value="">All Locations</option>
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Item</span>
        <input type="text" className={reportFilterInput} value={filters.itemCode} onChange={e => setF('itemCode', e.target.value)} placeholder="Code / name" /></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  return (
    <ReportShell title="Stock On Hand" subtitle="Available and on-hand stock by location" buildModel={buildModel} exportDisabled={!rows.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Item Code</th><th className="px-3 py-1.5 text-left">Item Name</th><th className="px-3 py-1.5 text-left">Location</th>
                <th className="px-3 py-1.5 text-right">On Hand</th><th className="px-3 py-1.5 text-right">Available</th><th className="px-3 py-1.5 text-right">Committed</th>
                <th className="px-3 py-1.5 text-right">On Order</th><th className="px-3 py-1.5 text-right">Unit Cost</th><th className="px-3 py-1.5 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">No stock data found.</td></tr>
                : rows.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{row.item_code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{row.item_name}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.location_name}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatNumber(row.qty_on_hand)}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${Number(row.qty_available) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatNumber(row.qty_available)}</td>
                    <td className="px-3 py-1.5 text-right text-amber-600">{formatNumber(row.qty_committed || 0)}</td>
                    <td className="px-3 py-1.5 text-right text-blue-500">{formatNumber(row.qty_on_order || 0)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(row.unit_cost || 0)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(row.total_value || 0)}</td>
                  </tr>
                ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                  <td colSpan={8} className="px-3 py-2 text-right text-slate-900">Total Inventory Value</td>
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
