import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, CheckCircle, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatStatus } from '../../utils/format';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import toast from 'react-hot-toast';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function ExpenseReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'related'|'files'|'gl'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['expense-report', id] }); }, [justSaved, id, qc]);

  const { data: rep, isLoading } = useQuery({
    queryKey: ['expense-report', id],
    queryFn: () => api.get(`/api/employee/expenses/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!rep) return;
    print({
      title: 'Expense Report',
      number: rep.report_number,
      status: formatStatus(rep.status),
      partyLabel: 'Employee',
      partyName: rep.employee_name,
      meta: [
        { label: 'Period Start', value: formatDate(rep.report_period_start) },
        { label: 'Period End', value: formatDate(rep.report_period_end) },
        { label: 'Status', value: formatStatus(rep.status) },
        { label: 'Account (Payable)', value: rep.account_code ? `${rep.account_code} - ${rep.account_name}` : (rep.account_name || '-') },
        { label: 'Purpose', value: rep.purpose || '-' },
      ],
      columns: [
        { label: 'Date', value: (l: any) => (l.expense_date ? formatDate(l.expense_date) : '') },
        { label: 'Category (Account)', value: (l: any) => (l.account_code ? `${l.account_code} - ${l.account_name}` : (l.category || '')) },
        { label: 'Description', value: (l: any) => l.description || '' },
        { label: 'Department', value: (l: any) => l.department_name || '' },
        { label: 'Amount', align: 'right', value: (l: any) => formatCurrency(l.amount) },
      ],
      rows: rep.lines || [],
      totals: [
        { label: 'Total Amount', value: formatCurrency(rep.total_amount), bold: true },
      ],
      memo: rep.memo,
    });
  };

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/employee/expenses/${id}/approve`),
    onSuccess: () => { toast.success('Expense report approved'); qc.invalidateQueries({ queryKey: ['expense-report', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!rep) return <div className="p-6 text-red-600">Expense report not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const canEdit = !['approved','paid'].includes(rep.status);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white font-bold text-xs">EXP</div>
              <span className="text-2xl font-bold text-slate-800">Expense Report</span>
              <span className="text-2xl font-semibold text-slate-500">{rep.report_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/employee/expenses')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=expense_report')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/employee/expenses')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {canEdit && <EditTransactionButton permKey="expense_report" to={`/employee/expenses/${id}/edit`} />}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {rep.status === 'approved' && (
            <button onClick={() => navigate(`/employee/expense-payments/new?accountId=${rep.account_id||''}&amount=${Number(rep.total_amount||0)}&reportId=${id}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">💳 Create Payment</button>
          )}
          <DeleteTransactionButton type="expense_report" id={id!} listPath="/employee/expenses" label={rep.report_number} />
          <ApprovalBar
            recordType="expense_reports"
            approvalStatus={rep?.approval_status}
            approvedByName={rep?.approved_by_name}
            approvedAt={rep?.approved_at}
            configuredApproverId={rep?.configured_approver_id}
            configuredApproverName={rep?.configured_approver_name}
            submitUrl={`/api/employee/expenses/${id}/submit`}
            approveUrl={`/api/employee/expenses/${id}/approve`}
            rejectUrl={`/api/employee/expenses/${id}/reject`}
            queryKeys={['expense-report', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Expense Report successfully saved</p></div>
          </div>
        )}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Report #</div><div className="text-sm font-medium text-blue-700 font-mono">{rep.report_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Employee Name</label><input readOnly value={rep.employee_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Period Start</label><input readOnly value={rep.report_period_start?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Period End</label><input readOnly value={rep.report_period_end?.split('T')[0]||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Account (Payable)</label><input readOnly value={rep.account_code ? `${rep.account_code} - ${rep.account_name}` : (rep.account_name||'')} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Purpose</label><input readOnly value={rep.purpose||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={rep.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Notes / Memo</label><input readOnly value={rep.memo||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Expenses</span><span>{formatCurrency(rep.total_amount)}</span></div>
                    </div>
                  </div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={rep.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={rep.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={rep.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines','related','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='lines'?'Expense Lines':tab==='related'?'Related Records':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='lines' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Category (Account)</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Receipt #</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rep.lines||[]).length===0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400 italic">No expense lines</td></tr>
                    : (rep.lines||[]).map((l:any,i:number)=>(
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                        <td className="px-3 py-1.5">{l.expense_date?formatDate(l.expense_date):'-'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{l.account_code ? `${l.account_code} - ${l.account_name}` : (l.category||'-')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.description||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.receipt_number||'-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {(rep.lines||[]).length>0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(rep.total_amount)}</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {activeTab==='related' && (
              (rep.payments||[]).length > 0 ? (
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Document #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Status</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rep.payments||[]).map((p:any)=>(
                        <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5">{p.payment_date ? formatDate(p.payment_date) : '-'}</td>
                          <td className="px-3 py-1.5 text-slate-700">Expense Payment</td>
                          <td className="px-3 py-1.5"><button onClick={()=>navigate(`/employee/expense-payments/${p.payment_id}`)} className="text-blue-600 hover:underline font-mono">{p.payment_number}</button></td>
                          <td className="px-3 py-1.5 capitalize">{String(p.payment_status||'').replace(/_/g,' ')}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-emerald-600">{formatCurrency(p.applied_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records yet</div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="expense_report" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs bg-blue-50 border border-blue-100 rounded p-3 text-blue-800">
                  <span><span className="font-medium">Posted: </span><span className={rep.is_posted ? 'text-green-700 font-semibold' : 'text-slate-500 font-semibold'}>{rep.is_posted ? 'Yes' : 'No'}</span></span>
                  <span className="text-blue-700"><strong>Dr.</strong> Line expense accounts → <strong>Cr.</strong> {rep.account_code ? `${rep.account_code} ${rep.account_name}` : 'Payable account'} (posted on approval)</span>
                </div>
                {(rep.journalEntries||[]).length > 0 ? (
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
                      {(rep.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                        <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-mono text-xs">{je.journal_number}</td>
                          <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                          <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                          <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit||0)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit||0)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">{rep.is_posted ? 'No GL entries posted for this report' : 'GL will be posted when the report is approved'}</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/employee/expenses/${id}/audit`} queryKey={['exp-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
