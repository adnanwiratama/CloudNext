import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';

export default function BalanceSheetReport() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balance-sheet', asOfDate],
    queryFn: () => api.get('/api/accounting/reports/balance-sheet', { params: { asOfDate } }).then(r => r.data.data),
  });

  const Section = ({ title, rows, total, colorClass }: any) => (
    <div className="mb-1">
      <div className="flex justify-between px-4 py-2 bg-slate-100 font-semibold text-sm">
        <span>{title}</span><span className={colorClass}>{formatCurrency(total)}</span>
      </div>
      {(rows || []).map((r: any) => (
        <div key={r.id} className="flex justify-between px-6 py-1.5 border-b border-slate-100 hover:bg-slate-50 text-sm">
          <span className="text-slate-700">{r.name} <span className="text-xs text-slate-400">{r.code}</span></span>
          <span className="font-medium">{formatCurrency(Math.abs(parseFloat(r.balance)))}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'Balance Sheet' }]}
        title="Balance Sheet"
        subtitle={`As of ${asOfDate}`}
        actions={<button className="btn-secondary btn-sm"><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4 p-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">As of Date:</label>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="erp-input w-36" />
        <button onClick={() => refetch()} className="btn-primary btn-sm">Apply</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Assets */}
          <div className="erp-card">
            <div className="erp-card-header"><h3 className="text-sm font-bold">Assets</h3></div>
            <Section title="Total Assets" rows={data.assets} total={data.totalAssets} colorClass="text-blue-700" />
            <div className="flex justify-between px-4 py-3 bg-blue-50 border-t-2 border-blue-200">
              <span className="font-bold text-slate-800">Total Assets</span>
              <span className="font-bold text-blue-700 text-base">{formatCurrency(data.totalAssets || 0)}</span>
            </div>
          </div>
          {/* Liabilities & Equity */}
          <div className="erp-card">
            <div className="erp-card-header"><h3 className="text-sm font-bold">Liabilities & Equity</h3></div>
            <Section title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} colorClass="text-red-700" />
            <Section title="Equity" rows={data.equity} total={data.totalEquity} colorClass="text-purple-700" />
            <div className="flex justify-between px-4 py-3 bg-slate-50 border-t-2 border-slate-300">
              <span className="font-bold text-slate-800">Total Liabilities & Equity</span>
              <span className="font-bold text-slate-800 text-base">{formatCurrency((data.totalLiabilities || 0) + (data.totalEquity || 0))}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
