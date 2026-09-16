import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, CheckCircle, Package, FileText, Loader2, CheckCircle2, ShoppingCart } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { StatusBadge } from '../../components/common/DataTable';
import toast from 'react-hot-toast';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['purchase-order', id] }); }, [justSaved, id, qc]);

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get(`/api/purchasing/orders/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/purchasing/orders/${id}/approve`),
    onSuccess: () => { toast.success('PO approved'); qc.invalidateQueries({ queryKey: ['purchase-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/api/purchasing/orders/${id}/reject`, { reason: 'Rejected via UI' }),
    onSuccess: () => { toast.success('PO rejected'); qc.invalidateQueries({ queryKey: ['purchase-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const billMutation = useMutation({
    mutationFn: () => api.post(`/api/purchasing/orders/${id}/bill`, { billDate: new Date().toISOString().split('T')[0] }),
    onSuccess: () => { toast.success('Vendor bill created'); qc.invalidateQueries({ queryKey: ['purchase-order', id] }); navigate('/purchasing/bills'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!po) return <div className="p-6 text-red-600">Purchase order not found.</div>;

  const canApprove = po.status === 'pending_approval';
  const canReceive = ['approved','pending_receipt','partially_received'].includes(po.status);
  const canBill = po.receipts?.length > 0 && !['pending_approval','cancelled'].includes(po.status);
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center text-white"><ShoppingCart size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Purchase Order</span>
              <span className="text-2xl font-semibold text-slate-500">{po.po_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=purchase_order')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/purchasing/orders')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={() => navigate(`/purchasing/orders/${id}/edit`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Edit</button>
          {canApprove && <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-60"><CheckCircle size={13}/> Approve</button>}
          {canApprove && <button onClick={() => { if (confirm('Reject?')) rejectMutation.mutate(); }} disabled={rejectMutation.isPending} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-60">Reject</button>}
          {canReceive && <button onClick={() => navigate(`/purchasing/receipts/new?poId=${id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800"><Package size={13}/> Good Receipt</button>}
          {canBill && <button onClick={() => billMutation.mutate()} disabled={billMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-60">{billMutation.isPending?<Loader2 size={12} className="animate-spin"/>:<FileText size={13}/>} Create Bill</button>}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Purchase Order successfully saved</p></div>
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
                  <div><div className="text-xs text-slate-500 mb-0.5">PO Number</div><div className="text-sm font-medium text-blue-700 font-mono">{po.po_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={po.vendor_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Order Date</label><input readOnly value={po.order_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Expected Receipt</label><input readOnly value={po.expected_receipt_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={po.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label><input readOnly value={po.payment_terms||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={po.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={po.department_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={po.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Total</label><input readOnly value={Number(po.total_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Approved By</label><input readOnly value={po.approved_by_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={po.memo||''} className={dis}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={po.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={po.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={po.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Items':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='items' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-14">UOM</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(po.lines||[]).length===0 ? <tr><td colSpan={11} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (po.lines||[]).map((l:any,i:number)=>(
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-400">{l.line_number||i+1}</td>
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,2)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.tax_amount)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          <td className="px-3 py-1.5 text-right"><span className={parseFloat(l.qty_received)>=parseFloat(l.quantity)?'text-emerald-600':'text-amber-600'}>{formatNumber(l.qty_received,2)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    {(po.lines||[]).length>0&&(
                      <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={7} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(po.total_amount)}</td>
                        <td colSpan={3}/>
                      </tr></tfoot>
                    )}
                  </table>
                </div>
                {po.receipts?.length>0 && <div><div className="text-xs font-semibold text-slate-600 mb-1.5">Goods Receipts</div><div className="flex flex-wrap gap-2">{po.receipts.map((r:any)=><button key={r.id} onClick={()=>navigate(`/purchasing/receipts/${r.id}`)} className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-blue-50">{r.receipt_number}</button>)}</div></div>}
                {po.bills?.length>0 && <div><div className="text-xs font-semibold text-slate-600 mb-1.5">Vendor Bills</div><div className="flex flex-wrap gap-2">{po.bills.map((b:any)=><button key={b.id} onClick={()=>navigate(`/purchasing/bills/${b.id}`)} className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-blue-50">{b.bill_number}</button>)}</div></div>}
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="purchase_order" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-amber-50 border border-amber-100 rounded p-3 text-amber-800">
                  <p className="font-medium mb-1">GL Impact (3-Way Match):</p>
                  <p>① Goods Receipt: <strong>Dr. Inventory → Cr. Accrued AP/GR-IR (2110)</strong></p>
                  <p>② Vendor Bill: <strong>Dr. Accrued AP (2110) → Cr. Accounts Payable (2100)</strong></p>
                  <p>③ Payment: <strong>Dr. Accounts Payable (2100) → Cr. Bank</strong></p>
                </div>
                {(po.bills||[]).length > 0 ? (
                  <div className="space-y-2">
                    {(po.bills||[]).map((b:any) => (
                      <div key={b.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-200 text-xs">
                        <button onClick={()=>navigate(`/purchasing/bills/${b.id}`)} className="text-blue-600 hover:underline font-mono">{b.bill_number}</button>
                        <span className="text-slate-500">{new Date(b.bill_date).toLocaleDateString('id-ID')}</span>
                        <span className="font-medium">{Number(b.total_amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${b.is_posted?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{b.is_posted?'Posted':'Pending'}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries — goods receipt and vendor bill not created yet</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/purchasing/orders/${id}/audit`} queryKey={['po-audit',id!]}/>}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="flex justify-end"><div className="w-60 space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(po.subtotal)}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Tax</span><span>{formatCurrency(po.tax_amount)}</span></div>
            <div className="flex justify-between py-1.5 font-bold text-sm"><span>Total</span><span className="text-blue-700">{formatCurrency(po.total_amount)}</span></div>
          </div></div>
        </div>
      </div>
    </div>
  );
}
