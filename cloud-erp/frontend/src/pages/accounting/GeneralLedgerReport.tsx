import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

export default function GeneralLedgerReport() {
  const { accounts } = useFormOptions();
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    accountId: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['gl-report', filters],
    queryFn: () => api.get('/api/accounting/reports/general-ledger', { params: filters }).then(r => r.data.data || []),
    enabled: submitted,
  });

  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/accounting/reports/profit-loss' }, { label: 'General Ledger' }]}
        title="General Ledger"
        subtitle="Detailed transaction history by account"
        actions={
          <button className="btn-secondary btn-sm" onClick={() => window.print()}><Download size={13} /> Export</button>
        }
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Filter</div>
        <div className="form-grid-3 items-end">
          <div>
            <label className="erp-label">Start Date</label>
            <input type="date" className="erp-input" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} />
          </div>
          <div>
            <label className="erp-label">End Date</label>
            <input type="date" className="erp-input" value={filters.endDate} onChange={e => setF('endDate', e.target.value)} />
          </div>
          <div>
            <label className="erp-label">Account (optional)</label>
            <select className="erp-select" value={filters.accountId} onChange={e => setF('accountId', e.target.value)}>
              <option value="">All Accounts</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <button type="button" className="btn-primary" onClick={() => setSubmitted(true)}>
              <Search size={13} /> Run Report
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}

      {data && data.map((acct: any) => (
        <div key={acct.account_id} className="erp-card mb-4">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-800">{acct.account_code} — {acct.account_name}</span>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-slate-500">Opening: <strong>{formatCurrency(acct.opening_balance)}</strong></span>
              <span className="text-slate-500">Closing: <strong className="text-blue-600">{formatCurrency(acct.closing_balance)}</strong></span>
            </div>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>Date</th><th>Journal #</th><th>Memo</th><th>Ref</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50 text-xs font-medium text-slate-500">
                <td colSpan={4} className="px-3 py-1.5">Opening Balance</td>
                <td></td><td></td>
                <td className="px-3 py-1.5 text-right">{formatCurrency(acct.opening_balance)}</td>
              </tr>
              {(acct.lines || []).map((line: any, i: number) => (
                <tr key={i}>
                  <td className="text-xs">{formatDate(line.entry_date)}</td>
                  <td className="font-mono text-xs text-blue-600">{line.journal_number}</td>
                  <td className="text-slate-600 max-w-xs truncate">{line.memo}</td>
                  <td className="text-xs text-slate-400">{line.reference}</td>
                  <td className="text-right">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                  <td className="text-right">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                  <td className="text-right font-medium">{formatCurrency(line.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {submitted && !isLoading && (!data || data.length === 0) && (
        <div className="erp-card p-8 text-center text-slate-400">No transactions found for the selected period.</div>
      )}
    </div>
  );
}
