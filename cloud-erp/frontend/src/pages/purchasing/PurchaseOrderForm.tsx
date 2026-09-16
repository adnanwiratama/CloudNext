import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, ShoppingCart } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface POLine {
  id: number;
  itemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxCode: string;
  taxRate: number;
  taxAmt: number;
  amount: number;
  departmentId: string;
  locationId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchaseOrderForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { vendors, items, locations, departments, taxCodes, currencies, paymentTerms } = useFormOptions();

  const { data: subsidiariesData } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });
  const subsidiaries: any[] = subsidiariesData || [];

  // ── UI state ─────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'files'>('lines');

  // ── File state ────────────────────────────────────────────────────────────
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    vendorId: '',
    orderDate: new Date().toISOString().split('T')[0],
    expectedReceiptDate: '',
    currency: 'IDR',
    paymentTerms: 'Net30',
    locationId: '',
    departmentId: '',
    subsidiaryId: '',
    memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id);
  }, [subsidiaries]);

  // ── Line state ────────────────────────────────────────────────────────────
  const [lineCounter, setLineCounter] = useState(1000);
  const [lines, setLines] = useState<POLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const blankLine = (): POLine => ({
    id: lineCounter, itemId: '', description: '', quantity: 1, unit: '',
    unitPrice: 0, taxCode: '', taxRate: 0, taxAmt: 0, amount: 0,
    departmentId: '', locationId: '',
  });
  const [editLine, setEditLine] = useState<POLine>(blankLine());

  const getTaxRate = (code: string) => {
    const t = taxCodes.find((tc: any) => tc.code === code);
    return t ? parseFloat(t.rate) : 0;
  };

  const startNew = () => {
    setLineCounter(c => c + 1);
    setEditLine({ ...blankLine(), id: lineCounter + 1 });
    setEditingId(-1);
  };
  const cancelEdit = () => setEditingId(null);

  const addLine = () => {
    if (!editLine.itemId) { toast.error('Item is required'); return; }
    if (editingId === -1) {
      setLineCounter(c => c + 1);
      setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]);
    } else {
      setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    }
    setEditLine(blankLine());
    setEditingId(null);
  };

  const removeLine = (lid: number) => { setLines(prev => prev.filter(l => l.id !== lid)); setEditingId(null); };

  const totalAmt = lines.reduce((s, l) => s + l.amount, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmt, 0);

  // ── Save ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/orders', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      if (fileRows.some(r => r.file)) {
        try { await uploadFileRows(fileRows, 'purchase_order', savedId, api.post.bind(api)); }
        catch (e: any) { toast.error('PO saved but file upload failed: ' + (e.response?.data?.error || e.message)); }
      }
      toast.success('Purchase Order created');
      navigate(`/purchasing/orders/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create PO'),
  });

  const handleSave = () => {
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    if (!form.orderDate) { toast.error('Order Date is required'); return; }
    mutation.mutate({
      ...form,
      expectedReceiptDate: form.expectedReceiptDate || null,
      locationId: form.locationId || null,
      departmentId: form.departmentId || null,
      subsidiaryId: form.subsidiaryId || null,
      lines: lines.map(l => ({
        itemId: l.itemId, description: l.description, quantity: l.quantity,
        unit: l.unit, unitPrice: l.unitPrice, taxCode: l.taxCode,
        taxRate: l.taxRate, taxAmt: l.taxAmt, amount: l.amount,
        departmentId: l.departmentId || null, locationId: l.locationId || null,
      })),
    });
  };

  const sel = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white';
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center text-white">
                <ShoppingCart size={15}/>
              </div>
              <h1 className="text-xl font-semibold text-slate-800">Purchase Order</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=purchase_order')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/purchasing/orders')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

        {/* ── Primary Information ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
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
                    <label className={lbl}>Order Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} value={form.orderDate} onChange={e => set('orderDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Expected Receipt Date</label>
                    <input type="date" className={inp} value={form.expectedReceiptDate} onChange={e => set('expectedReceiptDate', e.target.value)}/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Currency</label>
                    <select className={sel} value={form.currency} onChange={e => set('currency', e.target.value)}>
                      {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Payment Terms</label>
                    <select className={sel} value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                      {paymentTerms.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Location</label>
                    <select className={sel} value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                      <option value="">-- Select Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Department</label>
                    <select className={sel} value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                      <option value="">-- Select Department --</option>
                      {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Memo</label>
                    <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Internal notes..."/>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Classification ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
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

        {/* ── Lines / Files ── */}
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
            {/* ── Items tab ── */}
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
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(line => (
                      <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditingId(line.id); }}
                        className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                        <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-slate-600">{line.taxCode || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{line.taxAmt > 0 ? line.taxAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{line.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.departmentId)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.locationId)?.name || '-'}</td>
                      </tr>
                    ))}
                    {editingId !== null && (
                      <tr className="border-t border-blue-300 bg-blue-50/40">
                        <td className="px-1.5 py-1">
                          <select value={editLine.itemId}
                            onChange={e => {
                              const item = items.find((i: any) => i.id === e.target.value);
                              const unitPrice = item ? parseFloat(item.purchase_price || item.standard_cost || 0) : 0;
                              const unit = item?.uom_code || item?.uom || '';
                              const amt = editLine.quantity * unitPrice;
                              const tAmt = Math.round(amt * (editLine.taxRate / 100) * 100) / 100;
                              setEditLine(l => ({ ...l, itemId: e.target.value, description: item?.name || '', unit, unitPrice, amount: amt, taxAmt: tAmt }));
                            }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" autoFocus>
                            <option value=""></option>
                            {items.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="text" value={editLine.description}
                            onChange={e => setEditLine(l => ({ ...l, description: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="number" step="0.001" value={editLine.quantity || ''}
                            onChange={e => {
                              const qty = Number(e.target.value);
                              const amt = qty * editLine.unitPrice;
                              const tAmt = Math.round(amt * (editLine.taxRate / 100) * 100) / 100;
                              setEditLine(l => ({ ...l, quantity: qty, amount: amt, taxAmt: tAmt }));
                            }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="text" value={editLine.unit}
                            onChange={e => setEditLine(l => ({ ...l, unit: e.target.value }))}
                            placeholder="pcs"
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="number" step="0.01" value={editLine.unitPrice || ''}
                            onChange={e => {
                              const price = Number(e.target.value);
                              const amt = editLine.quantity * price;
                              const tAmt = Math.round(amt * (editLine.taxRate / 100) * 100) / 100;
                              setEditLine(l => ({ ...l, unitPrice: price, amount: amt, taxAmt: tAmt }));
                            }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.taxCode}
                            onChange={e => {
                              const rate = getTaxRate(e.target.value);
                              const tAmt = Math.round(editLine.amount * (rate / 100) * 100) / 100;
                              setEditLine(l => ({ ...l, taxCode: e.target.value, taxRate: rate, taxAmt: tAmt }));
                            }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value=""></option>
                            {taxCodes.map((tc: any) => <option key={tc.id} value={tc.code}>{tc.code}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <input readOnly value={editLine.taxAmt > 0 ? editLine.taxAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                            className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input readOnly value={editLine.amount > 0 ? editLine.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                            className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-600 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.departmentId}
                            onChange={e => setEditLine(l => ({ ...l, departmentId: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value=""></option>
                            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.locationId}
                            onChange={e => setEditLine(l => ({ ...l, locationId: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value=""></option>
                            {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )}
                    {editingId === null && (
                      <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td colSpan={10} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {editingId !== null && (
                  <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                    <button onClick={addLine}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800">
                      <Plus size={11}/> Add
                    </button>
                    <button onClick={cancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50">
                      <X size={11}/> Cancel
                    </button>
                    <button onClick={() => editingId !== -1 && removeLine(editingId)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50">
                      <Trash2 size={11}/> Remove
                    </button>
                  </div>
                )}
                {lines.length > 0 && (
                  <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 flex justify-end gap-8 text-xs">
                    <span className="text-slate-500">Subtotal: <span className="font-semibold text-slate-700">{totalAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></span>
                    <span className="text-slate-500">Tax: <span className="font-semibold text-slate-700">{totalTax.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></span>
                    <span className="text-slate-700 font-bold">Total: {(totalAmt + totalTax).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Files tab ── */}
            {activeTab === 'files' && (
              <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>
            )}
          </div>
        </div>

        {/* ── Bottom Save/Cancel ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/purchasing/orders')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
