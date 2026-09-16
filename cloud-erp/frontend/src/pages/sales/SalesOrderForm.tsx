import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface SalesOrderLine {
  id: number;
  itemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
  amount: number;
  departmentId: string;
  locationId: string;
}

const blankLine = (counter: number): SalesOrderLine => ({
  id: counter,
  itemId: '', description: '', quantity: 1, unit: '',
  unitPrice: 0, discountPercent: 0, taxCode: '', taxRate: 0,
  taxAmount: 0, amount: 0, departmentId: '', locationId: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesOrderForm() {
  const navigate  = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const isEdit    = !!id && id !== 'new';

  const { customers, items, locations, departments, taxCodes, currencies, paymentTerms } = useFormOptions();

  const { data: subsidiariesData } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });
  const subsidiaries: any[] = subsidiariesData || [];

  // ── Edit: load existing SO ────────────────────────────────────────────────
  const { data: existingSO } = useQuery({
    queryKey: ['so-edit', id],
    queryFn: () => api.get(`/api/sales/orders/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen,   setClassOpen]   = useState(true);
  const [lineTab,     setLineTab]     = useState<'items' | 'files'>('items');
  const [lineCounter, setLineCounter] = useState(1000);

  // ── File state ─────────────────────────────────────────────────────────────
  const [fileRows, setFileRows] = useState<FileRow[]>([
    { id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' },
  ]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    customerId      : '',
    orderDate       : new Date().toISOString().split('T')[0],
    expectedShipDate: '',
    currency        : 'IDR',
    paymentTerms    : 'Net30',
    locationId      : '',
    departmentId    : '',
    subsidiaryId    : '',
    memo            : '',
    shippingAmount  : 0,
    discountAmount  : 0,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [lines, setLines] = useState<SalesOrderLine[]>([blankLine(1000)]);

  // ── Populate form on edit ──────────────────────────────────────────────────
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!existingSO || initialized) return;
    setForm({
      customerId      : existingSO.customer_id     || '',
      orderDate       : existingSO.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      expectedShipDate: existingSO.expected_ship_date?.split('T')[0] || '',
      currency        : existingSO.currency        || 'IDR',
      paymentTerms    : existingSO.payment_terms   || 'Net30',
      locationId      : existingSO.location_id     || '',
      departmentId    : existingSO.department_id   || '',
      subsidiaryId    : existingSO.subsidiary_id   || '',
      memo            : existingSO.memo            || '',
      shippingAmount  : parseFloat(existingSO.shipping_amount) || 0,
      discountAmount  : parseFloat(existingSO.discount_amount) || 0,
    });
    if (existingSO.lines?.length) {
      setLines(existingSO.lines.map((l: any, i: number) => ({
        id: 1000 + i,
        itemId         : l.item_id         || '',
        description    : l.description     || '',
        quantity       : parseFloat(l.quantity)   || 1,
        unit           : l.uom_code        || '',
        unitPrice      : parseFloat(l.unit_price) || 0,
        discountPercent: parseFloat(l.discount_percent) || 0,
        taxCode        : l.tax_code        || '',
        taxRate        : parseFloat(l.tax_rate) || 0,
        taxAmount      : parseFloat(l.tax_amount) || 0,
        amount         : parseFloat(l.amount) || 0,
        departmentId   : l.department_id   || '',
        locationId     : l.location_id     || '',
      })));
    }
    setInitialized(true);
  }, [existingSO, initialized]);

  // ── Line helpers ───────────────────────────────────────────────────────────
  const updateLine = useCallback((id: number, key: string, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [key]: value };
      if (['quantity', 'unitPrice', 'discountPercent'].includes(key)) {
        const qty  = key === 'quantity'        ? Number(value) : Number(updated.quantity);
        const price= key === 'unitPrice'       ? Number(value) : Number(updated.unitPrice);
        const disc = key === 'discountPercent' ? Number(value) : Number(updated.discountPercent);
        updated.amount = qty * price * (1 - disc / 100);
      }
      if (key === 'itemId') {
        const item = items.find((i: any) => i.id === value);
        if (item) {
          updated.description = item.name || '';
          updated.unitPrice   = parseFloat(item.sale_price || item.standard_cost || 0);
          updated.unit        = item.uom_code || '';
          updated.amount      = Number(updated.quantity) * updated.unitPrice * (1 - Number(updated.discountPercent) / 100);
        }
      }
      if (key === 'taxCode') {
        const tc = taxCodes.find((t: any) => t.code === value || t.id === value);
        if (tc) {
          updated.taxRate   = parseFloat(tc.rate || 0);
          updated.taxAmount = updated.amount * (updated.taxRate / 100);
        }
      }
      return updated;
    }));
  }, [items, taxCodes]);

  const addLine = () => {
    const next = lineCounter + 1;
    setLineCounter(next);
    setLines(prev => [...prev, blankLine(next)]);
  };
  const removeLine = (id: number) => setLines(prev => prev.filter(l => l.id !== id));

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal  = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const taxTotal  = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
  const total     = subtotal + taxTotal + Number(form.shippingAmount) - Number(form.discountAmount);

  // ── Save ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.put(`/api/sales/orders/${id}`, data)
      : api.post('/api/sales/orders', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try {
        await uploadFileRows(fileRows, 'sales_order', String(savedId), api.post.bind(api));
      } catch (_) { /* non-fatal */ }
      toast.success(isEdit ? 'Sales Order updated' : 'Sales Order created');
      navigate(`/sales/orders/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save Sales Order'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    const validLines = lines.filter(l => l.itemId);
    if (!validLines.length) { toast.error('At least one item line is required'); return; }
    mutation.mutate({
      ...form,
      expectedShipDate: form.expectedShipDate || null,
      locationId      : form.locationId || null,
      departmentId    : form.departmentId || null,
      subsidiaryId    : form.subsidiaryId || null,
      lines: validLines.map(l => ({
        itemId         : l.itemId,
        description    : l.description,
        quantity       : Number(l.quantity),
        unit           : l.unit,
        unitPrice      : Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
        taxCode        : l.taxCode,
        taxAmount      : Number(l.taxAmount),
        amount         : Number(l.amount),
        departmentId   : l.departmentId || null,
        locationId     : l.locationId   || null,
      })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-green-600 flex items-center justify-center text-white">
                <ShoppingCart size={15}/>
              </div>
              <span className="text-xl font-bold text-slate-800">Sales Order</span>
              {isEdit && existingSO?.so_number && (
                <span className="text-xl font-semibold text-slate-500">{existingSO.so_number}</span>
              )}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=sales_order')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button type="submit" form="so-form" disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null}
            {isEdit ? 'Save Changes' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="so-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

          {/* ── Primary Information ──────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setPrimaryOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  {/* Column 1 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e => set('customerId', e.target.value)}
                        className={dis} required>
                        <option value="">-- Select Customer --</option>
                        {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Order Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.orderDate} onChange={e => set('orderDate', e.target.value)}
                        className={dis} required/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Expected Ship Date</label>
                      <input type="date" value={form.expectedShipDate} onChange={e => set('expectedShipDate', e.target.value)}
                        className={dis}/>
                    </div>
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e => set('currency', e.target.value)} className={dis}>
                        {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} className={dis}>
                        {paymentTerms.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Location</label>
                      <select value={form.locationId} onChange={e => set('locationId', e.target.value)} className={dis}>
                        <option value="">-- Select Location --</option>
                        {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Column 3 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)} className={dis}>
                        <option value="">-- Select Department --</option>
                        {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
                        rows={3} className={`${dis} resize-none`} placeholder="Internal notes..."/>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Classification ───────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setClassOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e => set('subsidiaryId', e.target.value)} className={dis}>
                      <option value="">-- Select Subsidiary --</option>
                      {subsidiaries.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)} className={dis}>
                      <option value="">-- Select Department --</option>
                      {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e => set('locationId', e.target.value)} className={dis}>
                      <option value="">-- Select Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom card: Lines + Files ───────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            {/* Tabs */}
            <div className="border-b border-slate-200 px-4 flex">
              {(['items', 'files'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                    ${lineTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'items' ? 'Items' : 'Files'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* ── Items tab ─────────────────────────────────────────── */}
              {lineTab === 'items' && (
                <div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc %</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={line.id} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400">{idx + 1}</td>
                            <td className="px-1 py-1">
                              <select value={line.itemId} onChange={e => updateLine(line.id, 'itemId', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs">
                                <option value="">-- Item --</option>
                                {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs"/>
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" min="0.001" step="0.001" value={line.quantity}
                                onChange={e => updateLine(line.id, 'quantity', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                            </td>
                            <td className="px-1 py-1">
                              <input value={line.unit} onChange={e => updateLine(line.id, 'unit', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs"/>
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" min="0" step="0.01" value={line.unitPrice}
                                onChange={e => updateLine(line.id, 'unitPrice', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" min="0" max="100" step="0.1" value={line.discountPercent}
                                onChange={e => updateLine(line.id, 'discountPercent', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                            </td>
                            <td className="px-1 py-1">
                              <select value={line.taxCode} onChange={e => updateLine(line.id, 'taxCode', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs">
                                <option value="">None</option>
                                {taxCodes.map((t: any) => <option key={t.id} value={t.code || t.id}>{t.code} ({t.rate}%)</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1 text-right font-medium text-slate-800">
                              {Number(line.amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-1 py-1">
                              <select value={line.departmentId} onChange={e => updateLine(line.id, 'departmentId', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs">
                                <option value="">—</option>
                                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={line.locationId} onChange={e => updateLine(line.id, 'locationId', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs">
                                <option value="">—</option>
                                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button type="button" onClick={() => removeLine(line.id)}
                                className="text-red-400 hover:text-red-600">
                                <Trash2 size={13}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button type="button" onClick={addLine}
                    className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600">
                    <Plus size={11}/> Add Line
                  </button>

                  {/* Totals */}
                  <div className="mt-4 flex justify-end">
                    <div className="w-64 space-y-1.5 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Subtotal</span>
                        <span className="font-medium text-slate-700">{subtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                        <span className="text-slate-500">Discount</span>
                        <input type="number" min="0" step="0.01" value={form.discountAmount}
                          onChange={e => set('discountAmount', e.target.value)}
                          className="w-28 border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Tax</span>
                        <span className="text-slate-700">{taxTotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                        <span className="text-slate-500">Shipping</span>
                        <input type="number" min="0" step="0.01" value={form.shippingAmount}
                          onChange={e => set('shippingAmount', e.target.value)}
                          className="w-28 border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                      </div>
                      <div className="flex justify-between py-1.5 font-bold text-sm">
                        <span>Total</span>
                        <span className="text-blue-700">{total.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Files tab ─────────────────────────────────────────── */}
              {lineTab === 'files' && (
                <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>
              )}
            </div>
          </div>

          {/* ── Bottom save bar ──────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="so-form" disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null}
              {isEdit ? 'Save Changes' : 'Save'}
            </button>
            <button type="button" onClick={() => navigate(-1)}
              className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}
