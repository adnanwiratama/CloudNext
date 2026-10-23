import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

type PurchaseReportType = 'po-by-customer' | 'po-by-items' | 'purchases-by-customer' | 'purchases-by-items' | 'purchases-by-rep';

const REPORT_TITLES: Record<PurchaseReportType, string> = {
  'po-by-customer': 'Purchase Order by Vendor',
  'po-by-items': 'Purchase Order by Items',
  'purchases-by-customer': 'Purchases by Vendor',
  'purchases-by-items': 'Purchases by Items',
  'purchases-by-rep': 'Purchases by Purchases Rep',
};

export default function PurchaseReports({ type }: { type: PurchaseReportType }) {
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['purchase-report', type, filters],
    queryFn: () => api.get(`/api/reports/${type}`, { params: filters }).then(r => r.data.data || []),
  });

  const title = REPORT_TITLES[type];
  const isByVendor = type === 'po-by-customer' || type === 'purchases-by-customer';
  const isByItem = type === 'po-by-items' || type === 'purchases-by-items';
  const isByRep = type === 'purchases-by-rep';
  const rows: any[] = data || [];
  const total = rows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);

  const buildModel = (): ReportModel | null => {
    if (!rows.length) return null;
    let columns: ReportModel['columns'];
    let modelRows: ReportModel['rows'];
    if (isByVendor) {
      columns = [{ label: '#' }, { label: 'Vendor' }, { label: 'Transactions', align: 'right' }, { label: 'Total Amount', align: 'right' }];
      modelRows = rows.map((r, i) => ({ cells: [i + 1, r.vendor_name || r.name, r.transaction_count || 0, formatCurrency(r.total_amount)] }));
      modelRows.push({ cells: ['', '', 'Total', formatCurrency(total)], bold: true });
    } else if (isByItem) {
      columns = [{ label: '#' }, { label: 'Item Code' }, { label: 'Item Name' }, { label: 'Qty Purchased', align: 'right' }, { label: 'Total Amount', align: 'right' }];
      modelRows = rows.map((r, i) => ({ cells: [i + 1, r.item_code, r.item_name || r.name, r.total_qty || 0, formatCurrency(r.total_amount)] }));
      modelRows.push({ cells: ['', '', '', 'Total', formatCurrency(total)], bold: true });
    } else {
      columns = [{ label: '#' }, { label: 'Rep' }, { label: 'Orders', align: 'right' }, { label: 'Total Amount', align: 'right' }];
      modelRows = rows.map((r, i) => ({ cells: [i + 1, r.rep || '—', r.order_count || 0, formatCurrency(r.total_amount)] }));
      modelRows.push({ cells: ['', '', 'Total', formatCurrency(total)], bold: true });
    }
    return { title, subtitle: `${filters.startDate} to ${filters.endDate}`, columns, rows: modelRows };
  };

  const filterBar = (
    <>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Start Date</span>
        <input type="date" className={reportFilterInput} value={filters.startDate} onChange={e => setF('startDate', e.target.value)} /></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>End Date</span>
        <input type="date" className={reportFilterInput} value={filters.endDate} onChange={e => setF('endDate', e.target.value)} /></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  const colCount = isByItem ? 5 : 4;

  return (
    <ReportShell title={title} buildModel={buildModel} exportDisabled={!rows.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">#</th>
                {isByVendor && <><th className="px-3 py-1.5 text-left">Vendor</th><th className="px-3 py-1.5 text-right">Transactions</th></>}
                {isByItem && <><th className="px-3 py-1.5 text-left">Item Code</th><th className="px-3 py-1.5 text-left">Item Name</th><th className="px-3 py-1.5 text-right">Qty Purchased</th></>}
                {isByRep && <><th className="px-3 py-1.5 text-left">Rep</th><th className="px-3 py-1.5 text-right">Orders</th></>}
                <th className="px-3 py-1.5 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={colCount} className="text-center py-10 text-slate-400">No data found.</td></tr>
              ) : rows.map((row: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                  {isByVendor && <><td className="px-3 py-1.5 font-medium text-blue-600">{row.vendor_name || row.name}</td><td className="px-3 py-1.5 text-right">{row.transaction_count || 0}</td></>}
                  {isByItem && <><td className="px-3 py-1.5 font-mono text-xs text-slate-500">{row.item_code}</td><td className="px-3 py-1.5 font-medium text-slate-700">{row.item_name || row.name}</td><td className="px-3 py-1.5 text-right">{row.total_qty || 0}</td></>}
                  {isByRep && <><td className="px-3 py-1.5 font-medium text-slate-700">{row.rep || '—'}</td><td className="px-3 py-1.5 text-right">{row.order_count || 0}</td></>}
                  <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(row.total_amount)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                  <td colSpan={colCount - 1} className="px-3 py-2 text-right text-slate-900">Total</td>
                  <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </ReportShell>
  );
}
