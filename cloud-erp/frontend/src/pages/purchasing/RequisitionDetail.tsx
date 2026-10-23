import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, ClipboardList, ArrowRightCircle, Printer, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import toast from 'react-hot-toast';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;
  const { vendors } = useFormOptions();

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'related' | 'files' | 'sysinfo'>('items');
  const [convertOpen, setConvertOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['requisition', id] }); }, [justSaved, id, qc]);

  const { data: pr, isLoading } = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api.get(`/api/purchasing/requisitions/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!pr) return;
    print({
      title: 'Purchase Requisition',
      number: pr.requisition_number,
      status: formatStatus(pr.status),
      partyLabel: 'Requested By',
      partyName: pr.requested_by_name || '-',
      meta: [
        { label: 'Request Date', value: formatDate(pr.request_date) },
        { label: 'Required Date', value: pr.required_date ? formatDate(pr.required_date) : '-' },
        { label: 'Priority', value: pr.priority || 'normal' },
        { label: 'Department', value: pr.department_name || '-' },
        { label: 'Location', value: pr.location_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || r.uom_name || r.unit || '' },
        { label: 'Est. Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Est. Total', align: 'right', value: (r: any) => formatCurrency(r.amount) },
      ],
      rows: pr.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(Number(pr.total_amount) - Number(pr.shipping_amount || 0) - Number(pr.tax_amount || 0)) },
        { label: 'Shipping', value: formatCurrency(pr.shipping_amount) },
        { label: 'Total Estimated', value: formatCurrency(pr.total_amount), bold: true },
      ],
      memo: pr.memo,
    });
  };

  const convertMutation = useMutation({
    mutationFn: () => api.post(`/api/purchasing/requisitions/${id}/convert`, { vendorId }),
    onSuccess: (res: any) => { const poId = res.data?.data?.id; toast.success('Converted to Purchase Order'); setConvertOpen(false); if (poId) navigate(`/purchasing/orders/${poId}`, { state: { justSaved: true } }); else qc.invalidateQueries({ queryKey: ['requisition', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to convert'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!pr) return <div className="p-6 text-red-600">Requisition not found.</div>;

  const isConverted = pr.status === 'converted' || !!pr.po_id;
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center text-white"><ClipboardList size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Purchase Requisition</span>
              <span className="text-2xl font-semibold text-slate-500">{pr.requisition_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/requisitions')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=purchase_requisition')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/purchasing/requisitions')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {!isConverted && <EditTransactionButton permKey="purchase_requisition" to={`/purchasing/requisitions/${id}/edit`} />}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {!isConverted && <button onClick={() => setConvertOpen(true)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"><ArrowRightCircle size={13}/> Convert to Purchase Order</button>}
          <DeleteTransactionButton type="purchase_requisition" id={id!} listPath="/purchasing/requisitions" label={pr.requisition_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Purchase Requisition successfully saved</p></div>
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
                  <div><label className="block text-xs text-slate-500 mb-1">Request Date</label><input readOnly value={pr.request_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Required Date</label><input readOnly value={pr.required_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Requested By</label><input readOnly value={pr.requested_by_name || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={formatStatus(pr.status)} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Priority</label><input readOnly value={pr.priority || 'normal'} className={`${dis} capitalize`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={pr.memo || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Shipping</span><span>{formatCurrency(pr.shipping_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Estimated</span><span>{formatCurrency(pr.total_amount)}</span></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={pr.subsidiary_name || ''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={pr.department_name || ''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={pr.location_name || ''} className={dis}/></div>
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
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Est. Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Est. Total</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pr.lines || []).length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (pr.lines || []).map((l: any) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity, 2)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.uom_code || l.uom_name || l.unit || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.department_name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.location_name || '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'related' && (
              pr.po_id ? (
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
                        <td className="px-3 py-1.5 text-slate-700">Purchase Order</td>
                        <td className="px-3 py-1.5"><button onClick={() => navigate(`/purchasing/orders/${pr.po_id}`)} className="text-blue-600 hover:underline font-mono">{pr.po_number}</button></td>
                        <td className="px-3 py-1.5 capitalize">Converted</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records yet</div>
            )}
            {activeTab === 'files' && <TransactionFilesTab sourceType="purchase_requisition" sourceId={id!}/>}
            {activeTab === 'sysinfo' && (
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-w-2xl">
                <div><div className="text-xs text-slate-500 mb-0.5">Requested By</div><div className="text-slate-700">{pr.requested_by_name || '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Date Created</div><div className="text-slate-700">{pr.created_at ? formatDate(pr.created_at) : '-'}</div></div>
                <div><div className="text-xs text-slate-500 mb-0.5">Last Modified</div><div className="text-slate-700">{pr.updated_at ? formatDate(pr.updated_at) : '-'}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert modal — pick the vendor for the new Purchase Order */}
      {convertOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConvertOpen(false)}>
          <div className="bg-white rounded shadow-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800">Convert to Purchase Order</h3>
              <button onClick={() => setConvertOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500">Select the vendor for the new Purchase Order. The requisition lines will be copied over.</p>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Vendor <span className="text-red-500">*</span></label>
                <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 bg-white">
                  <option value="">-- Select Vendor --</option>
                  {(vendors || []).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200">
              <button onClick={() => setConvertOpen(false)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={() => { if (!vendorId) { toast.error('Select a vendor'); return; } convertMutation.mutate(); }} disabled={convertMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-60">
                {convertMutation.isPending ? <Loader2 size={13} className="animate-spin"/> : <ArrowRightCircle size={13}/>} Convert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
