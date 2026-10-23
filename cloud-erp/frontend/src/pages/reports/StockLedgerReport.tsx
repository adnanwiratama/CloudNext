import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

export default function StockLedgerReport() {
  const { items, locations } = useFormOptions();
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    itemId: '',
    locationId: '',
  });
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-ledger', filters],
    queryFn: () => api.get('/api/reports/stock-ledger', { params: filters }).then(r => r.data.data || []),
  });

  const groups: any[] = data || [];

  const buildModel = (): ReportModel | null => {
    if (!groups.length) return null;
    const rows: ReportModel['rows'] = [];
    for (const g of groups) {
      rows.push({ cells: [`${g.item_code} — ${g.item_name}`, '', '', '', '', '', '', '', ''], bold: true });
      rows.push({ cells: ['Opening Balance', '', '', '', '', '', formatNumber(g.opening_qty), '', formatCurrency(g.opening_value)], indent: 1 });
      for (const line of (g.lines || [])) {
        rows.push({
          cells: [
            formatDate(line.transaction_date), line.document_number, line.transaction_type, line.location_name,
            line.qty_in > 0 ? formatNumber(line.qty_in) : '', line.qty_out > 0 ? formatNumber(line.qty_out) : '',
            formatNumber(line.balance_qty), formatCurrency(line.unit_cost || 0), formatCurrency(line.balance_value || 0),
          ],
          indent: 1,
        });
      }
    }
    return {
      title: 'Stock Ledger',
      subtitle: `${filters.startDate} to ${filters.endDate}`,
      columns: [
        { label: 'Date' }, { label: 'Document' }, { label: 'Type' }, { label: 'Location' },
        { label: 'In', align: 'right' }, { label: 'Out', align: 'right' }, { label: 'Balance Qty', align: 'right' },
        { label: 'Unit Cost', align: 'right' }, { label: 'Balance Value', align: 'right' },
      ],
      rows,
    };
  };

  const filterBar = (
    <>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Start Date</span>
        <input type="date" className={reportFilterInput} value={filters.startDate} onChange={e => setF('startDate', e.target.value)} /></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>End Date</span>
        <input type="date" className={reportFilterInput} value={filters.endDate} onChange={e => setF('endDate', e.target.value)} /></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Item</span>
        <select className={reportFilterInput} value={filters.itemId} onChange={e => setF('itemId', e.target.value)}>
          <option value="">All Items</option>
          {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
        </select></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Location</span>
        <select className={reportFilterInput} value={filters.locationId} onChange={e => setF('locationId', e.target.value)}>
          <option value="">All Locations</option>
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  return (
    <ReportShell title="Stock Ledger" subtitle="Detailed stock movement with beginning and ending balance" buildModel={buildModel} exportDisabled={!groups.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded shadow-sm py-10 text-center text-slate-400">No stock movements found.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group: any) => (
            <div key={group.item_id} className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-700">{group.item_code} — {group.item_name}</span>
                <div className="flex gap-6 text-sm">
                  <span className="text-slate-500">Opening: <strong>{formatNumber(group.opening_qty)}</strong> | {formatCurrency(group.opening_value)}</span>
                  <span className="text-slate-500">Closing: <strong className="text-blue-600">{formatNumber(group.closing_qty)}</strong> | {formatCurrency(group.closing_value)}</span>
                </div>
              </div>
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-3 py-1.5 text-left">Date</th><th className="px-3 py-1.5 text-left">Document</th><th className="px-3 py-1.5 text-left">Type</th><th className="px-3 py-1.5 text-left">Location</th>
                    <th className="px-3 py-1.5 text-right">In</th><th className="px-3 py-1.5 text-right">Out</th><th className="px-3 py-1.5 text-right">Balance Qty</th><th className="px-3 py-1.5 text-right">Unit Cost</th><th className="px-3 py-1.5 text-right">Balance Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 bg-blue-50/50 text-xs font-medium">
                    <td colSpan={6} className="px-3 py-1.5 text-slate-600">Opening Balance</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatNumber(group.opening_qty)}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(group.opening_value)}</td>
                  </tr>
                  {(group.lines || []).map((line: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-xs">{formatDate(line.transaction_date)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{line.document_number}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-500 capitalize">{line.transaction_type}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{line.location_name}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{line.qty_in > 0 ? formatNumber(line.qty_in) : ''}</td>
                      <td className="px-3 py-1.5 text-right text-red-600 font-medium">{line.qty_out > 0 ? formatNumber(line.qty_out) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{formatNumber(line.balance_qty)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(line.unit_cost || 0)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(line.balance_value || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
