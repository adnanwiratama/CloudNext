import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Package } from 'lucide-react';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export default function GoodReceiptForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poId = searchParams.get('poId');
  const { locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'>('items');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({ receiptDate: new Date().toISOString().split('T')[0], locationId: '', departmentId: '', subsidiaryId: '', memo: '' });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [lines, setLines] = useState<Array<{ poLineId: string; itemId: string; quantity: number; maxQty: number; itemCode: string; itemName: string; uomCode: string; unitCost: number; departmentId: string; locationId: string; }>>([]);

  const { data: po, isLoading } = useQuery({ queryKey: ['po-for-receipt', poId], queryFn: () => api.get(`/api/purchasing/orders/${poId}`).then(r => r.data.data), enabled: !!poId });

  useEffect(() => {
    if (po?.lines) {
      set('locationId', po.location_id || '');
      set('departmentId', po.department_id || '');
      setLines(po.lines.filter((l: any) => parseFloat(l.quantity) - parseFloat(l.qty_received || 0) > 0).map((l: any) => ({
        poLineId: l.id, itemId: l.item_id,
        quantity: parseFloat(l.quantity) - parseFloat(l.qty_received || 0),
        maxQty: parseFloat(l.quantity) - parseFloat(l.qty_received || 0),
        itemCode: l.item_code, itemName: l.item_name, uomCode: l.uom_code || 'EA',
        unitCost: parseFloat(l.unit_price || 0), departmentId: l.department_id || '', locationId: l.location_id || '',
      })));
    }
  }, [po]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post(`/api/purchasing/orders/${poId}/receive`, data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      try { await uploadFileRows(fileRows, 'item_receipt', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(`Good Receipt ${res.data.data.receipt_number} created`);
      navigate(`/purchasing/receipts/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create good receipt'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poId) { toast.error('No Purchase Order selected'); return; }
    const validLines = lines.filter(l => l.quantity > 0);
    if (!validLines.length) { toast.error('At least one item with quantity > 0'); return; }
    mutation.mutate({ ...form, locationId: form.locationId || null, departmentId: form.departmentId || null, lines: validLines.map(l => ({ poLineId: l.poLineId, itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost, departmentId: l.departmentId || null, locationId: l.locationId || null })) });
  };

  if (!poId) return <div className="flex items-center justify-center h-64 text-slate-500"><div className="text-center"><Package size={40} className="mx-auto mb-3 opacity-30"/><p>No Purchase Order specified.</p><button onClick={() => navigate('/purchasing/orders')} className="mt-3 px-3 py-1.5 bg-blue-700 text-white text-sm rounded">Go to Purchase Orders</button></div></div>;
  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!po) return <div className="p-6 text-red-600">Purchase order not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white"><Package size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Item Receipt</span>
              <span className="text-sm text-slate-500">{po.po_number} — {po.vendor_name}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/receipts')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=item_receipt')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="grn-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(`/purchasing/orders/${poId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back to PO</button>
        </div>
      </div>

      <form id="grn-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Purchase Order</label><input readOnly value={po.po_number} className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-blue-700 font-mono"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={po.vendor_name} className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Receipt Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.receiptDate} onChange={e=>set('receiptDate',e.target.value)} className={dis} required/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Location <span className="text-red-500">*</span></label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}>
                        <option value="">-- Select Location --</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}>
                        <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`} placeholder="e.g. Received in good condition"/></div>
                  </div>
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
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={dis}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
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
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Ordered</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Received</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Receive Now *</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">UOM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length===0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400 italic">All items already received</td></tr>
                      : lines.map((line, idx) => {
                        const poLine = po.lines?.find((l:any)=>l.id===line.poLineId);
                        const alreadyRcv = poLine ? parseFloat(poLine.quantity)-line.maxQty : 0;
                        return (
                          <tr key={line.poLineId} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-400">{idx+1}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{line.itemCode}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{line.itemName}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">{parseFloat(poLine?.quantity||0).toLocaleString('id-ID')}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{alreadyRcv.toLocaleString('id-ID')}</td>
                            <td className="px-1.5 py-1">
                              <input type="number" min="0" max={line.maxQty} step="0.01" value={line.quantity}
                                onChange={e=>setLines(prev=>prev.map((l,i)=>i===idx?{...l,quantity:Math.min(parseFloat(e.target.value)||0,l.maxQty)}:l))}
                                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">{line.uomCode}</td>
                            <td className="px-1.5 py-1">
                              <select value={line.departmentId} onChange={e=>setLines(prev=>prev.map((l,i)=>i===idx?{...l,departmentId:e.target.value}:l))} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={line.locationId} onChange={e=>setLines(prev=>prev.map((l,i)=>i===idx?{...l,locationId:e.target.value}:l))} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </td>
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

          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="grn-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(`/purchasing/orders/${poId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
