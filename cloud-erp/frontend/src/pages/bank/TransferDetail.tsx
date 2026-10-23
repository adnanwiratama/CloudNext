import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, ArrowRight, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatStatus } from '../../utils/format';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function TransferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'info'|'files'|'gl'|'sysinfo'>('info');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['transfer', id] }); }, [justSaved, id, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => api.get(`/api/bank/transfers/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!data) return <div className="p-6 text-red-600">Transfer not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const amount = Number(data.amount || 0);

  const handlePrint = () => {
    if (!data) return;
    print({
      title: 'Bank Transfer',
      number: data.transfer_number,
      status: data.status ? formatStatus(data.status) : undefined,
      partyLabel: 'From → To',
      partyName: `${data.from_account_name || '-'} → ${data.to_account_name || '-'}`,
      meta: [
        { label: 'Transfer Date', value: formatDate(data.transfer_date) },
        { label: 'Reference', value: data.reference || '-' },
      ],
      totals: [
        { label: 'Total', value: formatCurrency(amount), bold: true },
      ],
      memo: data.memo,
    });
  };

  // GL: Dr. To Account, Cr. From Account
  const glRows = [
    { code: data.to_account_code || '', name: data.to_account_name || '-', debit: amount, credit: 0, memo: `Transfer in ${data.transfer_number}` },
    { code: data.from_account_code || '', name: data.from_account_name || '-', debit: 0, credit: amount, memo: `Transfer out ${data.transfer_number}` },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white"><ArrowRight size={16}/></div>
              <span className="text-2xl font-bold text-slate-800">Transfer</span>
              <span className="text-2xl font-semibold text-slate-500">{data.transfer_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/transfers-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_transfer')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/bank/transfers-list')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="bank_transfer" id={id!} listPath="/bank/transfers-list" label={data.transfer_number} />
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
                  <div><div className="text-xs text-slate-500 mb-0.5">Transaction Number</div><div className="text-sm font-medium text-blue-700 font-mono">{data.transfer_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">From Account</label><input readOnly value={data.from_account_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">To Account</label><input readOnly value={data.to_account_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={amount>0?amount.toLocaleString('id-ID',{minimumFractionDigits:2}):'0.00'} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Transfer Date</label><input readOnly value={data.transfer_date ? new Date(data.transfer_date).toISOString().split('T')[0] : ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={data.reference||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={data.department_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={data.location_name||''} className={dis}/></div>
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
            {(['info','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='info'?'Transfer Details':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='info' && (
              <div className="flex items-center justify-center py-6 gap-6">
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">From</div>
                  <div className="text-sm font-medium text-slate-800 px-4 py-2 bg-slate-100 rounded">{data.from_account_name||'—'}</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <ArrowRight size={24} className="text-blue-500"/>
                  <div className="text-xs font-bold text-blue-700">{amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">To</div>
                  <div className="text-sm font-medium text-slate-800 px-4 py-2 bg-slate-100 rounded">{data.to_account_name||'—'}</div>
                </div>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="bank_transfer" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 flex items-center gap-3 px-1">
                  <span className="text-sm font-medium text-slate-700">Posting:</span>
                  {data.journalEntry ? (
                    <button onClick={() => navigate(`/accounting/journals/${data.journalEntry.id}`)} className="font-mono text-blue-600 hover:underline text-sm font-medium">{data.journalEntry.journal_number}</button>
                  ) : <span className="text-sm text-slate-400 italic">Not posted</span>}
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
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/bank/transfers/${id}/audit`} queryKey={['transfer-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
