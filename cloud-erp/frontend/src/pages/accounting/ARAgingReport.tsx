import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

const money = (v: number) => formatCurrency(v || 0);

// AR Aging — Summary (per-customer matrix) by default; Detail (per-invoice) when detail=true.
export default function ARAgingReport({ detail = false }: { detail?: boolean }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ar-aging', asOf],
    queryFn: () => api.get('/api/accounting/reports/ar-aging', { params: { asOfDate: asOf } }).then(r => r.data.data),
  });

  const summary: any[] = data?.summary || [];
  const lines: any[] = data?.lines || [];
  const buckets = data?.buckets || {};
  const title = detail ? 'A/R Aging Detail' : 'A/R Aging Summary';

  const buildModel = (): ReportModel | null => {
    if (detail) {
      if (!lines.length) return null;
      return {
        title, subtitle: `As of ${asOf}`,
        columns: [
          { label: 'Invoice #' }, { label: 'Customer' }, { label: 'Invoice Date' }, { label: 'Due Date' },
          { label: 'Amount Due', align: 'right' }, { label: 'Days Overdue', align: 'right' }, { label: 'Bucket' },
        ],
        rows: lines.map(r => ({ cells: [r.invoice_number, r.customer_name, formatDate(r.invoice_date), formatDate(r.due_date), money(r.amount_due), parseInt(r.days_overdue) > 0 ? `+${r.days_overdue}` : 'Current', r.bucket] })),
      };
    }
    if (!summary.length) return null;
    return {
      title, subtitle: `As of ${asOf}`,
      columns: [
        { label: 'Customer' }, { label: 'Current', align: 'right' }, { label: '1-30', align: 'right' },
        { label: '31-60', align: 'right' }, { label: '61-90', align: 'right' }, { label: '90+', align: 'right' }, { label: 'Total', align: 'right' },
      ],
      rows: [
        ...summary.map(r => ({ cells: [r.entity_name, money(r.current), money(r.days_1_30), money(r.days_31_60), money(r.days_61_90), money(r.over_90), money(r.total)] })),
        { cells: ['Total', money(buckets.current), money(buckets.days_1_30), money(buckets.days_31_60), money(buckets.days_61_90), money(buckets.over_90), money(buckets.total)], bold: true },
      ],
    };
  };

  const filterBar = (
    <>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>As Of</span>
        <input type="date" className={reportFilterInput} value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  return (
    <ReportShell title={title} subtitle={`Open customer balances by aging bucket · As of ${asOf}`} buildModel={buildModel} exportDisabled={detail ? !lines.length : !summary.length} filterBar={filterBar}>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : detail ? (
        /* ── Detail: per-invoice ── */
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Invoice #</th><th className="px-3 py-1.5 text-left">Customer</th><th className="px-3 py-1.5 text-left">Invoice Date</th><th className="px-3 py-1.5 text-left">Due Date</th>
                <th className="px-3 py-1.5 text-right">Amount Due</th><th className="px-3 py-1.5 text-right">Days Overdue</th><th className="px-3 py-1.5 text-left">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-400">No open receivables</td></tr>
                : lines.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600 font-medium">{row.invoice_number}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{row.customer_name}</td>
                    <td className="px-3 py-1.5">{formatDate(row.invoice_date)}</td>
                    <td className={`px-3 py-1.5 ${parseInt(row.days_overdue) > 0 ? 'text-red-600 font-medium' : ''}`}>{formatDate(row.due_date)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{money(row.amount_due)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${parseInt(row.days_overdue) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{parseInt(row.days_overdue) > 0 ? `+${row.days_overdue}` : 'Current'}</td>
                    <td className="px-3 py-1.5"><span className={`badge text-2xs ${row.bucket === 'current' ? 'badge-green' : row.bucket === '1-30' ? 'badge-yellow' : row.bucket === '31-60' ? 'badge-orange' : 'badge-red'}`}>{row.bucket}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Summary: per-customer matrix ── */
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Customer</th>
                <th className="px-3 py-1.5 text-right">Current</th>
                <th className="px-3 py-1.5 text-right">1-30</th>
                <th className="px-3 py-1.5 text-right">31-60</th>
                <th className="px-3 py-1.5 text-right">61-90</th>
                <th className="px-3 py-1.5 text-right">90+</th>
                <th className="px-3 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-400">No open receivables</td></tr>
                : summary.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{r.entity_name}</td>
                    <td className="px-3 py-1.5 text-right">{money(r.current)}</td>
                    <td className="px-3 py-1.5 text-right">{money(r.days_1_30)}</td>
                    <td className="px-3 py-1.5 text-right">{money(r.days_31_60)}</td>
                    <td className="px-3 py-1.5 text-right">{money(r.days_61_90)}</td>
                    <td className={`px-3 py-1.5 text-right ${Number(r.over_90) > 0 ? 'text-red-600' : ''}`}>{money(r.over_90)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{money(r.total)}</td>
                  </tr>
                ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                  <td className="px-3 py-2 text-slate-900">Total</td>
                  <td className="px-3 py-2 text-right">{money(buckets.current)}</td>
                  <td className="px-3 py-2 text-right">{money(buckets.days_1_30)}</td>
                  <td className="px-3 py-2 text-right">{money(buckets.days_31_60)}</td>
                  <td className="px-3 py-2 text-right">{money(buckets.days_61_90)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{money(buckets.over_90)}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{money(buckets.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </ReportShell>
  );
}
