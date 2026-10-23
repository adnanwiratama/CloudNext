import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatNumber, formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

export default function InventoryActivityReport() {
  const { items, locations } = useFormOptions();
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    itemId: '',
    locationId: '',
    txnType: '',
  });
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-activity', filters],
    queryFn: () => api.get('/api/reports/inventory-activity', { params: filters }).then(r => r.data.data || []),
  });

  const rows: any[] = data || [];

  const buildModel = (): ReportModel | null => {
    if (!rows.length) return null;
    return {
      title: 'Inventory Activity Detail',
      subtitle: `${filters.startDate} to ${filters.endDate}`,
      columns: [
        { label: 'Date' }, { label: 'Item Code' }, { label: 'Item Name' }, { label: 'Transaction Type' },
        { label: 'Document #' }, { label: 'Location' },
        { label: 'Qty In', align: 'right' }, { label: 'Qty Out', align: 'right' }, { label: 'Net', align: 'right' },
      ],
      rows: rows.map(r => ({
        cells: [
          formatDate(r.transaction_date), r.item_code, r.item_name, r.transaction_type, r.document_number, r.location_name,
          r.qty_in > 0 ? formatNumber(r.qty_in) : '', r.qty_out > 0 ? formatNumber(r.qty_out) : '',
          formatNumber(Number(r.qty_in) - Number(r.qty_out)),
        ],
      })),
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
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Type</span>
        <select className={reportFilterInput} value={filters.txnType} onChange={e => setF('txnType', e.target.value)}>
          <option value="">All Types</option>
          <option value="receipt">Items Receipt (PO)</option>
          <option value="fulfillment">Item Fulfillment (SO)</option>
          <option value="adjustment">Inventory Adjustment</option>
          <option value="transfer">Transfer</option>
          <option value="assembly">Assembly Build</option>
          <option value="return">Return</option>
        </select></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  return (
    <ReportShell title="Inventory Activity Detail" subtitle="Detailed stock in and out movements by item" buildModel={buildModel} exportDisabled={!rows.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Date</th><th className="px-3 py-1.5 text-left">Item Code</th><th className="px-3 py-1.5 text-left">Item Name</th><th className="px-3 py-1.5 text-left">Transaction Type</th>
                <th className="px-3 py-1.5 text-left">Document #</th><th className="px-3 py-1.5 text-left">Location</th>
                <th className="px-3 py-1.5 text-right">Qty In</th><th className="px-3 py-1.5 text-right">Qty Out</th><th className="px-3 py-1.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">No activity found.</td></tr>
                : rows.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-xs">{formatDate(row.transaction_date)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{row.item_code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{row.item_name}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500 capitalize">{row.transaction_type}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{row.document_number}</td>
                    <td className="px-3 py-1.5 text-slate-500 text-xs">{row.location_name}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{row.qty_in > 0 ? formatNumber(row.qty_in) : ''}</td>
                    <td className="px-3 py-1.5 text-right text-red-600 font-medium">{row.qty_out > 0 ? formatNumber(row.qty_out) : ''}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${Number(row.qty_in) - Number(row.qty_out) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatNumber(Number(row.qty_in) - Number(row.qty_out))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}
