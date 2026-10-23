import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, Undo2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface VRLine {
  id: number; itemId: string; description: string;
  qtyOnHand: number; qtyAvailable: number; quantity: number; unit: string; uomId: string;
  unitPrice: number; amount: number;
}

const RETURN_REASONS = ['damaged', 'defective', 'wrong_item', 'overstock', 'expired', 'other'];

export default function VendorReturnForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const billId = searchParams.get('billId');
  const { vendors, items, locations, departments, currencies, uomUnits } = useFormOptions();

  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const unitsForItem = (itemId: string): any[] => { const it = items.find((i: any) => i.id === itemId); if (!it?.uom_type_id) return []; return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id); };
  const rateOf = (uomId?: string): number => { const u = (uomUnits || []).find((x: any) => x.id === uomId); const r = Number(u?.conversion_rate_to_base || 1); return r > 0 ? r : 1; };
  const stockInUnit = (baseQty: number, uomId?: string): string => (Number(baseQty || 0) / rateOf(uomId)).toLocaleString('id-ID', { maximumFractionDigits: 4 });

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'files'>('lines');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [lineCounter, setLineCounter] = useState(1000);

  const [form, setForm] = useState({
    vendorId: '', returnDate: new Date().toISOString().split('T')[0],
    originalPONumber: '', returnReason: 'damaged', currency: 'IDR',
    locationId: '', departmentId: '', subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  useEffect(() => { if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id); }, [subsidiaries]);

  // ── Prefill from a Vendor Bill (?billId=) ──────────────────────────────────
  const { data: billData } = useQuery({
    queryKey: ['bill-for-return', billId],
    queryFn: () => api.get(`/api/purchasing/bills/${billId}`).then(r => r.data.data),
    enabled: !!billId,
  });
  const [billLoaded, setBillLoaded] = useState(false);
  useEffect(() => {
    if (!billData || billLoaded) return;
    setForm(f => ({
      ...f,
      vendorId: billData.vendor_id || f.vendorId,
      originalPONumber: billData.po_number || billData.vendor_bill_number || f.originalPONumber,
      currency: billData.currency || f.currency,
      locationId: billData.location_id || f.locationId,
      departmentId: billData.department_id || f.departmentId,
      subsidiaryId: billData.subsidiary_id || f.subsidiaryId,
      memo: billData.memo || f.memo,
    }));
    const itemBillLines = (billData.lines || []).filter((l: any) => l.item_id);
    if (itemBillLines.length) {
      let c = 2000;
      setLines(itemBillLines.map((l: any) => ({
        id: c++, itemId: l.item_id, description: l.description || l.item_name || '',
        qtyOnHand: 0, qtyAvailable: 0, quantity: parseFloat(l.quantity) || 1,
        unit: l.uom_code || l.uom_name || '', uomId: l.uom_id || '',
        unitPrice: parseFloat(l.unit_price) || 0, amount: (parseFloat(l.quantity) || 1) * (parseFloat(l.unit_price) || 0),
      })));
      setLineCounter(c + 100);
    }
    setBillLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billData, billLoaded]);

  const blankLine = (): VRLine => ({ id: lineCounter, itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0, quantity: 1, unit: '', uomId: '', unitPrice: 0, amount: 0 });
  const [lines, setLines] = useState<VRLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<VRLine>(blankLine());

  const recompute = (l: VRLine): VRLine => ({ ...l, amount: Number(l.quantity) * Number(l.unitPrice) });

  // Stock for the line being edited — keyed on the item AND the header location.
  useEffect(() => {
    if (!editLine.itemId) return;
    const params: any = { itemIds: editLine.itemId };
    if (form.locationId) params.locationId = form.locationId;
    api.get('/api/sales/stock', { params })
      .then(r => { const s = (r.data.data || {})[editLine.itemId]; setEditLine(l => l.itemId === editLine.itemId ? { ...l, qtyOnHand: s ? s.onHand : 0, qtyAvailable: s ? s.available : 0 } : l); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLine.itemId, form.locationId]);

  // Refresh saved lines' stock when the header location changes
  const vrItemKey = lines.map(l => l.itemId).filter(Boolean).join(',');
  useEffect(() => {
    const ids = Array.from(new Set(lines.map(l => l.itemId).filter(Boolean)));
    if (ids.length === 0) return;
    const params: any = { itemIds: ids.join(',') };
    if (form.locationId) params.locationId = form.locationId;
    api.get('/api/sales/stock', { params })
      .then(r => { const map = r.data.data || {}; setLines(prev => prev.map(l => { const s = map[l.itemId]; return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : { ...l, qtyOnHand: 0, qtyAvailable: 0 }; })); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId, vrItemKey]);

  const startNew = () => { setLineCounter(c => c + 1); setEditLine({ ...blankLine(), id: lineCounter + 1 }); setEditingId(-1); };
  const cancelEdit = () => setEditingId(null);
  const addLine = () => {
    if (!editLine.itemId) { toast.error('Item is required'); return; }
    if (editingId === -1) { setLineCounter(c => c + 1); setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]); }
    else setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    setEditLine(blankLine()); setEditingId(null);
  };
  const removeLine = (lid: number) => { setLines(prev => prev.filter(l => l.id !== lid)); setEditingId(null); };

  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/vendor-returns', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      if (fileRows.some(r => r.file)) { try { await uploadFileRows(fileRows, 'vendor_return', savedId, api.post.bind(api)); } catch (_) {} }
      toast.success('Vendor Return created');
      navigate(`/purchasing/vendor-returns/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save vendor return'),
  });

  const handleSave = () => {
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    const valid = lines.filter(l => l.itemId);
    if (!valid.length) { toast.error('At least one item line is required'); return; }
    mutation.mutate({
      vendorId: form.vendorId, returnDate: form.returnDate,
      originalPONumber: form.originalPONumber || null, returnReason: form.returnReason,
      locationId: form.locationId || null, departmentId: form.departmentId || null, subsidiaryId: form.subsidiaryId || null, memo: form.memo,
      lines: valid.map(l => ({ itemId: l.itemId, description: l.description, qty: Number(l.quantity), unitPrice: Number(l.unitPrice), uomId: l.uomId || null, unit: l.unit })),
    });
  };

  const sel = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white';
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white"><Undo2 size={15}/></div>
              <h1 className="text-xl font-semibold text-slate-800">Vendor Return</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/vendor-returns')} className="hover:underline">List</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/purchasing/vendor-returns')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Vendor <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.vendorId} onChange={e => set('vendorId', e.target.value)}>
                      <option value="">-- Select Vendor --</option>
                      {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Return Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} value={form.returnDate} onChange={e => set('returnDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Original PO Number</label>
                    <input type="text" className={inp} value={form.originalPONumber} onChange={e => set('originalPONumber', e.target.value)} placeholder="PO-..."/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Return Reason</label>
                    <select className={sel} value={form.returnReason} onChange={e => set('returnReason', e.target.value)}>
                      {RETURN_REASONS.map(r => <option key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Currency</label>
                    <select className={sel} value={form.currency} onChange={e => set('currency', e.target.value)}>
                      {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Memo</label>
                    <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Internal notes..."/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Lines</span><span>{lines.length}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{subtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
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
                <div>
                  <label className={lbl}>Subsidiary</label>
                  <select className={sel} value={form.subsidiaryId} onChange={e => set('subsidiaryId', e.target.value)}>
                    <option value=""></option>
                    {subsidiaries.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Department</label>
                  <select className={sel} value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                    <option value=""></option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Location</label>
                  <select className={sel} value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                    <option value=""></option>
                    {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lines / Files */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines', 'files'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'lines' ? 'Items' : `Files${fileRows.filter(r => r.file).length > 0 ? ` (${fileRows.filter(r => r.file).length})` : ''}`}
              </button>
            ))}
          </div>
          <div className="p-3">
            {activeTab === 'lines' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(line => (
                      <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditingId(line.id); }} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                        <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(line.qtyAvailable, line.uomId)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(line.qtyOnHand, line.uomId)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{line.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {editingId !== null && (
                      <tr className="border-t border-blue-300 bg-blue-50/40">
                        <td className="px-1.5 py-1">
                          <select value={editLine.itemId}
                            onChange={e => {
                              const item = items.find((i: any) => i.id === e.target.value);
                              const unitPrice = item ? parseFloat(item.last_purchase_price || item.purchase_price || item.standard_cost || 0) : 0;
                              const opts = (uomUnits || []).filter((u: any) => u.uom_type_id === item?.uom_type_id);
                              const purchaseUnit = opts.find((u: any) => u.id === item?.purchase_uom_id) || opts.find((u: any) => u.is_base_unit) || opts[0];
                              setEditLine(l => recompute({ ...l, itemId: e.target.value, description: item?.name || '', unit: purchaseUnit?.name || item?.uom_code || '', uomId: purchaseUnit?.id || '', unitPrice }));
                            }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" autoFocus>
                            <option value=""></option>
                            {items.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1"><input type="text" value={editLine.description} onChange={e => setEditLine(l => ({ ...l, description: e.target.value }))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/></td>
                        <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editLine.qtyAvailable, editLine.uomId)}</td>
                        <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editLine.qtyOnHand, editLine.uomId)}</td>
                        <td className="px-1.5 py-1"><input type="number" step="0.001" value={editLine.quantity || ''} onChange={e => setEditLine(l => recompute({ ...l, quantity: Number(e.target.value) }))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/></td>
                        <td className="px-1.5 py-1">
                          {(() => {
                            const opts = unitsForItem(editLine.itemId);
                            return opts.length > 0 ? (
                              <select value={editLine.uomId || ''} onChange={e => { const u = opts.find((x: any) => x.id === e.target.value); setEditLine(l => { const oldRate = rateOf(l.uomId); const newRate = Number(u?.conversion_rate_to_base || 1) || 1; const newPrice = Math.round((Number(l.unitPrice || 0) / oldRate) * newRate * 100) / 100; return recompute({ ...l, uomId: e.target.value, unit: u?.name || '', unitPrice: newPrice }); }); }} className="w-full border border-slate-300 rounded text-xs px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                                <option value=""></option>
                                {opts.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            ) : <input type="text" value={editLine.unit} onChange={e => setEditLine(l => ({ ...l, unit: e.target.value }))} placeholder="pcs" className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>;
                          })()}
                        </td>
                        <td className="px-1.5 py-1"><NumberInput value={editLine.unitPrice} min={0} onChange={v => setEditLine(l => recompute({ ...l, unitPrice: v }))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/></td>
                        <td className="px-1.5 py-1"><input readOnly value={editLine.amount > 0 ? editLine.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-600 text-right"/></td>
                      </tr>
                    )}
                    {editingId === null && (
                      <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td colSpan={8} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
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
            )}
            {activeTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
          </div>
        </div>

        {/* Bottom Save/Cancel */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/purchasing/vendor-returns')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
