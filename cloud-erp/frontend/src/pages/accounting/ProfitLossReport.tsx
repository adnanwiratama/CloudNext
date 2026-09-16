import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatPercent } from '../../utils/format';

export default function ProfitLossReport() {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pl-report', dateFrom, dateTo],
    queryFn: () => api.get('/api/accounting/reports/profit-loss', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const Section = ({ title, rows, total, colorClass }: { title: string; rows: any[]; total: number; colorClass?: string }) => (
    <div className="mb-2">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 font-semibold text-sm text-slate-800">
        <span>{title}</span>
        <span className={colorClass}>{formatCurrency(total)}</span>
      </div>
      {rows.map((row: any) => (
        <div key={row.id} className="flex items-center justify-between px-6 py-1.5 border-b border-slate-100 hover:bg-slate-50">
          <div>
            <span className="text-sm text-slate-700">{row.name}</span>
            <span className="text-xs text-slate-400 ml-2">{row.code}</span>
          </div>
          <span className={`text-sm font-medium ${parseFloat(row.amount) > 0 ? '' : 'text-slate-400'}`}>{formatCurrency(row.amount)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'Profit & Loss' }]}
        title="Profit & Loss Statement"
        subtitle={`${dateFrom} to ${dateTo}`}
        actions={
          <>
            <button onClick={() => refetch()} className="btn-secondary btn-sm"><RefreshCw size={13} /> Refresh</button>
            <button className="btn-secondary btn-sm"><Download size={13} /> Export</button>
          </>
        }
      />

      {/* Filters */}
      <div className="erp-card mb-4 p-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Period:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="erp-input w-36" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="erp-input w-36" />
        <button onClick={() => refetch()} className="btn-primary btn-sm">Apply</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : data ? (
        <div className="erp-card">
          <div className="erp-card-header">
            <h3 className="text-sm font-bold text-slate-800">Profit & Loss</h3>
            <span className="text-xs text-slate-500">{dateFrom} – {dateTo}</span>
          </div>

          {/* Revenue */}
          <Section title="Revenue" rows={data.revenue || []} total={data.totalRevenue || 0} colorClass="text-emerald-700" />

          {/* COGS */}
          <Section title="Cost of Goods Sold" rows={(data.expenses || []).filter((e: any) => e.type === 'cogs')} total={data.totalCOGS || 0} colorClass="text-red-700" />

          {/* Gross Profit */}
          <div className={`flex items-center justify-between px-4 py-3 ${(data.grossProfit || 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <span className="text-sm font-bold text-slate-800">Gross Profit</span>
            <div className="text-right">
              <span className={`text-base font-bold ${(data.grossProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(data.grossProfit || 0)}</span>
              <div className="text-xs text-slate-500">Margin: {formatPercent(data.grossMarginPercent || 0)}</div>
            </div>
          </div>

          {/* Operating Expenses */}
          <Section title="Operating Expenses" rows={(data.expenses || []).filter((e: any) => e.type === 'expense')} total={data.totalExpenses || 0} colorClass="text-red-700" />

          {/* Net Income */}
          <div className={`flex items-center justify-between px-4 py-4 border-t-2 border-slate-300 ${(data.netIncome || 0) >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <span className="text-base font-bold text-slate-900">Net Income</span>
            <span className={`text-xl font-bold ${(data.netIncome || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(data.netIncome || 0)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
