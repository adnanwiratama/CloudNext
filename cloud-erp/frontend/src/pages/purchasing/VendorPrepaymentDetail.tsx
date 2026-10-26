import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Wallet, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatStatus } from '../../utils/format';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function VendorPrepaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'details'|'related'|'files'|'gl'|'sysinfo'>('details');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['vendor-prepayment', id] }); }, [justSaved, id, qc]);

  const { data: prep, isLoading } = useQuery({
    queryKey: ['vendor-prepayment', id],
    queryFn: () => api.get(`/api/purchasing/prepayments/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!prep) return <div className="p-6 text-red-600">Prepayment not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  const handlePrint = () => {
    if (!prep) return;
    print({
      title: 'Vendor Prepayment',
      number: prep.prepayment_number,
      status: formatStatus(prep.status),
      partyLabel: 'Vendor',
      partyName: prep.vendor_name,
      meta: [
        { label: 'Payment Date', value: formatDate(prep.payment_date) },
        { label: 'Payment Method', value: prep.payment_method?.replace(/_/g, ' ') || '-' },
        { label: 'Reference', value: prep.reference || '-' },
        { label: 'Pay From', value: prep.bank_account_name || '-' },
      ],
      totals: [
        { label: 'Total', value: formatCurrency(prep.amount), bold: true },
      ],
      memo: prep.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center text-white"><Wallet size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Vendor Prepayment</span>
              <span className="text-2xl font-semibold text-slate-500">{prep.prepayment_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/prepayments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_prepayment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/purchasing/prepayments')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="vendor_prepayment" id={id!} listPath="/purchasing/prepayments" label={prep.prepayment_number} />
          <ApprovalBar
            approvalStatus={prep?.approval_status}
            approvedByName={prep?.approved_by_name}
            approvedAt={prep?.approved_at}
            approveUrl={`/api/purchasing/prepayments/${id}/approve`}
            rejectUrl={`/api/purchasing/prepayments/${id}/reject`}
            queryKeys={['vendor-prepayment', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Vendor Prepayment successfully recorded</p></div>
          </div>
        )}

        {/* Primary Information — mirrors the input form */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                {/* Column 1 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={prep.vendor_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Date</label><input readOnly value={prep.payment_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={Number(prep.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} font-medium text-red-600`}/></div>
                </div>
                {/* Column 2 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Pay From (Bank/Cash)</label><input readOnly value={prep.bank_account_name ? `${prep.bank_account_code||''} - ${prep.bank_account_name}` : ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label><input readOnly value={prep.payment_method?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={prep.reference||''} className={dis}/></div>
                </div>
                {/* Column 3 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={prep.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Applied</label><input readOnly value={Number(prep.amount_applied||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={prep.memo||''} className={dis}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={prep.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={prep.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={prep.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs: Details / Files / GL Impact / System Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['details','related','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='details'?'Details':tab==='related'?'Related Records':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='details' && (
              <div className="rounded border border-emerald-200 bg-emerald-50/30 p-4 text-sm text-emerald-800">
                <p className="font-medium">GL Impact</p>
                <p className="text-xs text-emerald-700 mt-1"><strong>Dr. Vendor Prepayment (1130) → Cr. Bank Account</strong><br/>
                Prepayment akan di-apply ke Vendor Bill saat tagihan diterima.</p>
              </div>
            )}
            {activeTab==='related' && (
              (prep.applications||[]).length > 0 ? (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Bill Payment #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Status</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Applied Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(prep.applications||[]).map((a:any)=>(
                        <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-700">Bill Payment</td>
                          <td className="px-3 py-1.5"><button onClick={()=>navigate(`/purchasing/payments/${a.payment_id}`)} className="text-blue-600 hover:underline font-mono">{a.payment_number}</button></td>
                          <td className="px-3 py-1.5">{a.payment_date ? formatDate(a.payment_date) : '-'}</td>
                          <td className="px-3 py-1.5 capitalize">{String(a.payment_status||'').replace(/_/g,' ')}</td>
                          <td className="px-3 py-1.5 text-right text-violet-600 font-semibold">{formatCurrency(a.applied_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records — this prepayment has not been applied yet</div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="vendor_prepayment" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Vendor Prepayment):</p>
                  <p><strong>Dr. Advance Payment to Vendor (1130) → Cr. Bank / Cash Account</strong></p>
                </div>
                {(prep.journalEntries||[]).length > 0 ? (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Journal #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Credit</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr></thead>
                      <tbody>
                        {(prep.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit||0)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit||0)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries posted yet</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/purchasing/prepayments/${id}/audit`} queryKey={['prep-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
