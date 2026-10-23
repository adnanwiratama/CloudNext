import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, FileText, ArrowRightCircle, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import toast from 'react-hot-toast';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import { QUOTATION_STATUSES } from './QuotationForm';

const statusLabel = (v: string) => QUOTATION_STATUSES.find(s => s.value === v)?.label || (v ? v.replace(/_/g, ' ') : '-');

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'related' | 'files' | 'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['quotation', id] }); }, [justSaved, id, qc]);

  const { data: q, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.get(`/api/sales/quotations/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/api/sales/quotations/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update status'),
  });

  const convertMutation = useMutation({
    mutationFn: () => api.post(`/api/sales/quotations/${id}/convert`, {}),
    onSuccess: (res: any) => { const soId = res.data?.data?.id; toast.success('Converted to Sales Order'); if (soId) navigate(`/sales/orders/${soId}`, { state: { justSaved: true } }); else qc.invalidateQueries({ queryKey: ['quotation', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to convert'),
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!q) return;
    print({
      title: 'Quotation',
      number: q.quotation_number,
      status: formatStatus(q.status),
      partyLabel: 'Customer',
      partyName: q.customer_name,
      partyLines: [q.billing_address, q.customer_email].filter(Boolean),
      meta: [
        { label: 'Quotation Date', value: formatDate(q.quotation_date) },
        { label: 'Valid Until', value: q.expiry_date ? formatDate(q.expiry_date) : '-' },
        { label: 'Currency', value: q.currency || '-' },
        { label: 'Sales Rep', value: q.sales_rep_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || r.uom_name || '' },
        { label: 'Unit Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Disc', align: 'right', value: (r: any) => (Number(r.discount_amount) > 0 ? formatCurrency(r.discount_amount) : '-') },
        { label: 'Tax', align: 'right', value: (r: any) => (Number(r.tax_amount) > 0 ? formatCurrency(r.tax_amount) : '-') },
        { label: 'Amount', align: 'right', value: (r: any) => formatCurrency(r.amount) },
      ],
      rows: q.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(q.subtotal) },
        { label: 'Discount', value: formatCurrency(q.discount_amount) },
        { label: 'Tax', value: formatCurrency(q.tax_amount) },
        { label: 'Shipping', value: formatCurrency(q.shipping_amount) },
        { label: 'Total', value: formatCurrency(q.total_amount), bold: true },
      ],
      memo: q.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!q) return <div className="p-6 text-red-600">Quotation not found.</div>;

  const isConverted = q.status === 'converted' || !!q.so_id;
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Quotation</span>
              <span className="text-2xl font-semibold text-slate-500">{q.quotation_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/quotations')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=quotation')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/sales/quotations')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {!isConverted && <EditTransactionButton permKey="quotation" to={`/sales/quotations/${id}/edit`} />}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {/* Status dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Status:</span>
            <select value={QUOTATION_STATUSES.some(s => s.value === q.status) ? q.status : ''} disabled={isConverted || statusMutation.isPending}
              onChange={e => statusMutation.mutate(e.target.value)}
              className="border border-slate-300 rounded text-sm px-2 py-1.5 bg-white disabled:bg-slate-50">
              {!QUOTATION_STATUSES.some(s => s.value === q.status) && <option value="">{statusLabel(q.status)}</option>}
              {QUOTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {!isConverted && <button onClick={() => { if (confirm('Convert this quotation to a Sales Order?')) convertMutation.mutate(); }} disabled={convertMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-60"><ArrowRightCircle size={13}/> Convert to Sales Order</button>}
          <DeleteTransactionButton type="quotation" id={id!} listPath="/sales/quotations" label={q.quotation_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Quotation successfully saved</p></div>
          </div>
        )}

        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={q.customer_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Quotation Date</label><input readOnly value={q.quotation_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Expiry / Valid Until</label><input readOnly value={q.expiry_date?.split('T')[0] || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={statusLabel(q.status)} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={q.currency || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={q.memo || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(q.subtotal)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{formatCurrency(q.discount_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{formatCurrency(q.tax_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Shipping</span><span>{formatCurrency(q.shipping_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{formatCurrency(q.total_amount)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={q.subsidiary_name || ''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={q.department_name || ''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={q.location_name || ''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items', 'related', 'files', 'sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'items' ? 'Items' : tab === 'related' ? 'Related Records' : tab === 'files' ? 'Files' : 'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'items' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Disc %</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(q.lines || []).length === 0 ? <tr><td colSpan={10} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (q.lines || []).map((l: any) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity, 2)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code || l.uom_name || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.discount_percent) > 0 ? `${l.discount_percent}%` : '-'}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.discount_amount) > 0 ? formatCurrency(l.discount_amount) : '-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.tax_code || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{Number(l.tax_amount) > 0 ? formatCurrency(l.tax_amount) : '-'}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'related' && (
              q.so_id ? (
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Document #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 text-slate-700">Sales Order</td>
                        <td className="px-3 py-1.5"><button onClick={() => navigate(`/sales/orders/${q.so_id}`)} className="text-blue-600 hover:underline font-mono">{q.so_number}</button></td>
                        <td className="px-3 py-1.5 capitalize">Converted</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records yet</div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="quotation" sourceId={id!}/>}
            {activeTab === 'sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Sales Rep</div><div className="text-slate-700">{q.sales_rep_name || '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{q.created_at ? formatDate(q.created_at) : '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Last Modified</div><div className="text-slate-700">{q.updated_at ? formatDate(q.updated_at) : '-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
