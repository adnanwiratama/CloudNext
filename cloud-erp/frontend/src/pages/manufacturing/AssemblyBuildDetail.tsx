import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatStatus } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function AssemblyBuildDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'components' | 'gl' | 'sysinfo'>('components');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['assembly-build', id] }); }, [justSaved, id, qc]);

  const { data: ab, isLoading } = useQuery({
    queryKey: ['assembly-build', id],
    queryFn: () => api.get(`/api/manufacturing/assembly-builds/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!ab) return <div className="p-6 text-red-600">Assembly build not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  const handlePrint = () => {
    print({
      title: 'Assembly Build',
      number: ab.build_number,
      status: formatStatus(ab.status),
      partyLabel: 'Item',
      partyName: `${ab.item_code || ''} - ${ab.item_name || ''}`.trim(),
      meta: [
        { label: 'Build Date', value: formatDate(ab.build_date) },
        { label: 'Build Qty', value: formatNumber(ab.quantity, 2) },
        { label: 'Location', value: ab.location_name || '-' },
        { label: 'Unit Cost', value: formatCurrency(ab.unit_cost || 0) },
        { label: 'Total Cost', value: formatCurrency(ab.total_cost || 0) },
      ],
      columns: [
        { label: 'Item', value: (l: any) => `${l.item_code || ''} ${l.item_name || ''}`.trim() },
        { label: 'Qty', align: 'right', value: (l: any) => formatNumber(l.quantity, 4) },
        { label: 'UOM', value: (l: any) => l.uom_code || '' },
        { label: 'Unit Cost', align: 'right', value: (l: any) => formatCurrency(l.unit_cost || 0) },
        { label: 'Total Cost', align: 'right', value: (l: any) => formatCurrency(l.total_cost || 0) },
      ],
      rows: ab.lines || [],
      memo: ab.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">AB</div>
              <span className="text-2xl font-bold text-slate-800">Assembly Build</span>
              <span className="text-2xl font-semibold text-slate-500">{ab.build_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/manufacturing/assembly-builds')} className="hover:underline">List</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/manufacturing/assembly-builds')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="assembly_build" id={id!} listPath="/manufacturing/assembly-builds" label={ab.build_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Assembly Build successfully saved</p></div></div>}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Build Number</div><div className="text-sm font-medium text-blue-700 font-mono">{ab.build_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Item</label><input readOnly value={`${ab.item_code||''} - ${ab.item_name||''}`} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Work Order</label><input readOnly value={ab.wo_number||'-'} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Build Date</label><input readOnly value={ab.build_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Build Qty</label><input readOnly value={formatNumber(ab.quantity,2)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={ab.location_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><div className="py-1"><StatusBadge status={ab.status}/></div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Unit Cost</label><input readOnly value={formatCurrency(ab.unit_cost||0)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Total Cost</label><input readOnly value={formatCurrency(ab.total_cost||0)} className={`${dis} font-medium text-emerald-700`}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={ab.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={ab.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={ab.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['components','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='components'?'Components':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'components' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">UOM</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ab.lines||[]).length === 0
                      ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No components</td></tr>
                      : (ab.lines||[]).map((l:any, i:number) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,4)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_cost||0)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.total_cost||0)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'gl' && (
              <div>
                <div className="mb-3 text-xs bg-indigo-50 border border-indigo-100 rounded p-3 text-indigo-800">
                  <p className="font-medium mb-1">GL Impact:</p>
                  <p>Dr. Inventory (finished good's inventory account) / Cr. Inventory (component inventory accounts)</p>
                </div>
                {(ab.journalEntries||[]).length > 0 ? (
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
                        {(ab.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit||0)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit||0)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries</div>}
              </div>
            )}
            {activeTab === 'sysinfo' && (
              <div className="border border-slate-200 rounded">
                <div className="grid grid-cols-2 gap-x-10 gap-y-3 p-4">
                  <div><label className="block text-xs text-slate-500 mb-1">Created By</label><input readOnly value={ab.created_by_name || ab.created_by || '-'} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Created At</label><input readOnly value={ab.created_at ? formatDateTime(ab.created_at) : '-'} className={dis}/></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
