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
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function CustomerDepositDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'details'|'related'|'files'|'gl'|'sysinfo'>('details');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['customer-deposit', id] }); }, [justSaved, id, qc]);

  const { data: dep, isLoading } = useQuery({
    queryKey: ['customer-deposit', id],
    queryFn: () => api.get(`/api/sales/deposits/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!dep) return <div className="p-6 text-red-600">Deposit not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const applied = Number(dep.amount_applied || 0);
  const remaining = Number(dep.amount || 0) - applied;

  const handlePrint = () => {
    if (!dep) return;
    print({
      title: 'Customer Deposit',
      number: dep.deposit_number,
      status: formatStatus(dep.status),
      partyLabel: 'Customer',
      partyName: dep.customer_name,
      meta: [
        { label: 'Deposit Date', value: formatDate(dep.deposit_date) },
        { label: 'Payment Method', value: dep.payment_method?.replace(/_/g, ' ') || '-' },
        { label: 'Reference', value: dep.reference || '-' },
        { label: 'Deposit To', value: dep.bank_account_name || '-' },
      ],
      totals: [
        { label: 'Total', value: formatCurrency(dep.amount), bold: true },
      ],
      memo: dep.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white"><Wallet size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Customer Deposit</span>
              <span className="text-2xl font-semibold text-slate-500">{dep.deposit_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/deposits')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=customer_deposit')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/sales/deposits')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {applied <= 0.009 && (
            <EditTransactionButton permKey="deposit" to={`/sales/deposits/${id}/edit`} />
          )}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="customer_deposit" id={id!} listPath="/sales/deposits" label={dep.deposit_number} />
          <ApprovalBar
            recordType="customer_deposits"
            approvalStatus={dep?.approval_status}
            approvedByName={dep?.approved_by_name}
            approvedAt={dep?.approved_at}
            configuredApproverId={dep?.configured_approver_id}
            configuredApproverName={dep?.configured_approver_name}
            submitUrl={`/api/sales/deposits/${id}/submit`}
            approveUrl={`/api/sales/deposits/${id}/approve`}
            rejectUrl={`/api/sales/deposits/${id}/reject`}
            queryKeys={['customer-deposit', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Customer Deposit successfully recorded</p></div>
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
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={dep.customer_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Deposit Date</label><input readOnly value={dep.deposit_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label><input readOnly value={dep.payment_method?.replace(/_/g,' ')||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={Number(dep.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} font-medium text-emerald-600`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Deposit To (Bank/Cash)</label><input readOnly value={dep.bank_account_name ? `${dep.bank_account_code||''} - ${dep.bank_account_name}` : ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={dep.reference||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={dep.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Applied</label><input readOnly value={applied.toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Remaining</label><input readOnly value={remaining.toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} ${remaining>0?'text-emerald-600 font-medium':''}`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={dep.memo||''} className={dis}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={dep.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={dep.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={dep.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
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
                <p className="text-xs text-emerald-700 mt-1"><strong>Dr. Bank Account → Cr. Customer Deposit Liability (2210)</strong><br/>
                Deposit akan di-apply ke Customer Payment / Invoice saat digunakan.</p>
              </div>
            )}
            {activeTab==='related' && (
              (dep.applications||[]).length > 0 ? (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer Payment #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Status</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Applied Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dep.applications||[]).map((a:any)=>(
                        <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-700">Customer Payment</td>
                          <td className="px-3 py-1.5"><button onClick={()=>navigate(`/sales/payments/${a.payment_id}`)} className="text-blue-600 hover:underline font-mono">{a.payment_number}</button></td>
                          <td className="px-3 py-1.5">{a.payment_date ? formatDate(a.payment_date) : '-'}</td>
                          <td className="px-3 py-1.5 capitalize">{String(a.payment_status||'').replace(/_/g,' ')}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{formatCurrency(a.applied_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records — this deposit has not been applied yet</div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="customer_deposit" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Customer Deposit):</p>
                  <p><strong>Dr. Bank / Cash → Cr. Customer Deposit Liability (2210)</strong></p>
                </div>
                {(dep.journalEntries||[]).length > 0 ? (
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
                        {(dep.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
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
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/sales/deposits/${id}/audit`} queryKey={['cdep-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
