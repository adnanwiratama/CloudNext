import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import { Printer } from 'lucide-react';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function TransferInventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'files'|'gl'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['inventory-transfer', id] }); }, [justSaved, id, qc]);

  const { data: tr, isLoading } = useQuery({
    queryKey: ['inventory-transfer', id],
    queryFn: () => api.get(`/api/inventory/transfers/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!tr) return;
    const tv = (tr.lines || []).reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_cost || 0), 0);
    print({
      title: 'Inventory Transfer',
      number: tr.transfer_number,
      status: (tr.status || '').replace(/_/g, ' '),
      partyLabel: 'Transfer',
      partyName: `${tr.from_location_name || '-'}  →  ${tr.to_location_name || '-'}`,
      meta: [
        { label: 'Transfer Date', value: formatDate(tr.transfer_date) },
        { label: 'Reference', value: tr.reference || '-' },
        { label: 'Created By', value: tr.created_by_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Qty', align: 'right', value: (r: any) => Number(r.qty || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 }) },
        { label: 'UOM', value: (r: any) => r.uom_name || '' },
        { label: 'Unit Cost', align: 'right', value: (r: any) => Number(r.unit_cost || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }) },
        { label: 'Total Value', align: 'right', value: (r: any) => (Number(r.qty) * Number(r.unit_cost)).toLocaleString('id-ID', { minimumFractionDigits: 2 }) },
      ],
      rows: tr.lines || [],
      totals: [{ label: 'Total Value', value: tv.toLocaleString('id-ID', { minimumFractionDigits: 2 }), bold: true }],
      memo: tr.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!tr) return <div className="p-6 text-red-600">Transfer not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const num = (v: any, dp = 4) => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: dp });
  const money = (v: any) => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
  const totalValue = (tr.lines||[]).reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_cost || 0), 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-cyan-600 flex items-center justify-center text-white"><ArrowLeftRight size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Transfer Inventory</span>
              <span className="text-2xl font-semibold text-slate-500">{tr.transfer_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/inventory/transfers')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/inventory/transfers')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="transfer_order" to={`/inventory/transfers/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="inventory_transfer" id={id!} listPath="/inventory/transfers" label={tr.transfer_number} />
          <ApprovalBar
            approvalStatus={tr?.approval_status}
            approvedByName={tr?.approved_by_name}
            approvedAt={tr?.approved_at}
            approveUrl={`/api/inventory/transfers/${id}/approve`}
            rejectUrl={`/api/inventory/transfers/${id}/reject`}
            queryKeys={['inventory-transfer', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Inventory Transfer successfully posted</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Transfer Number</div><div className="text-sm font-medium text-blue-700 font-mono">{tr.transfer_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Transfer Date</label><input readOnly value={tr.transfer_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">From Location</label><input readOnly value={tr.from_location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">To Location</label><input readOnly value={tr.to_location_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label><input readOnly value={tr.reference||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={tr.status||''} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><textarea readOnly rows={2} value={tr.memo||''} className={`${dis} resize-none`}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Lines</span><span>{(tr.lines||[]).length}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Value</span><span>{money(totalValue)}</span></div>
                    </div>
                  </div>
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
                {tab==='lines'?'Items Transferred':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='lines' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Item</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">UOM</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Total Value</th>
                  </tr></thead>
                  <tbody>
                    {(tr.lines||[]).map((l:any)=>(
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{l.item_code ? `${l.item_code} - ${l.item_name}` : (l.item_name||'-')}</td>
                        <td className="px-3 py-1.5 text-right">{num(l.qty)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.uom_name||'-'}</td>
                        <td className="px-3 py-1.5 text-right">{money(l.unit_cost)}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{money(Number(l.qty)*Number(l.unit_cost))}</td>
                      </tr>
                    ))}
                    {(tr.lines||[]).length===0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No lines</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="inventory_transfer" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-800">
                  <p className="font-medium mb-1">GL Impact (Inventory Transfer):</p>
                  <p><strong>Dr. Inventory (to location) / Cr. Inventory (from location)</strong></p>
                </div>
                {(tr.journalEntries||[]).length > 0 ? (
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
                        {(tr.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
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
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{tr.created_by_name||'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{tr.created_at?formatDate(tr.created_at):'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Last Modified</div><div className="text-slate-700">{tr.updated_at?formatDate(tr.updated_at):'-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
