import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, CheckCircle, FileText, Truck, Loader2, CheckCircle2, ShoppingCart } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import toast from 'react-hot-toast';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';

export default function SalesOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['sales-order', id] }); }, [justSaved, id, qc]);

  const { data: so, isLoading } = useQuery({
    queryKey: ['sales-order', id],
    queryFn: () => api.get(`/api/sales/orders/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/orders/${id}/approve`),
    onSuccess: () => { toast.success('Sales order approved'); qc.invalidateQueries({ queryKey: ['sales-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/orders/${id}/reject`, { reason: 'Rejected via UI' }),
    onSuccess: () => { toast.success('Sales order rejected'); qc.invalidateQueries({ queryKey: ['sales-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!so) return <div className="p-6 text-red-600">Sales order not found.</div>;

  const canApprove = so.status === 'pending_approval';
  const canFulfill = ['pending_fulfillment','partially_fulfilled'].includes(so.status);
  const canInvoice = so.fulfillments?.length > 0 && !['pending_approval','cancelled'].includes(so.status);
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-green-600 flex items-center justify-center text-white"><ShoppingCart size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Sales Order</span>
              <span className="text-2xl font-semibold text-slate-500">{so.so_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=sales_order')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/sales/orders')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={() => navigate(`/sales/orders/${id}/edit`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Edit</button>
          {canApprove && <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-60"><CheckCircle size={13}/> Approve</button>}
          {canApprove && <button onClick={() => { if (confirm('Reject?')) rejectMutation.mutate(); }} disabled={rejectMutation.isPending} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-60">Reject</button>}
          {canFulfill && <button onClick={() => navigate(`/sales/fulfillments/new?soId=${id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800"><Truck size={13}/> Fulfillment</button>}
          {canInvoice && <button onClick={() => navigate(`/sales/invoices/new?soId=${id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"><FileText size={13}/> Create Invoice</button>}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Sales Order successfully saved</p></div>
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
                  <div><div className="text-xs text-slate-500 mb-0.5">Order Number</div><div className="text-sm font-medium text-blue-700 font-mono">{so.so_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={so.customer_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Order Date</label><input readOnly value={so.order_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Expected Ship Date</label><input readOnly value={so.expected_ship_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={so.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label><input readOnly value={so.payment_terms||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={so.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={so.department_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Sales Rep</label><input readOnly value={so.sales_rep_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={so.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Total</label><input readOnly value={Number(so.total_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={so.memo||''} className={dis}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={so.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={so.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={so.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs: Items / Files / System Info */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Items':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {/* Items */}
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
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc%</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Fulfilled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(so.lines||[]).length===0 ? <tr><td colSpan={12} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (so.lines||[]).map((l:any,i:number) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-400">{l.line_number||i+1}</td>
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,2)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.discount_percent)>0?`${l.discount_percent}%`:'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.tax_amount)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          <td className="px-3 py-1.5 text-right"><span className={parseFloat(l.qty_fulfilled)>=parseFloat(l.quantity)?'text-emerald-600':'text-amber-600'}>{formatNumber(l.qty_fulfilled,2)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    {(so.lines||[]).length>0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={8} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(so.total_amount)}</td>
                          <td colSpan={3}/>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {/* Related docs */}
                {so.fulfillments?.length>0 && (
                  <div><div className="text-xs font-semibold text-slate-600 mb-1.5">Fulfillments</div>
                    <div className="flex flex-wrap gap-2">{so.fulfillments.map((f:any)=>(
                      <button key={f.id} onClick={()=>navigate(`/sales/fulfillments/${f.id}`)} className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-blue-50">{f.fulfillment_number}</button>
                    ))}</div>
                  </div>
                )}
                {so.invoices?.length>0 && (
                  <div><div className="text-xs font-semibold text-slate-600 mb-1.5">Invoices</div>
                    <div className="flex flex-wrap gap-2">{so.invoices.map((inv:any)=>(
                      <button key={inv.id} onClick={()=>navigate(`/sales/invoices/${inv.id}`)} className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-blue-50">{inv.invoice_number}</button>
                    ))}</div>
                  </div>
                )}
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="sales_order" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded p-3">
                  <span className="font-medium text-blue-800">GL Impact (Sales Invoice): </span>
                  <span className="text-blue-700">Dr. Accounts Receivable → Cr. Revenue Account per line</span>
                </div>
                {(so.journalEntries||[]).length > 0 ? (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Journal #</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Code</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Debit</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Credit</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(so.journalEntries||[]).flatMap((je:any) => (je.lines||[]).map((l:any,i:number) => (
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries posted yet</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/sales/${id}/audit`} queryKey={['so-audit',id!]}/>}
          </div>
        </div>

        {/* Totals summary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(so.subtotal)}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Discount</span><span className="text-red-600">-{formatCurrency(so.discount_amount)}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Tax</span><span>{formatCurrency(so.tax_amount)}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Shipping</span><span>{formatCurrency(so.shipping_amount)}</span></div>
              <div className="flex justify-between py-1.5 font-bold text-sm"><span>Total</span><span className="text-blue-700">{formatCurrency(so.total_amount)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
