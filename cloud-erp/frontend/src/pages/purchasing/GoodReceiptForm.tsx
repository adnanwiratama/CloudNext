import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Package } from 'lucide-react';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';
import ReceiveOrdersWorklist from './ReceiveOrdersWorklist';

export default function GoodReceiptForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'>('items');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({ receiptDate: new Date().toISOString().split('T')[0], locationId: '', departmentId: '', subsidiaryId: '', memo: '' });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [lines, setLines] = useState<Array<{ poLineId: string; itemId: string; quantity: number; maxQty: number; itemCode: string; itemName: string; uomCode: string; uomId: string; unitCost: number; departmentId: string; locationId: string; qtyOnHand: number; qtyAvailable: number; }>>([]);

  // ── EDIT MODE: load the existing receipt ────────────────────────────────────
  const { data: existingReceipt, isLoading: loadingReceipt } = useQuery({
    queryKey: ['good-receipt-edit', id],
    queryFn: () => api.get(`/api/purchasing/receipts/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const poId = isEdit ? (existingReceipt?.po_id || null) : searchParams.get('poId');

  const { data: po, isLoading } = useQuery({ queryKey: ['po-for-receipt', poId], queryFn: () => api.get(`/api/purchasing/orders/${poId}`).then(r => r.data.data), enabled: !!poId });

  // Populate from the PO for a NEW receipt (default qty = remaining unreceived)
  useEffect(() => {
    if (isEdit || !po?.lines) return;
    set('locationId', po.location_id || '');
    set('departmentId', po.department_id || '');
    set('subsidiaryId', po.subsidiary_id || '');
    setLines(po.lines.filter((l: any) => parseFloat(l.quantity) - parseFloat(l.qty_received || 0) > 0).map((l: any) => ({
      poLineId: l.id, itemId: l.item_id,
      quantity: parseFloat(l.quantity) - parseFloat(l.qty_received || 0),
      maxQty: parseFloat(l.quantity) - parseFloat(l.qty_received || 0),
      itemCode: l.item_code, itemName: l.item_name, uomCode: l.uom_code || l.uom_name || 'EA', uomId: l.uom_id || '',
      unitCost: parseFloat(l.unit_price || 0), departmentId: l.department_id || '', locationId: l.location_id || po.location_id || '',
      qtyOnHand: 0, qtyAvailable: 0,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po, isEdit]);

  // Populate from the EXISTING receipt when editing (qty can go up to remaining + what this receipt already recorded)
  useEffect(() => {
    if (!isEdit || !existingReceipt?.lines || !po?.lines) return;
    set('receiptDate', existingReceipt.receipt_date?.split('T')[0] || form.receiptDate);
    set('locationId', existingReceipt.location_id || '');
    set('departmentId', existingReceipt.department_id || '');
    set('subsidiaryId', existingReceipt.subsidiary_id || '');
    set('memo', existingReceipt.memo || '');
    setLines(existingReceipt.lines.map((rl: any) => {
      const poLine = po.lines.find((l: any) => l.id === rl.po_line_id);
      const ordered = parseFloat(poLine?.quantity || 0);
      const receivedByOthers = parseFloat(poLine?.qty_received || 0) - parseFloat(rl.quantity || 0);
      const maxQty = Math.max(parseFloat(rl.quantity || 0), ordered - receivedByOthers);
      return {
        poLineId: rl.po_line_id, itemId: rl.item_id,
        quantity: parseFloat(rl.quantity || 0), maxQty,
        itemCode: rl.item_code, itemName: rl.item_name, uomCode: rl.uom_code || rl.uom_name || 'EA', uomId: rl.uom_id || '',
        unitCost: parseFloat(rl.unit_cost || 0), departmentId: rl.department_id || '', locationId: rl.location_id || existingReceipt.location_id || '',
        qtyOnHand: 0, qtyAvailable: 0,
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReceipt, po, isEdit]);

  // Fetch per-location stock for each line whenever its location or item changes
  const stockKey = lines.map(l => `${l.itemId}:${l.locationId}`).join(',');
  useEffect(() => {
    const ids = Array.from(new Set(lines.map(l => l.itemId).filter(Boolean)));
    if (ids.length === 0) return;
    // Group by location so we query stock per selected location
    const byLoc: Record<string, string[]> = {};
    lines.forEach(l => {
      if (!l.itemId) return;
      const key = l.locationId || '';
      (byLoc[key] = byLoc[key] || []).push(l.itemId);
    });
    Promise.all(Object.entries(byLoc).map(([loc, itemIds]) => {
      const params: any = { itemIds: Array.from(new Set(itemIds)).join(',') };
      if (loc) params.locationId = loc;
      return api.get('/api/sales/stock', { params }).then(r => ({ loc, map: r.data.data || {} })).catch(() => ({ loc, map: {} }));
    })).then(results => {
      const byLocMap: Record<string, any> = {};
      results.forEach(({ loc, map }) => { byLocMap[loc] = map; });
      setLines(prev => prev.map(l => {
        const s = byLocMap[l.locationId || '']?.[l.itemId];
        return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : { ...l, qtyOnHand: 0, qtyAvailable: 0 };
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockKey]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.put(`/api/purchasing/receipts/${id}`, data)
      : api.post(`/api/purchasing/orders/${poId}/receive`, data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'item_receipt', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(isEdit ? 'Good Receipt updated' : `Good Receipt ${res.data.data.receipt_number} created`);
      navigate(`/purchasing/receipts/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save good receipt'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poId) { toast.error('No Purchase Order selected'); return; }
    const validLines = lines.filter(l => l.quantity > 0);
    if (!validLines.length) { toast.error('At least one item with quantity > 0'); return; }
    mutation.mutate({ ...form, locationId: form.locationId || null, departmentId: form.departmentId || null, lines: validLines.map(l => ({ poLineId: l.poLineId, itemId: l.itemId, quantity: l.quantity, uomId: l.uomId || null, unitCost: l.unitCost, departmentId: l.departmentId || null, locationId: l.locationId || null })) });
  };

  // No PO selected → show the "Receive Orders" worklist of everything pending receipt.
  if (!isEdit && !poId) return <ReceiveOrdersWorklist />;
  if (isLoading || (isEdit && loadingReceipt)) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!po) return <div className="p-6 text-red-600">Purchase order not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white"><Package size={15}/></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Item Receipt' : 'Item Receipt'}</span>
              <span className="text-sm text-slate-500">{isEdit && existingReceipt?.receipt_number ? `${existingReceipt.receipt_number} — ` : ''}{po.po_number} — {po.vendor_name}</span>
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
          <button type="button" onClick={() => navigate(isEdit ? `/purchasing/receipts/${id}` : `/purchasing/orders/${poId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">{isEdit ? 'Cancel' : 'Back to PO'}</button>
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
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary <span className="text-slate-400">(from PO)</span></label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={`${dis} bg-slate-50`}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
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
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Ordered</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Received</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Receive Now *</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">UOM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length===0 ? <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-400 italic">All items already received</td></tr>
                      : lines.map((line, idx) => {
                        const poLine = po.lines?.find((l:any)=>l.id===line.poLineId);
                        // Already received = qty recorded on the PO line from prior Item Receipts
                        const alreadyRcv = poLine ? parseFloat(poLine.qty_received || 0) : 0;
                        return (
                          <tr key={line.poLineId} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-400">{idx+1}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{line.itemCode}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{line.itemName}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{line.qtyAvailable.toLocaleString('id-ID')}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{line.qtyOnHand.toLocaleString('id-ID')}</td>
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
            <button type="button" onClick={()=>navigate(isEdit ? `/purchasing/receipts/${id}` : `/purchasing/orders/${poId}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
