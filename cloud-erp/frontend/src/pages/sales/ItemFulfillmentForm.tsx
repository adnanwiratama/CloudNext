import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Truck } from 'lucide-react';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';
import FulfillOrdersWorklist from './FulfillOrdersWorklist';

export default function ItemFulfillmentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const soId = searchParams.get('soId');
  const { locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'>('items');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({ fulfillmentDate: new Date().toISOString().split('T')[0], locationId: '', departmentId: '', subsidiaryId: '', carrier: '', trackingNumber: '', memo: '' });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [lines, setLines] = useState<Array<{ soLineId: string; itemId: string; quantity: number; maxQty: number; itemCode: string; itemName: string; uomId: string; uomCode: string; uomRate: number; qtyOnHand: number; qtyAvailable: number; }>>([]);

  // Load SO detail
  const { data: so, isLoading } = useQuery({
    queryKey: ['so-for-fulfillment', soId],
    queryFn: () => api.get(`/api/sales/orders/${soId}`).then(r => r.data.data),
    enabled: !!soId,
  });

  // Auto-populate lines from SO
  useEffect(() => {
    if (so?.lines) {
      set('locationId', so.location_id || '');
      set('departmentId', so.department_id || '');
      set('subsidiaryId', so.subsidiary_id || '');
      setLines(
        so.lines
          .filter((l: any) => parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0) > 0)
          .map((l: any) => ({
            soLineId: l.id,
            itemId: l.item_id,
            quantity: parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0),
            maxQty: parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0),
            itemCode: l.item_code,
            itemName: l.item_name,
            uomId: l.uom_id || '',
            uomCode: l.uom_code || l.uom_name || 'EA',
            uomRate: Number(l.uom_rate) > 0 ? Number(l.uom_rate) : 1,
            qtyOnHand: 0,
            qtyAvailable: 0,
          }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [so]);

  // Fetch per-location stock whenever the header location changes or the SO loads
  const stockKey = `${form.locationId}|${lines.map(l => l.itemId).join(',')}`;
  useEffect(() => {
    const ids = Array.from(new Set(lines.map(l => l.itemId).filter(Boolean)));
    if (ids.length === 0) return;
    const params: any = { itemIds: ids.join(',') };
    if (form.locationId) params.locationId = form.locationId;
    api.get('/api/sales/stock', { params })
      .then(r => r.data.data || {})
      .catch(() => ({}))
      .then((map: Record<string, any>) => {
        setLines(prev => prev.map(l => {
          const s = map[l.itemId];
          return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : { ...l, qtyOnHand: 0, qtyAvailable: 0 };
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockKey]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post(`/api/sales/orders/${soId}/fulfill`, data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      try { await uploadFileRows(fileRows, 'item_fulfillment', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(`Item Fulfillment ${res.data.data.fulfillment_number} created`);
      navigate(`/sales/fulfillments/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create fulfillment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!soId) { toast.error('No Sales Order selected'); return; }
    const validLines = lines.filter(l => l.quantity > 0);
    if (!validLines.length) { toast.error('At least one item with quantity > 0 is required'); return; }
    mutation.mutate({
      fulfillmentDate: form.fulfillmentDate,
      locationId: form.locationId || null,
      subsidiaryId: form.subsidiaryId || null,
      departmentId: form.departmentId || null,
      trackingNumber: form.trackingNumber || undefined,
      carrier: form.carrier || undefined,
      memo: form.memo || undefined,
      lines: validLines.map(l => ({ soLineId: l.soLineId, itemId: l.itemId, quantity: l.quantity, uomId: l.uomId || null })),
    });
  };

  // No SO selected → show the "Fulfill Orders" worklist of everything pending fulfillment.
  if (!soId) return <FulfillOrdersWorklist />;
  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!so) return <div className="p-6 text-red-600">Sales order not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Truck size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Item Fulfillment</span>
              <span className="text-sm text-slate-500">{so.so_number} — {so.customer_name}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/fulfillments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=item_fulfillment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="ff-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(`/sales/orders/${soId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="ff-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div><label className="block text-xs text-slate-500 mb-1">Sales Order</label><input readOnly value={so.so_number} className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-blue-700 font-mono"/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={so.customer_name} className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700"/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Fulfillment Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.fulfillmentDate} onChange={e=>set('fulfillmentDate',e.target.value)} className={dis} required/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Carrier / Shipping Method</label>
                    <input type="text" value={form.carrier} onChange={e=>set('carrier',e.target.value)} className={dis} placeholder="e.g. JNE, TIKI, SiCepat"/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Tracking Number</label>
                    <input type="text" value={form.trackingNumber} onChange={e=>set('trackingNumber',e.target.value)} className={dis} placeholder="Tracking / Resi number"/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                    <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`} placeholder="Shipping notes, special instructions..."/></div>
                  {so.shipping_address && (
                    <div className="col-span-3"><label className="block text-xs text-slate-500 mb-1">Ship To Address</label>
                      <div className="text-sm text-slate-600 bg-slate-50 rounded p-2 border border-slate-200">{so.shipping_address}</div></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary <span className="text-slate-400">(from SO)</span></label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={`${dis} bg-slate-50`}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Ship From Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}><option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                </div>
              </div>
            )}
          </div>

          {/* Items / Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['items','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='items'?`Items (${lines.length})`:'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab==='items' && (
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Item Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Item Name</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Ordered</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Already Shipped</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Ship Now *</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length===0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400 italic">All items already fulfilled</td></tr>
                      : lines.map((line, idx) => {
                        const soLine = so.lines?.find((l:any)=>l.id===line.soLineId);
                        const alreadyShipped = soLine ? parseFloat(soLine.quantity)-line.maxQty : 0;
                        return (
                          <tr key={line.soLineId} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-400">{idx+1}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{line.itemCode}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{line.itemName}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{(line.qtyAvailable / (line.uomRate || 1)).toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{(line.qtyOnHand / (line.uomRate || 1)).toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">{parseFloat(soLine?.quantity||0).toLocaleString('id-ID')}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{alreadyShipped.toLocaleString('id-ID')}</td>
                            <td className="px-1.5 py-1">
                              <input type="number" min="0" max={line.maxQty} step="0.01" value={line.quantity}
                                onChange={e=>setLines(prev=>prev.map((l,i)=>i===idx?{...l,quantity:Math.min(parseFloat(e.target.value)||0,l.maxQty)}:l))}
                                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">{line.uomCode}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* GL hint */}
          <div className="text-xs text-slate-500 px-1">
            <strong className="text-slate-600">GL Impact:</strong> Dr. COGS → Cr. Finished Goods Inventory. Cost of goods is recognized at fulfillment (not at Invoice).
          </div>

          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="ff-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(`/sales/orders/${soId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
