import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatStatus } from '../../utils/format';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function DepositDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'files'|'gl'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['deposit', id] }); }, [justSaved, id, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ['deposit', id],
    queryFn: () => api.get(`/api/bank/deposits/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!data) return <div className="p-6 text-red-600">Deposit not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const lines: any[] = data.lines || [];
  const totalAmount = Number(data.total_amount || 0);

  const handlePrint = () => {
    if (!data) return;
    const hasLines = lines.length > 0;
    print({
      title: 'Bank Deposit',
      number: data.deposit_number,
      status: data.status ? formatStatus(data.status) : undefined,
      meta: [
        { label: 'Deposit Date', value: formatDate(data.deposit_date) },
        { label: 'Bank Account', value: data.bank_account_name || '-' },
        { label: 'Reference', value: data.reference || '-' },
      ],
      columns: hasLines ? [
        { label: 'From / Source', value: (l: any) => l.received_from || l.name || l.account_name || '' },
        { label: 'Account', value: (l: any) => l.account_name || '' },
        { label: 'Memo', value: (l: any) => l.memo || '' },
        { label: 'Amount', align: 'right', value: (l: any) => formatCurrency(l.amount) },
      ] : undefined,
      rows: hasLines ? lines : undefined,
      totals: [
        { label: 'Total', value: formatCurrency(totalAmount), bold: true },
      ],
      memo: data.memo,
    });
  };

  // GL rows: Dr. Bank Account, Cr. each source account
  const glRows = [
    { code: data.bank_account_code || '', name: data.bank_account_name || '-', debit: totalAmount, credit: 0, memo: `Deposit ${data.deposit_number}` },
    ...lines.map((l: any) => ({ code: l.account_code || '', name: l.account_name || '-', debit: 0, credit: Number(l.amount || 0), memo: l.memo || '' })),
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-sm">$</div>
              <span className="text-2xl font-bold text-slate-800">Deposit</span>
              <span className="text-2xl font-semibold text-slate-500">{data.deposit_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/deposits-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_deposit')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/bank/deposits-list')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="deposit" to={`/bank/deposits/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="bank_deposit" id={id!} listPath="/bank/deposits-list" label={data.deposit_number} />
          <ApprovalBar
            approvalStatus={data?.approval_status}
            approvedByName={data?.approved_by_name}
            approvedAt={data?.approved_at}
            approveUrl={`/api/bank/deposits/${id}/approve`}
            rejectUrl={`/api/bank/deposits/${id}/reject`}
            queryKeys={['deposit', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Transaction successfully Saved</p></div>
          </div>
        )}

        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Transaction Number</div><div className="text-sm font-medium text-blue-700 font-mono">{data.deposit_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Bank Account</label><input readOnly value={data.bank_account_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Deposit Date</label><input readOnly value={data.deposit_date ? new Date(data.deposit_date).toISOString().split('T')[0] : ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Total Amount</label><input readOnly value={totalAmount>0?totalAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'0.00'} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={data.reference||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={data.department_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={data.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={data.status||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={data.memo||''} className={dis}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={data.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={data.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={data.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='lines'?'Deposit Lines':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
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
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Entity</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length===0 ? <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">No deposit lines</td></tr>
                    : lines.map((l:any,i:number)=>(
                      <tr key={l.id||i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                        <td className="px-3 py-1.5 text-slate-700">{l.account_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {l.entity_name ? <>{l.entity_name}{l.entity_type && <span className="ml-1 text-2xs text-slate-400">({l.entity_type})</span>}</> : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">{l.memo||'-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {lines.length>0 && (
                    <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                      <td colSpan={4} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                      <td className="px-3 py-1.5 text-right text-slate-800">{totalAmount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                      <td colSpan={2}/>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="bank_deposit" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 flex items-center gap-3 px-1">
                  <span className="text-sm font-medium text-slate-700">Posting:</span>
                  {data.journalEntry ? (
                    <button onClick={() => navigate(`/accounting/journals/${data.journalEntry.id}`)} className="font-mono text-blue-600 hover:underline text-sm font-medium">{data.journalEntry.journal_number}</button>
                  ) : <span className="text-sm text-slate-400 italic">Not posted</span>}
                  {data.journalEntry?.status === 'non_posting' && <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">Non-Posting</span>}
                </div>
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Credit</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glRows.map((r,i)=>(
                        <tr key={i} className={`border-t border-slate-100 ${r.debit>0?'bg-blue-50/30':''}`}>
                          <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{r.code}</td>
                          <td className="px-3 py-1.5 text-slate-700 font-medium">{r.name}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-blue-700">{r.debit>0?r.debit.toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-emerald-700">{r.credit>0?r.credit.toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/bank/deposits/${id}/audit`} queryKey={['deposit-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
