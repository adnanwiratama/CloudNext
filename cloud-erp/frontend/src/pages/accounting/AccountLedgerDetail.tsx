import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft, FileText } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';

const amt = (v: number) => `Rp${Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AccountLedgerDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const dateFrom = sp.get('dateFrom') || `${new Date().getFullYear()}-01-01`;
  const dateTo = sp.get('dateTo') || new Date().toISOString().split('T')[0];

  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', accountId, dateFrom, dateTo],
    queryFn: () => api.get('/api/accounting/reports/account-ledger', { params: { accountId, dateFrom, dateTo } }).then(r => r.data.data),
    enabled: !!accountId,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;
  if (!data) return <div className="p-6 text-red-600">Account not found.</div>;

  const acc = data.account;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">GL</div>
            <h1 className="text-xl font-semibold text-slate-800">Account Transactions</h1>
            <span className="text-base text-slate-500 font-mono">{acc.code} — {acc.name}</span>
          </div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><ArrowLeft size={13}/> Back</button>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-1.5 text-xs text-slate-500">Period: {formatDate(dateFrom)} – {formatDate(dateTo)}</div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded shadow-sm p-3"><div className="text-xs text-slate-500">Opening Balance</div><div className="text-sm font-semibold text-slate-800">{amt(data.openingBalance)}</div></div>
          <div className="bg-white border border-slate-200 rounded shadow-sm p-3"><div className="text-xs text-slate-500">Total Debit</div><div className="text-sm font-semibold text-blue-700">{amt(data.totalDebit)}</div></div>
          <div className="bg-white border border-slate-200 rounded shadow-sm p-3"><div className="text-xs text-slate-500">Total Credit</div><div className="text-sm font-semibold text-emerald-700">{amt(data.totalCredit)}</div></div>
          <div className="bg-white border border-slate-200 rounded shadow-sm p-3"><div className="text-xs text-slate-500">Closing Balance</div><div className="text-sm font-bold text-slate-900">{amt(data.closingBalance)}</div></div>
        </div>

        {/* Transactions */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-40">Journal #</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-32">Source</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Memo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-36">Debit</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-36">Credit</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-40">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-100">
                  <td colSpan={6} className="px-3 py-1.5">Opening Balance</td>
                  <td className="px-3 py-1.5 text-right">{amt(data.openingBalance)}</td>
                </tr>
                {data.lines.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><FileText className="mx-auto mb-2 text-slate-300" size={32}/>No transactions in this period</td></tr>
                ) : data.lines.map((l: any) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/accounting/journals/${l.journal_id}`)}>
                    <td className="px-3 py-1.5 text-slate-600">{formatDate(l.entry_date)}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-600">{l.journal_number}</td>
                    <td className="px-3 py-1.5 text-slate-500 capitalize text-xs">{(l.source_type || 'manual').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5 text-slate-600">{l.memo || '-'}</td>
                    <td className="px-3 py-1.5 text-right text-blue-700">{l.debit > 0 ? amt(l.debit) : ''}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">{l.credit > 0 ? amt(l.credit) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-800">{amt(l.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-slate-600">Closing Balance</td>
                  <td className="px-3 py-2 text-right text-blue-700">{amt(data.totalDebit)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{amt(data.totalCredit)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{amt(data.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
