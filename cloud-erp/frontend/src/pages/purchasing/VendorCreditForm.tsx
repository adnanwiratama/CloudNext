import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, Minus } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import { formatCurrency, formatDate } from '../../utils/format';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface VCLine {
  id: number; itemId: string; description: string;
  quantity: number; unit: string; uomId: string; unitPrice: number; amount: number;
}

const CREDIT_REASONS = ['damaged', 'defective', 'wrong_item', 'overcharge', 'return', 'other'];

export default function VendorCreditForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnId = searchParams.get('returnId');
  const { vendors, items, currencies, uomUnits } = useFormOptions();

  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const unitsForItem = (itemId: string): any[] => { const it = items.find((i: any) => i.id === itemId); if (!it?.uom_type_id) return []; return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id); };
  const rateOf = (uomId?: string): number => { const u = (uomUnits || []).find((x: any) => x.id === uomId); const r = Number(u?.conversion_rate_to_base || 1); return r > 0 ? r : 1; };

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'bills' | 'files'>('lines');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [lineCounter, setLineCounter] = useState(1000);

  const [form, setForm] = useState({
    vendorId: '', creditDate: new Date().toISOString().split('T')[0],
    creditMemoNumber: '', originalBillNumber: '', reason: 'return', currency: 'IDR',
    subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  useEffect(() => { if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id); }, [subsidiaries]);

  // Bill applications: billId -> amount to apply (checkbox adds with full remaining due by default)
  const [billApps, setBillApps] = useState<Record<string, number>>({});

  // ── Prefill from a Vendor Return (?returnId=) ──────────────────────────────
  const { data: returnData } = useQuery({
    queryKey: ['return-for-credit', returnId],
    queryFn: () => api.get(`/api/purchasing/vendor-returns/${returnId}`).then(r => r.data.data),
    enabled: !!returnId,
  });
  const [returnLoaded, setReturnLoaded] = useState(false);
  useEffect(() => {
    if (!returnData || returnLoaded) return;
    setForm(f => ({
      ...f,
      vendorId: returnData.vendor_id || f.vendorId,
      originalBillNumber: returnData.original_po_number || f.originalBillNumber,
      currency: returnData.currency || f.currency,
      subsidiaryId: returnData.subsidiary_id || f.subsidiaryId,
      memo: returnData.memo || `From Vendor Return ${returnData.return_number}`,
    }));
    if ((returnData.lines || []).length) {
      let c = 2000;
      setLines((returnData.lines || []).map((l: any) => ({
        id: c++, itemId: l.item_id, description: l.description || l.item_name || '',
        quantity: parseFloat(l.qty) || 1, unit: l.uom_code || l.uom_name || '', uomId: l.uom_id || '',
        unitPrice: parseFloat(l.unit_price) || 0, amount: (parseFloat(l.qty) || 1) * (parseFloat(l.unit_price) || 0),
      })));
      setLineCounter(c + 100);
    }
    setReturnLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnData, returnLoaded]);

  // ── Open vendor bills for the selected vendor (Apply-to-Bills tab) ─────────
  const { data: openBills = [] } = useQuery({
    queryKey: ['open-bills', form.vendorId],
    queryFn: () => api.get('/api/purchasing/vendor-credits/open-bills', { params: { vendorId: form.vendorId } }).then(r => r.data.data || []),
    enabled: !!form.vendorId,
  });

  const toggleBill = (bill: any) => {
    setBillApps(prev => {
      const next = { ...prev };
      if (next[bill.id] != null) delete next[bill.id];
      else next[bill.id] = Number(bill.amount_due) || 0;
      return next;
    });
  };
  const setBillAmount = (billId: string, amount: number, max: number) => {
    setBillApps(prev => ({ ...prev, [billId]: Math.max(0, Math.min(amount, max)) }));
  };
  const totalApplied = Object.values(billApps).reduce((s, v) => s + Number(v || 0), 0);

  const blankLine = (): VCLine => ({ id: lineCounter, itemId: '', description: '', quantity: 1, unit: '', uomId: '', unitPrice: 0, amount: 0 });
  const [lines, setLines] = useState<VCLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<VCLine>(blankLine());

  const recompute = (l: VCLine): VCLine => ({ ...l, amount: Number(l.quantity) * Number(l.unitPrice) });

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
    mutationFn: (data: any) => api.post('/api/purchasing/vendor-credits', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      if (fileRows.some(r => r.file)) { try { await uploadFileRows(fileRows, 'vendor_credit', savedId, api.post.bind(api)); } catch (_) {} }
      toast.success('Vendor Credit created');
      navigate(`/purchasing/vendor-credits/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save vendor credit'),
  });

  const handleSave = () => {
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    const valid = lines.filter(l => l.itemId);
    if (!valid.length) { toast.error('At least one item line is required'); return; }
    mutation.mutate({
      vendorId: form.vendorId, creditDate: form.creditDate,
      creditMemoNumber: form.creditMemoNumber || null, originalBillNumber: form.originalBillNumber || null,
      reason: form.reason, subsidiaryId: form.subsidiaryId || null, memo: form.memo,
      returnId: returnId || null,
      lines: valid.map(l => ({ itemId: l.itemId, description: l.description, qty: Number(l.quantity), unitPrice: Number(l.unitPrice), uomId: l.uomId || null, unit: l.unit })),
      billApplications: Object.entries(billApps).filter(([, amt]) => Number(amt) > 0).map(([billId, amount]) => ({ billId, amount: Number(amount) })),
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
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><Minus size={15}/></div>
              <h1 className="text-xl font-semibold text-slate-800">Vendor Credit</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/vendor-credits')} className="hover:underline">List</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/purchasing/vendor-credits')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
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
                    <label className={lbl}>Credit Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} value={form.creditDate} onChange={e => set('creditDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Vendor Credit Memo #</label>
                    <input type="text" className={inp} value={form.creditMemoNumber} onChange={e => set('creditMemoNumber', e.target.value)}/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Original Bill Number</label>
                    <input type="text" className={inp} value={form.originalBillNumber} onChange={e => set('originalBillNumber', e.target.value)} placeholder="BILL-..."/>
                  </div>
                  <div>
                    <label className={lbl}>Reason</label>
                    <select className={sel} value={form.reason} onChange={e => set('reason', e.target.value)}>
                      {CREDIT_REASONS.map(r => <option key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</option>)}
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
              </div>
            </div>
          )}
        </div>

        {/* Lines / Files */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines', 'bills', 'files'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'lines' ? 'Items' : tab === 'bills' ? `Apply to Bills${Object.keys(billApps).length > 0 ? ` (${Object.keys(billApps).length})` : ''}` : `Files${fileRows.filter(r => r.file).length > 0 ? ` (${fileRows.filter(r => r.file).length})` : ''}`}
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
                        <td colSpan={6} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
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
            {activeTab === 'bills' && (
              <div>
                {!form.vendorId ? (
                  <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">Select a vendor first to see open bills.</div>
                ) : openBills.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No open bills for this vendor.</div>
                ) : (
                  <>
                    <div className="mb-2 text-xs text-slate-500">Checklist the bills to apply this credit against. Applying reduces the amount due (hutang) on each bill.</div>
                    <div className="border border-slate-200 rounded overflow-x-auto">
                      <table className="w-full text-xs min-w-max">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr>
                          <th className="px-3 py-2 w-10"></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Bill #</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Vendor Invoice #</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Bill Date</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount Due</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Apply Amount</th>
                        </tr></thead>
                        <tbody>
                          {openBills.map((b: any) => {
                            const checked = billApps[b.id] != null;
                            return (
                              <tr key={b.id} className={`border-t border-slate-100 ${checked ? 'bg-blue-50/40' : ''}`}>
                                <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={checked} onChange={() => toggleBill(b)}/></td>
                                <td className="px-3 py-1.5 font-mono text-blue-600">{b.bill_number}</td>
                                <td className="px-3 py-1.5 text-slate-600">{b.vendor_bill_number || '-'}</td>
                                <td className="px-3 py-1.5 text-slate-500">{b.bill_date ? formatDate(b.bill_date) : '-'}</td>
                                <td className="px-3 py-1.5 text-right">{formatCurrency(b.total_amount)}</td>
                                <td className="px-3 py-1.5 text-right text-red-600 font-medium">{formatCurrency(b.amount_due)}</td>
                                <td className="px-3 py-1.5">
                                  {checked ? (
                                    <NumberInput value={billApps[b.id]} min={0} onChange={v => setBillAmount(b.id, v, Number(b.amount_due))}
                                      className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/>
                                  ) : <span className="text-slate-300 text-right block">-</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-bold"><td colSpan={6} className="px-3 py-2 text-right">Total Applied</td><td className="px-3 py-2 text-right text-blue-700">{formatCurrency(totalApplied)}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                    {totalApplied > subtotal + 0.009 && (
                      <div className="mt-2 text-xs text-amber-600">Note: total applied ({formatCurrency(totalApplied)}) exceeds the credit amount ({formatCurrency(subtotal)}). The backend caps application to each bill's due and the credit value.</div>
                    )}
                  </>
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
          <button onClick={() => navigate('/purchasing/vendor-credits')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
