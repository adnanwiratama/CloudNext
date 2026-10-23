import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, ClipboardList, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';

export default function TransferOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines'|'files'|'sysinfo'>('lines');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['transfer-order', id] }); }, [justSaved, id, qc]);

  const { data: order, isLoading } = useQuery({
    queryKey: ['transfer-order', id],
    queryFn: () => api.get(`/api/inventory/transfer-orders/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!order) return;
    print({
      title: 'Transfer Order',
      number: order.transfer_order_number,
      status: (order.status || '').replace(/_/g, ' '),
      partyLabel: 'Transfer',
      partyName: `${order.from_location_name || '-'}  →  ${order.to_location_name || '-'}`,
      meta: [
        { label: 'Order Date', value: formatDate(order.order_date) },
        { label: 'Expected Date', value: order.expected_date ? formatDate(order.expected_date) : '-' },
        { label: 'Priority', value: order.priority || 'normal' },
        { label: 'Created By', value: order.created_by_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Qty Requested', align: 'right', value: (r: any) => Number(r.qty_requested || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 }) },
        { label: 'UOM', value: (r: any) => r.uom_name || '' },
        { label: 'Requested Date', value: (r: any) => (r.requested_date ? formatDate(r.requested_date) : '') },
      ],
      rows: order.lines || [],
      memo: order.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!order) return <div className="p-6 text-red-600">Transfer order not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const num = (v: any, dp = 4) => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: dp });
  const totalQty = (order.lines||[]).reduce((s: number, l: any) => s + Number(l.qty_requested || 0), 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center text-white"><ClipboardList size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Transfer Order</span>
              <span className="text-2xl font-semibold text-slate-500">{order.transfer_order_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/inventory/transfer-orders')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/inventory/transfer-orders')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="transfer_order" to={`/inventory/transfer-orders/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="transfer_order" id={id!} listPath="/inventory/transfer-orders" label={order.transfer_order_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Transfer Order successfully created</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Order Number</div><div className="text-sm font-medium text-blue-700 font-mono">{order.transfer_order_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Order Date</label><input readOnly value={order.order_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">From Location</label><input readOnly value={order.from_location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">To Location</label><input readOnly value={order.to_location_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Expected Transfer Date</label><input readOnly value={order.expected_date?order.expected_date.split('T')[0]:''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Priority</label><input readOnly value={order.priority||'normal'} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={(order.status||'').replace(/_/g,' ')} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={order.memo||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Lines</span><span>{(order.lines||[]).length}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Qty</span><span>{num(totalQty)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines','files','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='lines'?'Items Requested':tab==='files'?'Files':'System Information'}
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
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Requested Date</th>
                  </tr></thead>
                  <tbody>
                    {(order.lines||[]).map((l:any)=>(
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{l.item_code ? `${l.item_code} - ${l.item_name}` : (l.item_name||'-')}</td>
                        <td className="px-3 py-1.5 text-right">{num(l.qty_requested)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.uom_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.requested_date?formatDate(l.requested_date):'-'}</td>
                      </tr>
                    ))}
                    {(order.lines||[]).length===0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 italic">No lines</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="inventory_transfer_order" sourceId={id!}/>}
            {activeTab==='sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Created By</div><div className="text-slate-700">{order.created_by_name||'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{order.created_at?formatDate(order.created_at):'-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Last Modified</div><div className="text-slate-700">{order.updated_at?formatDate(order.updated_at):'-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
