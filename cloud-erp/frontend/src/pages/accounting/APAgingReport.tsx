import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatDate } from '../../utils/format';

export default function APAgingReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ap-aging'],
    queryFn: () => api.get('/api/accounting/reports/ap-aging').then(r => r.data.data),
  });

  const buckets = data?.buckets || {};

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'AP Aging' }]}
        title="Accounts Payable Aging"
        subtitle="Open vendor bills by aging bucket"
        actions={<>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">Refresh</button>
          <button className="btn-secondary btn-sm"><Download size={13} /> Export</button>
        </>}
      />
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Current', val: buckets.current, color: 'border-emerald-200 bg-emerald-50' },
          { label: '1-30 Days', val: buckets.days_1_30, color: 'border-yellow-200 bg-yellow-50' },
          { label: '31-60 Days', val: buckets.days_31_60, color: 'border-orange-200 bg-orange-50' },
          { label: '61-90 Days', val: buckets.days_61_90, color: 'border-red-200 bg-red-50' },
          { label: '90+ Days', val: buckets.over_90, color: 'border-red-300 bg-red-100' },
          { label: 'Total', val: buckets.total, color: 'border-blue-200 bg-blue-50' },
        ].map(b => (
          <div key={b.label} className={`erp-card border ${b.color} p-3`}>
            <div className="text-xs text-slate-500 mb-1">{b.label}</div>
            <div className="text-base font-bold text-slate-800">{formatCurrency(b.val || 0)}</div>
          </div>
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="erp-card">
          <table className="erp-table">
            <thead><tr><th>Bill #</th><th>Vendor</th><th>Bill Date</th><th>Due Date</th><th className="text-right">Amount Due</th><th className="text-right">Days Overdue</th><th>Bucket</th></tr></thead>
            <tbody>
              {(data?.lines || []).map((row: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono text-blue-600 font-medium">{row.bill_number}</td>
                  <td className="font-medium">{row.vendor_name}</td>
                  <td>{formatDate(row.bill_date)}</td>
                  <td className={parseInt(row.days_overdue) > 0 ? 'text-red-600 font-medium' : ''}>{formatDate(row.due_date)}</td>
                  <td className="text-right font-semibold">{formatCurrency(row.amount_due)}</td>
                  <td className={`text-right font-medium ${parseInt(row.days_overdue) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{parseInt(row.days_overdue) > 0 ? `+${row.days_overdue}` : 'Current'}</td>
                  <td><span className={`badge text-2xs ${row.bucket === 'current' ? 'badge-green' : row.bucket === '1-30' ? 'badge-yellow' : 'badge-red'}`}>{row.bucket}</span></td>
                </tr>
              ))}
              {(!data?.lines || data.lines.length === 0) && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No open payables</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
