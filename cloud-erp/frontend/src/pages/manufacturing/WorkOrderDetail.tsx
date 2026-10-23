import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Play, Package, Loader2, CheckCircle2, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import toast from 'react-hot-toast';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'materials'|'files'|'gl'|'sysinfo'>('materials');
  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['work-order', id] }); }, [justSaved, id, qc]);

  const { data: wo, isLoading } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api.get(`/api/manufacturing/work-orders/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  const releaseMutation = useMutation({
    mutationFn: () => api.post(`/api/manufacturing/work-orders/${id}/release`),
    onSuccess: () => { toast.success('Work order released'); qc.invalidateQueries({ queryKey: ['work-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });
  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!wo) return <div className="p-6 text-red-600">Work order not found.</div>;

  const canRelease  = wo.status === 'planned';
  const canBuild    = ['released','in_progress','planned'].includes(wo.status);
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const pct = wo.planned_quantity > 0 ? Math.min(100, Math.round((wo.completed_quantity / wo.planned_quantity) * 100)) : 0;

  const handlePrint = () => {
    if (!wo) return;
    print({
      title: 'Work Order',
      number: wo.wo_number,
      status: formatStatus(wo.status),
      partyLabel: 'Item',
      partyName: `${wo.item_code || ''} - ${wo.item_name || ''}`.trim(),
      meta: [
        { label: 'BOM', value: wo.bom_name || wo.bom_number || '-' },
        { label: 'Start Date', value: formatDate(wo.planned_start_date) },
        { label: 'End Date', value: formatDate(wo.planned_end_date) },
        { label: 'Status', value: formatStatus(wo.status) },
        { label: 'Planned Qty', value: formatNumber(wo.planned_quantity, 0) },
      ],
      columns: [
        { label: 'Item', value: (m: any) => `${m.item_code || ''} ${m.item_name || ''}`.trim() },
        { label: 'Planned', align: 'right', value: (m: any) => formatNumber(m.planned_quantity, 2) },
        { label: 'Issued', align: 'right', value: (m: any) => formatNumber(m.issued_quantity, 2) },
        { label: 'UOM', value: (m: any) => m.uom_code || '' },
      ],
      rows: wo.materials || [],
      memo: wo.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-700 flex items-center justify-center text-white font-bold text-xs">WO</div>
              <span className="text-2xl font-bold text-slate-800">Work Order</span>
              <span className="text-2xl font-semibold text-slate-500">{wo.wo_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/manufacturing/work-orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=work_order')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/manufacturing/work-orders')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {canRelease && <button onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800 disabled:opacity-60"><Play size={13}/> Release</button>}
          {canBuild && (
            <button onClick={() => navigate(`/manufacturing/assembly-builds/new?itemId=${wo.item_id}&workOrderId=${wo.id}${wo.bom_id ? `&bomId=${wo.bom_id}` : ''}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">
              <Package size={13}/> Build Assembly
            </button>
          )}
          <DeleteTransactionButton type="work_order" id={id!} listPath="/manufacturing/work-orders" label={wo.wo_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Work Order successfully saved</p></div></div>}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">WO Number</div><div className="text-sm font-medium text-blue-700 font-mono">{wo.wo_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Item</label><input readOnly value={`${wo.item_code||''} - ${wo.item_name||''}`} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">BOM</label><input readOnly value={wo.bom_name||wo.bom_number||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Priority</label><input readOnly value={wo.priority||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Planned Qty</label><input readOnly value={formatNumber(wo.planned_quantity,0)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Completed</label><input readOnly value={formatNumber(wo.completed_quantity,0)} className={`${dis} text-emerald-700 font-medium`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Start Date</label><input readOnly value={wo.planned_start_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">End Date</label><input readOnly value={wo.planned_end_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><div className="py-1"><StatusBadge status={wo.status}/></div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={wo.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={wo.department_name||''} className={dis}/></div>
                  {/* Progress bar */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Completion {pct}%</label>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${pct}%`}}/></div>
                  </div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={wo.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={wo.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={wo.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['materials','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='materials'?'Materials':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'materials' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Planned</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Issued</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Remaining</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">UOM</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Std Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wo.materials||[]).length === 0
                      ? <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400 italic">No materials defined</td></tr>
                      : (wo.materials||[]).map((m:any) => {
                        const remaining = parseFloat(m.planned_quantity) - parseFloat(m.issued_quantity);
                        return (
                          <tr key={m.id} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{m.item_code}</span><div className="text-xs">{m.item_name}</div></td>
                            <td className="px-3 py-1.5 text-right">{formatNumber(m.planned_quantity,2)}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{formatNumber(m.issued_quantity,2)}</td>
                            <td className={`px-3 py-1.5 text-right font-medium ${remaining>0?'text-amber-600':'text-slate-400'}`}>{formatNumber(remaining,2)}</td>
                            <td className="px-3 py-1.5 text-slate-500">{m.uom_code}</td>
                            <td className="px-3 py-1.5 text-right">{formatCurrency(m.standard_cost)}</td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="work_order" sourceId={id!}/>}
            {activeTab === 'gl' && (
              <div>
                <div className="mb-3 text-xs bg-indigo-50 border border-indigo-100 rounded p-3 text-indigo-800">
                  <p className="font-medium mb-1">GL Impact on Completion:</p>
                  <p>Component Issue: <strong>Dr. WIP → Cr. Raw Material Inventory</strong></p>
                  <p>Completion: <strong>Dr. Finished Goods Inventory → Cr. WIP (Work in Process)</strong></p>
                </div>
                {(wo.journalEntries||[]).length > 0 ? (
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
                        {(wo.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
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
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries — will appear after materials issued and WO completed</div>}
              </div>
            )}
            {activeTab === 'sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/manufacturing/work-orders/${id}/audit`} queryKey={['wo-audit',id!]}/>}
          </div>
        </div>

        {/* Cost summary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="text-xs font-semibold text-slate-600 mb-3">Cost Summary</div>
          <div className="grid grid-cols-5 gap-3 text-xs">
            {[['Material', wo.estimated_material_cost, wo.actual_material_cost],
              ['Labor',    wo.estimated_labor_cost,    wo.actual_labor_cost],
              ['Machine',  wo.estimated_machine_cost,  wo.actual_machine_cost],
              ['Overhead', wo.estimated_overhead_cost, wo.actual_overhead_cost]].map(([label, est, act]:any) => (
              <div key={label} className="bg-slate-50 rounded p-2">
                <div className="text-slate-500 mb-1">{label}</div>
                <div className="text-slate-400 text-xs">Est: {formatCurrency(est||0)}</div>
                <div className="font-semibold text-slate-700">Act: {formatCurrency(act||0)}</div>
              </div>
            ))}
            <div className="bg-blue-50 rounded p-2">
              <div className="text-slate-500 mb-1">Total Actual</div>
              <div className="font-bold text-blue-700 text-sm">{formatCurrency(
                parseFloat(wo.actual_material_cost||0)+parseFloat(wo.actual_labor_cost||0)+parseFloat(wo.actual_machine_cost||0)+parseFloat(wo.actual_overhead_cost||0)
              )}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
