import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';

export default function TrialBalanceReport() {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trial-balance', dateFrom, dateTo],
    queryFn: () => api.get('/api/accounting/reports/trial-balance', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'Trial Balance' }]}
        title="Trial Balance"
        actions={<button className="btn-secondary btn-sm"><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4 p-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Period:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="erp-input w-36" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="erp-input w-36" />
        <button onClick={() => refetch()} className="btn-primary btn-sm">Apply</button>
        {data && (
          <span className={`ml-4 text-xs font-medium px-2 py-1 rounded ${data.isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {data.isBalanced ? '✓ Balanced' : '⚠ Not Balanced'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : data ? (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th className="text-right">Total Debit</th>
                <th className="text-right">Total Credit</th>
                <th className="text-right">Net Balance</th>
              </tr>
            </thead>
            <tbody>
              {(data.lines || []).map((row: any) => (
                <tr key={row.id}>
                  <td className="font-mono font-medium">{row.code}</td>
                  <td className="font-medium">{row.name}</td>
                  <td><span className="text-xs text-slate-500 capitalize">{row.type?.replace(/_/g,' ')}</span></td>
                  <td className="text-right">{parseFloat(row.total_debit) > 0 ? formatCurrency(row.total_debit) : '-'}</td>
                  <td className="text-right">{parseFloat(row.total_credit) > 0 ? formatCurrency(row.total_credit) : '-'}</td>
                  <td className={`text-right font-medium ${parseFloat(row.net_balance) >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{formatCurrency(row.net_balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold">
                <td colSpan={3} className="px-3 py-2 text-sm text-right">Totals</td>
                <td className="px-3 py-2 text-right text-sm">{formatCurrency(data.totalDebit || 0)}</td>
                <td className="px-3 py-2 text-right text-sm">{formatCurrency(data.totalCredit || 0)}</td>
                <td className="px-3 py-2 text-right text-sm">{formatCurrency((data.totalDebit || 0) - (data.totalCredit || 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
