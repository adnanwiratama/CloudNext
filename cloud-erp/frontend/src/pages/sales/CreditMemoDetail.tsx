import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Minus, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function CreditMemoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'files' | 'gl' | 'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['credit-memo', id] }); }, [justSaved, id, qc]);

  const { data: cm, isLoading } = useQuery({
    queryKey: ['credit-memo', id],
    queryFn: () => api.get(`/api/sales/credit-memos/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!cm) return;
    print({
      title: 'Credit Memo',
      number: cm.memo_number,
      status: formatStatus(cm.status),
      partyLabel: 'Customer',
      partyName: cm.customer_name,
      partyLines: [cm.billing_address, cm.customer_email].filter(Boolean),
      meta: [
        { label: 'Memo Date', value: formatDate(cm.memo_date) },
        { label: 'Original Invoice', value: cm.original_invoice_number || '-' },
        { label: 'Reason', value: (cm.reason || '').replace(/_/g, ' ') || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.qty, 2) },
        { label: 'Unit Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Amount', align: 'right', value: (r: any) => formatCurrency(Number(r.qty) * Number(r.unit_price)) },
      ],
      rows: cm.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(cm.subtotal) },
        { label: 'Tax', value: formatCurrency(cm.tax_amount) },
        { label: 'Total', value: formatCurrency(cm.total_amount), bold: true },
      ],
      memo: cm.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!cm) return <div className="p-6 text-red-600">Credit memo not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white"><Minus size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Credit Memo</span>
              <span className="text-2xl font-semibold text-slate-500">{cm.memo_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/credit-memos')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/sales/credit-memos')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="credit_memo" id={id!} listPath="/sales/credit-memos" label={cm.memo_number} />
          <ApprovalBar
            recordType="credit_memos"
            approvalStatus={cm?.approval_status}
            approvedByName={cm?.approved_by_name}
            approvedAt={cm?.approved_at}
            configuredApproverId={cm?.configured_approver_id}
            configuredApproverName={cm?.configured_approver_name}
            submitUrl={`/api/sales/credit-memos/${id}/submit`}
            approveUrl={`/api/sales/credit-memos/${id}/approve`}
            rejectUrl={`/api/sales/credit-memos/${id}/reject`}
            queryKeys={['credit-memo', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Credit Memo successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={cm.customer_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo Date</label><input readOnly value={cm.memo_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Original Invoice</label><input readOnly value={cm.original_invoice_number || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={formatStatus(cm.status)} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reason</label><input readOnly value={(cm.reason || '').replace(/_/g, ' ')} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={cm.memo || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(cm.subtotal)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{formatCurrency(cm.tax_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{formatCurrency(cm.total_amount)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items', 'files', 'gl', 'sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'items' ? 'Items' : tab === 'files' ? 'Files' : tab === 'gl' ? 'GL Impact' : 'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'items' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                  </tr></thead>
                  <tbody>
                    {(cm.lines || []).length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (cm.lines || []).map((l: any) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.qty, 2)}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(Number(l.qty) * Number(l.unit_price))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="credit_memo" sourceId={id!}/>}
            {activeTab === 'gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Credit Memo):</p>
                  <p><strong>Dr. Sales Revenue / Cr. Accounts Receivable</strong></p>
                </div>
                {(cm.journalEntries || []).length > 0 ? (
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
                        {(cm.journalEntries || []).flatMap((je: any) => (je.lines || []).map((l: any, i: number) => (
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
            {activeTab === 'sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{cm.created_by_name || '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{cm.created_at ? formatDate(cm.created_at) : '-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
