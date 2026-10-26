import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import { Printer } from 'lucide-react';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function InventoryAdjustmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'files'|'gl'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['inventory-adjustment', id] }); }, [justSaved, id, qc]);

  const { data: adj, isLoading } = useQuery({
    queryKey: ['inventory-adjustment', id],
    queryFn: () => api.get(`/api/inventory/adjustments/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!adj) return;
    print({
      title: 'Inventory Adjustment',
      number: adj.adjustment_number,
      status: (adj.status || '').replace(/_/g, ' '),
      partyLabel: 'Adjustment Account',
      partyName: adj.account_code ? `${adj.account_code} - ${adj.account_name}` : '',
      meta: [
        { label: 'Adjustment Date', value: formatDate(adj.adjustment_date) },
        { label: 'Type', value: (adj.adjustment_type || '').replace(/_/g, ' ') },
        { label: 'Created By', value: adj.created_by_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Location', value: (r: any) => r.location_name || '' },
        { label: 'Adjust Qty', align: 'right', value: (r: any) => Number(r.adjust_qty || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 }) },
        { label: 'UOM', value: (r: any) => r.uom_name || '' },
        { label: 'Unit Cost', align: 'right', value: (r: any) => Number(r.unit_cost || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }) },
        { label: 'Value Impact', align: 'right', value: (r: any) => (Number(r.adjust_qty) * Number(r.unit_cost)).toLocaleString('id-ID', { minimumFractionDigits: 2 }) },
        { label: 'Reason', value: (r: any) => r.reason || '' },
      ],
      rows: adj.lines || [],
      memo: adj.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!adj) return <div className="p-6 text-red-600">Adjustment not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const num = (v: any, dp = 4) => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: dp });
  const money = (v: any) => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
  const rateOf = (l: any) => { const r = Number(l.conversion_rate_to_base || 0); return r > 0 ? r : 1; };
  const inUnit = (base: any, l: any) => num(Number(base || 0) / rateOf(l));

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center text-white"><SlidersHorizontal size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Inventory Adjustment</span>
              <span className="text-2xl font-semibold text-slate-500">{adj.adjustment_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/inventory/adjustments')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/inventory/adjustments')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="inventory_adjustment" to={`/inventory/adjustments/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="inventory_adjustment" id={id!} listPath="/inventory/adjustments" label={adj.adjustment_number} />
          <ApprovalBar
            approvalStatus={adj?.approval_status}
            approvedByName={adj?.approved_by_name}
            approvedAt={adj?.approved_at}
            approveUrl={`/api/inventory/adjustments/${id}/approve`}
            rejectUrl={`/api/inventory/adjustments/${id}/reject`}
            queryKeys={['inventory-adjustment', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Inventory Adjustment successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Adjustment Number</div><div className="text-sm font-medium text-blue-700 font-mono">{adj.adjustment_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Adjustment Date</label><input readOnly value={adj.adjustment_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Adjustment Type</label><input readOnly value={(adj.adjustment_type||'').replace(/_/g,' ')} className={`${dis} capitalize`}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Adjustment Account</label><input readOnly value={adj.account_code ? `${adj.account_code} - ${adj.account_name}` : ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={adj.status||''} className={`${dis} capitalize`}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><textarea readOnly rows={3} value={adj.memo||''} className={`${dis} resize-none`}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='lines'?'Adjustment Lines':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='lines' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Item</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Location</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Adjust Qty (+/-)</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">UOM</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Value Impact</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Reason</th>
                  </tr></thead>
                  <tbody>
                    {(adj.lines||[]).map((l:any)=>(
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{l.item_code ? `${l.item_code} - ${l.item_name}` : (l.item_name||'-')}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.location_name||'-'}</td>
                        <td className={`px-3 py-1.5 text-right ${Number(l.adjust_qty)<0?'text-red-600':'text-emerald-600'}`}>{num(l.adjust_qty)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.uom_name||'-'}</td>
                        <td className="px-3 py-1.5 text-right">{money(l.unit_cost)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${Number(l.adjust_qty)*Number(l.unit_cost)<0?'text-red-600':'text-emerald-600'}`}>{money(Number(l.adjust_qty)*Number(l.unit_cost))}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.reason||'-'}</td>
                      </tr>
                    ))}
                    {(adj.lines||[]).length===0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">No lines</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="inventory_adjustment" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Inventory Adjustment):</p>
                  <p>Increase → <strong>Dr. Inventory / Cr. Adjustment Account</strong>. Decrease → <strong>Dr. Adjustment Account / Cr. Inventory</strong>.</p>
                </div>
                {(adj.journalEntries||[]).length > 0 ? (
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
                        {(adj.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit||0)>0?money(l.debit):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit||0)>0?money(l.credit):''}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries posted yet</div>}
              </div>
            )}
            {activeTab==='sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{adj.created_by_name||'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{adj.created_at?formatDate(adj.created_at):'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Last Modified</div><div className="text-slate-700">{adj.updated_at?formatDate(adj.updated_at):'-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
