import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, CheckCircle, FileText, Truck, Loader2, CheckCircle2, ShoppingCart, Send, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import toast from 'react-hot-toast';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { Printer } from 'lucide-react';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import { useAuthStore } from '../../store/authStore';

export default function SalesOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'related'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['sales-order', id] }); }, [justSaved, id, qc]);

  const { data: so, isLoading } = useQuery({
    queryKey: ['sales-order', id],
    queryFn: () => api.get(`/api/sales/orders/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!so) return;
    print({
      title: 'Sales Order',
      number: so.so_number,
      status: formatStatus(so.status),
      partyLabel: 'Customer',
      partyName: so.customer_name,
      partyLines: [so.billing_address, so.customer_email].filter(Boolean),
      meta: [
        { label: 'Order Date', value: formatDate(so.order_date) },
        { label: 'Expected Ship', value: so.expected_ship_date ? formatDate(so.expected_ship_date) : '-' },
        { label: 'Payment Terms', value: so.payment_terms || '-' },
        { label: 'Currency', value: so.currency || '-' },
        { label: 'Sales Rep', value: so.sales_rep_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || '' },
        { label: 'Unit Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Disc', align: 'right', value: (r: any) => (Number(r.discount_amount) > 0 ? formatCurrency(r.discount_amount) : '-') },
        { label: 'Tax', align: 'right', value: (r: any) => (Number(r.tax_amount) > 0 ? formatCurrency(r.tax_amount) : '-') },
        { label: 'Amount', align: 'right', value: (r: any) => formatCurrency(r.amount) },
      ],
      rows: so.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(so.subtotal) },
        { label: 'Discount', value: formatCurrency(so.discount_amount) },
        { label: 'Tax', value: formatCurrency(so.tax_amount) },
        { label: 'Shipping', value: formatCurrency(so.shipping_amount) },
        { label: 'Total', value: formatCurrency(so.total_amount), bold: true },
      ],
      memo: so.memo,
    });
  };

  // Live per-location stock (Available / On Hand) for the SO's location — mirrors the input form
  const [stockMap, setStockMap] = useState<Record<string, { onHand: number; available: number }>>({});
  const soItemKey = (so?.lines || []).map((l: any) => l.item_id).filter(Boolean).join(',');
  useEffect(() => {
    const ids = Array.from(new Set((so?.lines || []).map((l: any) => l.item_id).filter(Boolean)));
    if (ids.length === 0) { setStockMap({}); return; }
    const params: any = { itemIds: ids.join(',') };
    if (so?.location_id) params.locationId = so.location_id;
    api.get('/api/sales/stock', { params })
      .then(r => setStockMap(r.data.data || {}))
      .catch(() => setStockMap({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soItemKey, so?.location_id]);

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/orders/${id}/approve`),
    onSuccess: () => { toast.success('Sales order approved'); qc.invalidateQueries({ queryKey: ['sales-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/orders/${id}/reject`, { reason: 'Rejected via UI' }),
    onSuccess: () => { toast.success('Sales order rejected — returned to Draft'); qc.invalidateQueries({ queryKey: ['sales-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  const user = useAuthStore(s => s.user);
  const submitMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/orders/${id}/submit`),
    onSuccess: () => { toast.success('Submitted for approval'); qc.invalidateQueries({ queryKey: ['sales-order', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });
  const canApproveReject = user?.isAdmin || (so?.configured_approver_id && user?.id === so.configured_approver_id);

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
          <EditTransactionButton permKey="sales_order" to={`/sales/orders/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {canFulfill && <button onClick={() => navigate(`/sales/fulfillments/new?soId=${id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800"><Truck size={13}/> Fulfillment</button>}
          {canInvoice && <button onClick={() => navigate(`/sales/invoices/new?soId=${id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"><FileText size={13}/> Create Invoice</button>}
          <DeleteTransactionButton type="sales_order" id={id!} listPath="/sales/orders" label={so.so_number} />
          
          {/* Approval buttons */}
          {so.status === 'draft' && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
              {submitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Submit for Approval
            </button>
          )}
          {so.status === 'pending_approval' && canApproveReject && (
            <>
              <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-60">
                {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Approve
              </button>
              <button onClick={() => { if (confirm('Reject this SO?')) rejectMutation.mutate(); }} disabled={rejectMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-60">
                {rejectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Reject
              </button>
            </>
          )}
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
                {/* Column 1 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={so.customer_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Order Date</label><input readOnly value={so.order_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Expected Ship Date</label><input readOnly value={so.expected_ship_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                {/* Column 2 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={so.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label><input readOnly value={so.payment_terms||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={so.memo||''} className={dis}/></div>
                </div>
                {/* Column 3 — Approval + Summary */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Approved By</label><input readOnly value={so.approved_by_name||so.configured_approver_name||'—'} className={dis}/></div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Approval Status</label>
                    <div className={`w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 font-medium ${
                      so.status==='pending_fulfillment'||so.status==='fulfilled'||so.status==='partially_fulfilled'?'text-emerald-600':
                      so.status==='pending_approval'?'text-amber-600':
                      so.status==='cancelled'?'text-red-600':'text-slate-600'
                    }`}>
                      {so.status==='pending_fulfillment'||so.status==='fulfilled'||so.status==='partially_fulfilled'?'Approved':
                       so.status==='pending_approval'?'Pending Approval':
                       so.status==='cancelled'?'Cancelled':'Draft'}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(so.subtotal)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{formatCurrency(so.discount_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{formatCurrency(so.tax_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Shipping</span><span>{formatCurrency(so.shipping_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{formatCurrency(so.total_amount)}</span></div>
                    </div>
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
            {(['items','related','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Items':tab==='related'?'Related Records':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
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
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Disc %</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Disc Account</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Fulfilled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(so.lines||[]).length===0 ? <tr><td colSpan={16} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (so.lines||[]).map((l:any) => {
                        const s = stockMap[l.item_id];
                        // Stock is stored in base units; show it in the line's unit (base qty / rate).
                        const rate = Number(l.uom_rate) > 0 ? Number(l.uom_rate) : 1;
                        const availInUnit = s ? Number(s.available) / rate : 0;
                        const onHandInUnit = s ? Number(s.onHand) / rate : 0;
                        return (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600">{formatNumber(availInUnit,2)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{formatNumber(onHandInUnit,2)}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,2)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.discount_percent)>0?`${l.discount_percent}%`:'-'}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.discount_amount)>0?formatCurrency(l.discount_amount):'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{Number(l.discount_amount)>0?(so.discount_account_name||so.discount_account_code||'-'):'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.tax_code||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.tax_amount)>0?formatCurrency(l.tax_amount):'-'}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{so.department_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{so.location_name||'-'}</td>
                          <td className="px-3 py-1.5 text-right"><span className={parseFloat(l.qty_fulfilled)>=parseFloat(l.quantity)?'text-emerald-600':'text-amber-600'}>{formatNumber(l.qty_fulfilled,2)}</span></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {activeTab==='related' && (() => {
              const related = [
                ...(so.fulfillments||[]).map((f:any) => ({ id:f.id, date:f.fulfillment_date, type:'Item Fulfillment', doc:f.fulfillment_number, status:f.status, amount:null, path:`/sales/fulfillments/${f.id}` })),
                ...(so.invoices||[]).map((inv:any) => ({ id:inv.id, date:inv.invoice_date, type:'Invoice', doc:inv.invoice_number, status:inv.status, amount:inv.total_amount, path:`/sales/invoices/${inv.id}` })),
              ].sort((a,b)=> new Date(a.date||0).getTime() - new Date(b.date||0).getTime());
              return related.length === 0
                ? <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records yet</div>
                : (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Document #</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Status</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {related.map(r => (
                          <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5">{r.date ? formatDate(r.date) : '-'}</td>
                            <td className="px-3 py-1.5 text-slate-700">{r.type}</td>
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(r.path)} className="text-blue-600 hover:underline font-mono">{r.doc}</button></td>
                            <td className="px-3 py-1.5"><span className="capitalize">{String(r.status||'').replace(/_/g,' ')}</span></td>
                            <td className="px-3 py-1.5 text-right font-medium">{r.amount != null ? formatCurrency(r.amount) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
            })()}
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

      </div>
    </div>
  );
}
