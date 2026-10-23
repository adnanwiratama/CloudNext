import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, ClipboardList } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

interface TOLine {
  id: number; itemId: string; description: string;
  qtyOnHand: number; qtyAvailable: number; qty: number; unit: string; uomId: string; requestedDate: string;
}

export default function TransferOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { items, locations, uomUnits } = useFormOptions();

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    fromLocationId: '', toLocationId: '', expectedDate: '', priority: 'normal', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [counter, setCounter] = useState(1000);
  const [lines, setLines] = useState<TOLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const blank = (): TOLine => ({ id: counter, itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0, qty: 1, unit: '', uomId: '', requestedDate: '' });
  const [editLine, setEditLine] = useState<TOLine>(blank());

  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };
  const rateOf = (uomId?: string) => { const u = (uomUnits || []).find((x: any) => x.id === uomId); const r = Number(u?.conversion_rate_to_base || 1); return r > 0 ? r : 1; };
  const stockInUnit = (baseQty: number, uomId?: string) => (Number(baseQty || 0) / rateOf(uomId)).toLocaleString('id-ID', { maximumFractionDigits: 4 });

  // Stock at the FROM location for the line being edited
  useEffect(() => {
    if (!editLine.itemId || !form.fromLocationId) return;
    api.get('/api/sales/stock', { params: { itemIds: editLine.itemId, locationId: form.fromLocationId } })
      .then(r => { const s = (r.data.data || {})[editLine.itemId]; setEditLine(l => (l.itemId === editLine.itemId ? { ...l, qtyOnHand: s ? s.onHand : 0, qtyAvailable: s ? s.available : 0 } : l)); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLine.itemId, form.fromLocationId]);

  const startNew = () => { setCounter(c => c + 1); setEditLine({ ...blank(), id: counter + 1 }); setEditingId(-1); };
  const cancelEdit = () => setEditingId(null);
  const addLine = () => {
    if (!editLine.itemId) { toast.error('Item is required'); return; }
    if (!(editLine.qty > 0)) { toast.error('Quantity must be greater than 0'); return; }
    if (editingId === -1) { setCounter(c => c + 1); setLines(p => [...p, { ...editLine, id: counter + 1 }]); }
    else setLines(p => p.map(l => l.id === editingId ? editLine : l));
    setEditLine(blank()); setEditingId(null);
  };
  const removeLine = (id: number) => { setLines(p => p.filter(l => l.id !== id)); setEditingId(null); };

  const setItem = (id: string) => {
    const it = items.find((x: any) => x.id === id);
    const opts = (uomUnits || []).filter((u: any) => u.uom_type_id === it?.uom_type_id);
    const stockUnit = opts.find((u: any) => u.id === it?.stock_uom_id) || opts.find((u: any) => u.is_base_unit) || opts[0];
    setEditLine(l => ({ ...l, itemId: id, description: it?.name || '', unit: stockUnit?.name || it?.uom_code || '', uomId: stockUnit?.id || '' }));
  };

  // Load existing record in edit mode
  useEffect(() => {
    if (!isEdit) return;
    api.get(`/api/inventory/transfer-orders/${id}`).then(r => {
      const d = r.data.data;
      setForm({
        orderDate: d.order_date ? d.order_date.split('T')[0] : new Date().toISOString().split('T')[0],
        fromLocationId: d.from_location_id || '', toLocationId: d.to_location_id || '',
        expectedDate: d.expected_date ? d.expected_date.split('T')[0] : '', priority: d.priority || 'normal', memo: d.memo || '',
      });
      let c = 2000;
      setLines((d.lines || []).map((l: any) => ({
        id: c++, itemId: l.item_id, description: l.item_name || '',
        qtyOnHand: 0, qtyAvailable: 0, qty: Number(l.qty_requested), unit: l.uom_name || '', uomId: l.uom_id || '',
        requestedDate: l.requested_date ? l.requested_date.split('T')[0] : '',
      })));
      setCounter(c + 100);
    }).catch(() => toast.error('Failed to load transfer order'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/inventory/transfer-orders/${id}`, data) : api.post('/api/inventory/transfer-orders', data),
    onSuccess: (res: any) => { const savedId = res.data?.data?.id || id; toast.success(isEdit ? 'Transfer order updated' : 'Transfer order created'); navigate(`/inventory/transfer-orders/${savedId}`, { state: { justSaved: true } }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const handleSave = () => {
    if (!form.fromLocationId || !form.toLocationId) { toast.error('Both locations are required'); return; }
    if (form.fromLocationId === form.toLocationId) { toast.error('From and To locations must be different'); return; }
    if (lines.length === 0) { toast.error('Add at least one line'); return; }
    mutation.mutate({ ...form, lines: lines.map(l => ({ itemId: l.itemId, qty: l.qty, uomId: l.uomId || null, requestedDate: l.requestedDate || null })) });
  };

  const cell = 'w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400';
  const sel = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white';
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center text-white"><ClipboardList size={15}/></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Transfer Order' : 'Transfer Order'}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/inventory/transfer-orders')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin"/> : null} {isEdit ? 'Update Order' : 'Save Order'}
          </button>
          <button onClick={() => navigate('/inventory/transfer-orders')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className={lbl}>Order Date *</label><input type="date" className={inp} value={form.orderDate} onChange={e=>set('orderDate',e.target.value)}/></div>
                  <div><label className={lbl}>From Location *</label>
                    <select className={sel} value={form.fromLocationId} onChange={e=>set('fromLocationId',e.target.value)}>
                      <option value="">-- Select Location --</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                  <div><label className={lbl}>To Location *</label>
                    <select className={sel} value={form.toLocationId} onChange={e=>set('toLocationId',e.target.value)}>
                      <option value="">-- Select Location --</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Expected Transfer Date</label><input type="date" className={inp} value={form.expectedDate} onChange={e=>set('expectedDate',e.target.value)}/></div>
                  <div><label className={lbl}>Priority</label>
                    <select className={sel} value={form.priority} onChange={e=>set('priority',e.target.value)}>
                      <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select></div>
                  <div><label className={lbl}>Memo</label><input className={inp} value={form.memo} onChange={e=>set('memo',e.target.value)}/></div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Lines</span><span>{lines.length}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Qty</span><span>{lines.reduce((s,l)=>s+l.qty,0).toLocaleString('id-ID')}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">Items Requested</div>
          <div className="border border-slate-200 rounded overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Item</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">UOM</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Requested Date</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditingId(line.id); }} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                    <td className="px-3 py-1.5 text-slate-700">{items.find((i:any)=>i.id===line.itemId)?.name || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(line.qtyAvailable, line.uomId)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(line.qtyOnHand, line.uomId)}</td>
                    <td className="px-3 py-1.5 text-right">{line.qty.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{line.requestedDate || '-'}</td>
                  </tr>
                ))}
                {editingId !== null && (
                  <tr className="border-t border-blue-300 bg-blue-50/40">
                    <td className="px-1.5 py-1"><select value={editLine.itemId} onChange={e=>setItem(e.target.value)} autoFocus className={`${cell} bg-white`}><option value=""></option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}</select></td>
                    <td className="px-1.5 py-1"><input value={editLine.description} onChange={e=>setEditLine(l=>({...l,description:e.target.value}))} className={cell}/></td>
                    <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editLine.qtyAvailable, editLine.uomId)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editLine.qtyOnHand, editLine.uomId)}</td>
                    <td className="px-1.5 py-1"><input type="number" min="0" step="0.001" value={editLine.qty||''} onChange={e=>setEditLine(l=>({...l,qty:Number(e.target.value)}))} className={`${cell} text-right`}/></td>
                    <td className="px-1.5 py-1">{(() => { const opts = unitsForItem(editLine.itemId); return opts.length>0 ? (
                      <select value={editLine.uomId||''} onChange={e=>{const u=opts.find((x:any)=>x.id===e.target.value); setEditLine(l=>({...l,uomId:e.target.value,unit:u?.name||''}));}} className={`${cell} bg-white`}><option value=""></option>{opts.map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}</select>
                    ) : <input value={editLine.unit} onChange={e=>setEditLine(l=>({...l,unit:e.target.value}))} className={cell}/>; })()}</td>
                    <td className="px-1.5 py-1"><input type="date" value={editLine.requestedDate} onChange={e=>setEditLine(l=>({...l,requestedDate:e.target.value}))} className={cell}/></td>
                  </tr>
                )}
                {editingId === null && (
                  <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td colSpan={7} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                  </tr>
                )}
              </tbody>
            </table>
            {editingId !== null && (
              <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                <button onClick={addLine} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                <button onClick={() => editingId !== -1 && removeLine(editingId)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
