import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'files'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['journal', id] }); }, [justSaved, id, qc]);

  const { data: je, isLoading } = useQuery({
    queryKey: ['journal', id],
    queryFn: () => api.get(`/api/accounting/journals/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!je) return <div className="p-6 text-red-600">Journal entry not found.</div>;

  const totalDebit  = (je.lines||[]).reduce((s:number,l:any) => s + parseFloat(l.debit  || 0), 0);
  const totalCredit = (je.lines||[]).reduce((s:number,l:any) => s + parseFloat(l.credit || 0), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-white font-bold text-xs">JE</div>
              <span className="text-2xl font-bold text-slate-800">Journal Entry</span>
              <span className="text-2xl font-semibold text-slate-500">{je.journal_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/accounting/journals')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=journal_entry')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/accounting/journals')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Journal Entry successfully posted to General Ledger</p></div>
          </div>
        )}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Journal Number</div><div className="text-sm font-medium text-blue-700 font-mono">{je.journal_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Entry Date</label><input readOnly value={je.entry_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Type</label><input readOnly value={je.type||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={je.currency||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Source Type</label><input readOnly value={je.source_type?.replace(/_/g,' ')||'-'} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Source From</label>
                    <div className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50">
                      {je.source_number && je.source_route
                        ? <Link to={je.source_route} className="text-blue-600 hover:underline font-mono">{je.source_number}</Link>
                        : je.source_id
                          ? <TransactionLink number={je.source_type||''} id={je.source_id} sourceType={je.source_type}/>
                          : <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label>
                    <div className="py-1"><StatusBadge status={je.status}/></div>
                  </div>
                  <div><label className="block text-xs text-slate-500 mb-1">Posted By</label><input readOnly value={je.posted_by||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Total Debit</label><input readOnly value={totalDebit.toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} text-blue-700 font-medium`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Total Credit</label><input readOnly value={totalCredit.toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} text-emerald-700 font-medium`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Balance</label><input readOnly value={isBalanced?'Balanced':'Unbalanced'} className={`${dis} ${isBalanced?'text-emerald-700':'text-red-600 font-medium'}`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={je.memo||''} className={dis}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={je.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={je.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={je.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines','files','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='lines'?'Journal Lines':tab==='files'?'Files':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'lines' && (
              <div>
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Credit</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(je.lines||[]).length === 0
                        ? <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400 italic">No lines</td></tr>
                        : (je.lines||[]).map((l:any, i:number) => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-400">{l.line_number||i+1}</td>
                            <td className="px-3 py-1.5 font-mono font-medium">{l.account_code}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-slate-500 text-xs">{l.memo||'-'}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-blue-700">{parseFloat(l.debit)>0?formatCurrency(l.debit):''}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-emerald-700">{parseFloat(l.credit)>0?formatCurrency(l.credit):''}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={4} className="px-3 py-2 text-right text-slate-600 text-xs">TOTAL</td>
                        <td className="px-3 py-2 text-right text-blue-700">{totalDebit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className={`px-3 py-2 text-right ${isBalanced?'text-emerald-700':'text-red-600'}`}>{totalCredit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td colSpan={2}/>
                      </tr>
                      <tr className={`text-xs ${isBalanced?'bg-emerald-50':'bg-red-50'}`}>
                        <td colSpan={8} className={`px-3 py-1.5 text-center font-medium ${isBalanced?'text-emerald-700':'text-red-600'}`}>
                          {isBalanced ? '✓ Entry is balanced' : `⚠ Imbalance: ${formatCurrency(Math.abs(totalDebit-totalCredit))}`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="journal_entry" sourceId={id!}/>}
            {activeTab === 'sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/accounting/journals/${id}/audit`} queryKey={['je-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
