import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Undo2, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatStatus } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function RefundCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'files' | 'gl' | 'sysinfo'>('gl');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['customer-refund', id] }); }, [justSaved, id, qc]);

  const { data: cr, isLoading } = useQuery({
    queryKey: ['customer-refund', id],
    queryFn: () => api.get(`/api/sales/refunds/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!cr) return;
    print({
      title: 'Customer Refund',
      number: cr.refund_number,
      status: formatStatus(cr.status),
      partyLabel: 'Customer',
      partyName: cr.customer_name,
      partyLines: [cr.billing_address, cr.customer_email].filter(Boolean),
      meta: [
        { label: 'Refund Date', value: formatDate(cr.refund_date) },
        { label: 'Payment Method', value: (cr.payment_method || '').replace(/_/g, ' ') || '-' },
        { label: 'Bank Account', value: cr.bank_account_name || '-' },
        { label: 'Reference', value: cr.reference || '-' },
        { label: 'Credit Memo', value: cr.credit_memo_number || '-' },
      ],
      totals: [{ label: 'Refund Amount', value: formatCurrency(cr.amount), bold: true }],
      memo: cr.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!cr) return <div className="p-6 text-red-600">Refund not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><Undo2 size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Customer Refund</span>
              <span className="text-2xl font-semibold text-slate-500">{cr.refund_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/refunds')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/sales/refunds')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="customer_refund" id={id!} listPath="/sales/refunds" label={cr.refund_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Customer Refund successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={cr.customer_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Refund Date</label><input readOnly value={cr.refund_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label><input readOnly value={(cr.payment_method || '').replace(/_/g, ' ')} className={`${dis} capitalize`}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={formatCurrency(cr.amount)} className={`${dis} font-medium text-red-600`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Bank Account</label><input readOnly value={cr.bank_account_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={cr.reference || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={formatStatus(cr.status)} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Credit Memo</label><input readOnly value={cr.credit_memo_number || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={cr.memo || ''} className={dis}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['gl', 'files', 'sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'gl' ? 'GL Impact' : tab === 'files' ? 'Files' : 'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Customer Refund):</p>
                  <p><strong>Dr. Accounts Receivable / Cr. Bank Account</strong></p>
                </div>
                {(cr.journalEntries || []).length > 0 ? (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Journal #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Credit</th>
                      </tr></thead>
                      <tbody>
                        {(cr.journalEntries || []).flatMap((je: any) => (je.lines || []).map((l: any, i: number) => (
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={() => navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit) > 0 ? Number(l.debit).toLocaleString('id-ID', { minimumFractionDigits: 2 }) : ''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit) > 0 ? Number(l.credit).toLocaleString('id-ID', { minimumFractionDigits: 2 }) : ''}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries posted yet</div>}
              </div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="customer_refund" sourceId={id!}/>}
            {activeTab === 'sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{cr.created_by_name || '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{cr.created_at ? formatDate(cr.created_at) : '-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
