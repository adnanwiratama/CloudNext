import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Minus, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function VendorCreditDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'bills' | 'files' | 'gl' | 'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['vendor-credit', id] }); }, [justSaved, id, qc]);

  const { data: vc, isLoading } = useQuery({
    queryKey: ['vendor-credit', id],
    queryFn: () => api.get(`/api/purchasing/vendor-credits/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!vc) return;
    print({
      title: 'Vendor Credit',
      number: vc.credit_number,
      status: formatStatus(vc.status),
      partyLabel: 'Vendor',
      partyName: vc.vendor_name,
      partyLines: [vc.vendor_address, vc.vendor_email].filter(Boolean),
      meta: [
        { label: 'Credit Date', value: formatDate(vc.credit_date) },
        { label: 'Vendor Credit Memo #', value: vc.vendor_credit_memo_number || '-' },
        { label: 'Original Bill', value: vc.original_bill_number || '-' },
        { label: 'Reason', value: (vc.reason || '').replace(/_/g, ' ') || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.qty, 2) },
        { label: 'Unit Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Amount', align: 'right', value: (r: any) => formatCurrency(Number(r.qty) * Number(r.unit_price)) },
      ],
      rows: vc.lines || [],
      totals: [{ label: 'Total', value: formatCurrency(vc.total_amount), bold: true }],
      memo: vc.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!vc) return <div className="p-6 text-red-600">Vendor credit not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><Minus size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Vendor Credit</span>
              <span className="text-2xl font-semibold text-slate-500">{vc.credit_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/vendor-credits')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/purchasing/vendor-credits')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="vendor_credit" id={id!} listPath="/purchasing/vendor-credits" label={vc.credit_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Vendor Credit successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={vc.vendor_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Credit Date</label><input readOnly value={vc.credit_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor Credit Memo #</label><input readOnly value={vc.vendor_credit_memo_number || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={formatStatus(vc.status)} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Original Bill</label><input readOnly value={vc.original_bill_number || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reason</label><input readOnly value={(vc.reason || '').replace(/_/g, ' ')} className={`${dis} capitalize`}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{formatCurrency(vc.total_amount)}</span></div>
                    </div>
                  </div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><textarea readOnly rows={2} value={vc.memo || ''} className={`${dis} resize-none`}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items', 'bills', 'files', 'gl', 'sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'items' ? 'Items' : tab === 'bills' ? 'Applied Bills' : tab === 'files' ? 'Files' : tab === 'gl' ? 'GL Impact' : 'System Information'}
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
                    {(vc.lines || []).length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (vc.lines || []).map((l: any) => (
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
            {activeTab === 'bills' && (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Bills this credit was applied against (reduces vendor debt).</span>
                  <span className="text-slate-600">Applied: <span className="font-semibold">{formatCurrency(vc.applied_amount)}</span> of {formatCurrency(vc.total_amount)}</span>
                </div>
                {(vc.billApplications || []).length > 0 ? (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Bill #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Vendor Invoice #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Bill Date</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Bill Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Remaining Due</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Applied</th>
                      </tr></thead>
                      <tbody>
                        {(vc.billApplications || []).map((a: any) => (
                          <tr key={a.id} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={() => navigate(`/purchasing/bills/${a.bill_id}`)} className="text-blue-600 hover:underline font-mono">{a.bill_number}</button></td>
                            <td className="px-3 py-1.5 text-slate-600">{a.vendor_bill_number || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{a.bill_date ? formatDate(a.bill_date) : '-'}</td>
                            <td className="px-3 py-1.5 text-right">{formatCurrency(a.bill_total)}</td>
                            <td className="px-3 py-1.5 text-right text-red-600">{formatCurrency(a.bill_due)}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-emerald-700">{formatCurrency(a.applied_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">This credit has not been applied to any bills.</div>}
              </div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="vendor_credit" sourceId={id!}/>}
            {activeTab === 'gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Vendor Credit):</p>
                  <p><strong>Dr. Accounts Payable / Cr. Inventory Returned Not Credited</strong></p>
                </div>
                {(vc.journalEntries || []).length > 0 ? (
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
                        {(vc.journalEntries || []).flatMap((je: any) => (je.lines || []).map((l: any, i: number) => (
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
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{vc.created_by_name || '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{vc.created_at ? formatDate(vc.created_at) : '-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
