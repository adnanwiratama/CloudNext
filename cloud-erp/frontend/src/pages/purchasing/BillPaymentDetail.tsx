import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';

export default function BillPaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'bills'|'files'|'gl'|'sysinfo'>('bills');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['vendor-payment', id] }); }, [justSaved, id, qc]);

  const { data: payment, isLoading } = useQuery({
    queryKey: ['vendor-payment', id],
    queryFn: () => api.get(`/api/purchasing/vendor-payments/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!payment) return <div className="p-6 text-red-600">Payment not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">$</div>
              <span className="text-2xl font-bold text-slate-800">Bill Payment</span>
              <span className="text-2xl font-semibold text-slate-500">{payment.payment_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/payments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_payment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/purchasing/payments')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Bill Payment successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Payment Number</div><div className="text-sm font-medium text-blue-700 font-mono">{payment.payment_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={payment.vendor_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Date</label><input readOnly value={payment.payment_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label><input readOnly value={payment.payment_method?.replace(/_/g,' ')||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={Number(payment.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} font-medium text-red-600`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Unapplied</label><input readOnly value={Number(payment.unapplied_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Bank Account</label><input readOnly value={payment.bank_account_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={payment.reference||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={payment.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={payment.department_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={payment.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">GL Posted</label>
                    <input readOnly value={payment.is_posted?'Posted':'Pending'} className={`${dis} ${payment.is_posted?'text-green-700':''}`}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={payment.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={payment.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={payment.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['bills','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='bills'?'Applied Bills':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='bills' && (
              payment.applications?.length > 0 ? (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Bill #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Bill Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Due Date</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Bill Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.applications.map((app: any) => (
                        <tr key={app.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><TransactionLink number={app.bill_number} id={app.bill_id}/></td>
                          <td className="px-3 py-1.5">{formatDate(app.bill_date)}</td>
                          <td className="px-3 py-1.5">{formatDate(app.due_date)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(app.total_amount)}</td>
                          <td className="px-3 py-1.5 text-right text-red-600 font-semibold">{formatCurrency(app.applied_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-400 italic">No bills applied.</p>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="vendor_payment" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Vendor Payment):</p>
                  <p><strong>Dr. Accounts Payable (2100) → Cr. Bank / Cash Account</strong></p>
                </div>
                {(payment.journalEntries||[]).length > 0 ? (
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
                        {(payment.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
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
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/purchasing/payments/${id}/audit`} queryKey={['vp-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
