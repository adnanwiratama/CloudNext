import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, ShoppingCart } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import CurrencyRateField from '../../components/CurrencyRateField';
import AutoNumberField from '../../components/AutoNumberField';
import { computeDueDate } from '../../utils/format';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface SalesOrderLine {
  id: number;
  dbId?: string;
  itemId: string;
  description: string;
  qtyOnHand: number;
  qtyAvailable: number;
  quantity: number;
  unit: string;
  uomId: string;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  discountAccountId: string;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
  amount: number;
  departmentId: string;
  locationId: string;
}

const blankLine = (counter: number): SalesOrderLine => ({
  id: counter,
  itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0, quantity: 1, unit: '', uomId: '',
  unitPrice: 0, discountPercent: 0, discountAmount: 0, discountAccountId: '', taxCode: '', taxRate: 0,
  taxAmount: 0, amount: 0, departmentId: '', locationId: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesOrderForm() {
  const navigate  = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const isEdit    = !!id && id !== 'new';

  const { customers, items, locations, departments, taxCodes, currencies, paymentTerms, accounts, uomUnits } = useFormOptions();
  // Discount accounts: sales discount / contra-revenue accounts
  const discountAccounts = accounts.filter((a: any) =>
    a.subtype === 'sales_discount' || (a.type === 'income' && String(a.name).toLowerCase().includes('discount')));

  // Convert base-unit stock to the line's selected unit for display
  const rateOf = (uomId?: string): number => {
    const u = (uomUnits || []).find((x: any) => x.id === uomId);
    const r = Number(u?.conversion_rate_to_base || 1);
    return r > 0 ? r : 1;
  };
  const stockInUnit = (baseQty: number, uomId?: string): string =>
    (Number(baseQty || 0) / rateOf(uomId)).toLocaleString('id-ID', { maximumFractionDigits: 4 });

  // Units available for a line, based on its item's UOM Type
  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };

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
    documentNumber  : '',
    orderDate       : new Date().toISOString().split('T')[0],
    expectedShipDate: '',
    currency        : 'IDR',
    exchangeRate    : 1,
    paymentTerms    : 'Net30',
    dueDate         : computeDueDate(new Date().toISOString().split('T')[0], 'Net30'),
    locationId      : '',
    departmentId    : '',
    subsidiaryId    : '',
    memo            : '',
    shippingAmount  : 0,
    discountAmount  : 0,
    discountAccountId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  // Recompute Due Date whenever Order Date or Payment Terms change (Due = Order Date + terms)
  const setOrderDate = (v: string) => setForm(f => ({ ...f, orderDate: v, dueDate: computeDueDate(v, f.paymentTerms) }));
  const setPaymentTerms = (v: string) => setForm(f => ({ ...f, paymentTerms: v, dueDate: computeDueDate(f.orderDate, v) }));
  // Selecting a customer pulls its default Payment Terms from the customer master
  // and recomputes the Due Date (user can still override afterwards).
  const setCustomer = (customerId: string) => setForm(f => {
    const c = customers.find((x: any) => x.id === customerId);
    const terms = c?.payment_terms || f.paymentTerms;
    return { ...f, customerId, paymentTerms: terms, dueDate: computeDueDate(f.orderDate, terms) };
  });

  const [lines, setLines] = useState<SalesOrderLine[]>([]);

  // ── Populate form on edit ──────────────────────────────────────────────────
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!existingSO || initialized) return;
    setForm({
      customerId      : existingSO.customer_id     || '',
      documentNumber  : existingSO.so_number        || '',
      orderDate       : existingSO.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      expectedShipDate: existingSO.expected_ship_date?.split('T')[0] || '',
      currency        : existingSO.currency        || 'IDR',
      exchangeRate    : parseFloat(existingSO.exchange_rate) || 1,
      paymentTerms    : existingSO.payment_terms   || 'Net30',
      dueDate         : existingSO.due_date?.split('T')[0] || computeDueDate(existingSO.order_date?.split('T')[0], existingSO.payment_terms || 'Net30'),
      locationId      : existingSO.location_id     || '',
      departmentId    : existingSO.department_id   || '',
      subsidiaryId    : existingSO.subsidiary_id   || '',
      memo            : existingSO.memo            || '',
      shippingAmount  : parseFloat(existingSO.shipping_amount) || 0,
      discountAmount  : parseFloat(existingSO.discount_amount) || 0,
      discountAccountId: existingSO.discount_account_id || '',
    });
    if (existingSO.lines?.length) {
      setLines(existingSO.lines.map((l: any, i: number) => ({
        id: 1000 + i,
        dbId           : l.id,
        itemId         : l.item_id         || '',
        description    : l.description     || '',
        quantity       : parseFloat(l.quantity)   || 1,
        unit           : l.uom_code        || l.uom_name || '',
        uomId          : l.uom_id          || '',
        unitPrice      : parseFloat(l.unit_price) || 0,
        discountPercent: parseFloat(l.discount_percent) || 0,
        discountAmount : parseFloat(l.discount_amount) || 0,
        discountAccountId: l.discount_account_id || '',
        qtyOnHand      : parseFloat(l.qty_on_hand) || 0,
        qtyAvailable   : parseFloat(l.qty_available) || 0,
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

  // ── Line editing (PO-style Add / Cancel / Remove) ───────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<SalesOrderLine>(blankLine(0));

  // Recompute discount (reduces amount first) then tax on the net amount
  const recompute = (l: SalesOrderLine): SalesOrderLine => {
    const gross = Number(l.quantity) * Number(l.unitPrice);
    const discountAmount = Math.round(gross * (Number(l.discountPercent) / 100) * 100) / 100;
    const amount = gross - discountAmount;
    const taxAmount = Math.round(amount * (Number(l.taxRate) / 100) * 100) / 100;
    return { ...l, discountAmount, amount, taxAmount };
  };

  const startNew = () => {
    setLineCounter(c => c + 1);
    setEditLine({ ...blankLine(lineCounter + 1) });
    setEditingId(-1);
  };
  const editExisting = (line: SalesOrderLine) => { setEditLine({ ...line }); setEditingId(line.id); };
  const cancelEdit = () => { setEditLine(blankLine(0)); setEditingId(null); };

  const commitEdit = () => {
    if (!editLine.itemId) { toast.error('Item is required'); return; }
    if (editingId === -1) {
      setLineCounter(c => c + 1);
      setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]);
    } else {
      setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    }
    setEditLine(blankLine(0));
    setEditingId(null);
  };

  const removeEditing = () => {
    if (editingId !== null && editingId !== -1) setLines(prev => prev.filter(l => l.id !== editingId));
    setEditLine(blankLine(0));
    setEditingId(null);
  };

  // Update a field on the row being edited, recomputing amounts
  const setEdit = (key: string, value: any) => {
    setEditLine(l => {
      const u: any = { ...l, [key]: value };
      if (key === 'itemId') {
        const item = items.find((i: any) => i.id === value);
        if (item) {
          u.description = item.name || '';
          u.unitPrice = parseFloat(item.sales_price || item.sale_price || item.standard_cost || 0);
          // Default the Unit to the item's Primary Sale Unit (fallback to base uom)
          const opts = (uomUnits || []).filter((x: any) => x.uom_type_id === item.uom_type_id);
          const saleUnit = opts.find((x: any) => x.id === item.sales_uom_id) || opts.find((x: any) => x.is_base_unit) || opts[0];
          u.unit = saleUnit?.name || item.uom_code || '';
          u.uomId = saleUnit?.id || '';
          u.qtyOnHand = parseFloat(item.qty_on_hand || 0);
          u.qtyAvailable = parseFloat(item.qty_available || 0);
        }
      }
      if (key === 'discountAmount') {
        const gross = Number(u.quantity) * Number(u.unitPrice);
        u.discountAmount = Number(value);
        u.discountPercent = gross > 0 ? Math.round((u.discountAmount / gross) * 10000) / 100 : 0;
        const amt = gross - u.discountAmount;
        u.amount = amt;
        u.taxAmount = Math.round(amt * (Number(u.taxRate) / 100) * 100) / 100;
        return u;
      }
      if (key === 'taxCode') {
        const tc = taxCodes.find((t: any) => t.code === value || t.id === value);
        u.taxRate = tc ? parseFloat(tc.rate || 0) : u.taxRate;
      }
      return recompute(u);
    });
  };

  // ── Stock per location for the line being edited ──────────────────────────
  // Effective location = the line's explicit location, else the header location.
  const editLoc = editLine.locationId || form.locationId;
  useEffect(() => {
    if (!editLine.itemId) return;
    const params: any = { itemIds: editLine.itemId };
    if (editLoc) params.locationId = editLoc;
    api.get('/api/sales/stock', { params })
      .then(r => {
        const s = (r.data.data || {})[editLine.itemId];
        setEditLine(l => l.itemId === editLine.itemId
          ? { ...l, qtyOnHand: s ? s.onHand : 0, qtyAvailable: s ? s.available : 0 }
          : l);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLine.itemId, editLoc]);

  // ── Refresh saved lines' stock when the header location changes ────────────
  // Lines with no explicit location follow the header location; lines that carry
  // their own location keep their own per-location stock.
  const itemIdKey = lines.map(l => l.itemId).filter(Boolean).join(',');
  useEffect(() => {
    const ids = Array.from(new Set(lines.map(l => l.itemId).filter(Boolean)));
    if (ids.length === 0) return;
    const params: any = { itemIds: ids.join(',') };
    if (form.locationId) params.locationId = form.locationId;
    api.get('/api/sales/stock', { params })
      .then(r => {
        const map = r.data.data || {};
        setLines(prev => prev.map(l => {
          // Lines with an explicit location different from the header keep their own stock
          if (l.locationId && l.locationId !== form.locationId) return l;
          const s = map[l.itemId];
          return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : { ...l, qtyOnHand: 0, qtyAvailable: 0 };
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId, itemIdKey]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal      = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const taxTotal      = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
  const totalDiscount = lines.reduce((s, l) => s + (l.discountAmount || 0), 0);
  const total         = subtotal + taxTotal + Number(form.shippingAmount);

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
      dueDate         : form.dueDate || null,
      locationId      : form.locationId || null,
      departmentId    : form.departmentId || null,
      subsidiaryId    : form.subsidiaryId || null,
      discountAccountId: form.discountAccountId || null,
      lines: validLines.map(l => ({
        itemId         : l.itemId,
        lineId         : l.dbId || null,
        description    : l.description,
        quantity       : Number(l.quantity),
        unit           : l.unit,
        uomId          : l.uomId || null,
        unitPrice      : Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
        discountAmount : Number(l.discountAmount),
        discountAccountId: l.discountAccountId || null,
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
                    <AutoNumberField type="sales_order" isEdit={isEdit}
                      value={form.documentNumber} assignedNumber={existingSO?.so_number}
                      onChange={v => set('documentNumber', v)} />
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e => setCustomer(e.target.value)}
                        className={dis} required>
                        <option value="">-- Select Customer --</option>
                        {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Order Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.orderDate} onChange={e => setOrderDate(e.target.value)}
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
                    <CurrencyRateField
                      currency={form.currency}
                      exchangeRate={form.exchangeRate}
                      date={form.orderDate}
                      onChange={({ currency, exchangeRate }) => setForm(f => ({ ...f, currency, exchangeRate }))}
                    />
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className={dis}>
                        {paymentTerms.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Due Date</label>
                      <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
                        className={dis}/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)}
                        className={dis} placeholder="Internal notes..."/>
                    </div>
                  </div>
                  {/* Column 3 — Summary */}
                  <div className="space-y-3">
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                      <div className="text-sm">
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{subtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{totalDiscount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{taxTotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100 items-center">
                          <span className="text-slate-600">Shipping</span>
                          <NumberInput value={form.shippingAmount} min={0}
                            onChange={v => set('shippingAmount', v)}
                            className="w-28 border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{total.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </div>
                    {totalDiscount > 0 && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded">
                        <label className="block text-2xs text-slate-500 mb-1">Discount Account (posted to GL as reduction)</label>
                        <select value={form.discountAccountId} onChange={e => set('discountAccountId', e.target.value)}
                          className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                          <option value="">-- Select Discount Account --</option>
                          {discountAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </div>
                    )}
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
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item <span className="text-red-500">*</span></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Disc %</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Disc Account</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map(line => (
                          <tr key={line.id} onClick={() => editExisting(line)}
                            className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                            <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(line.qtyAvailable, line.uomId)}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(line.qtyOnHand, line.uomId)}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                            <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">{line.discountPercent ? `${line.discountPercent}%` : '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">{line.discountAmount > 0 ? line.discountAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{line.discountAmount > 0 ? (accounts.find((a: any) => a.id === line.discountAccountId)?.code || '-') : '-'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{line.taxCode || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{line.taxAmount > 0 ? line.taxAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-slate-800">{Number(line.amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.departmentId)?.name || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.locationId)?.name || '-'}</td>
                          </tr>
                        ))}
                        {editingId !== null && (
                          <tr className="border-t border-blue-300 bg-blue-50/40">
                            <td className="px-1.5 py-1">
                              <select value={editLine.itemId} onChange={e => setEdit('itemId', e.target.value)} autoFocus
                                className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <input value={editLine.description} onChange={e => setEdit('description', e.target.value)}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"/>
                            </td>
                            <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editLine.qtyAvailable, editLine.uomId)}</td>
                            <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editLine.qtyOnHand, editLine.uomId)}</td>
                            <td className="px-1.5 py-1">
                              <input type="number" min="0.001" step="0.001" value={editLine.quantity || ''}
                                onChange={e => setEdit('quantity', Number(e.target.value))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              {(() => {
                                const opts = unitsForItem(editLine.itemId);
                                return opts.length > 0 ? (
                                  <select value={editLine.uomId || ''}
                                    onChange={e => {
                                      const u = opts.find((x: any) => x.id === e.target.value);
                                      setEditLine(l => {
                                        // Re-express unit price in the newly selected unit: pricePerBase * newRate
                                        const oldRate = rateOf(l.uomId);
                                        const newRate = Number(u?.conversion_rate_to_base || 1) || 1;
                                        const newPrice = Math.round((Number(l.unitPrice || 0) / oldRate) * newRate * 100) / 100;
                                        return recompute({ ...l, uomId: e.target.value, unit: u?.name || '', unitPrice: newPrice });
                                      });
                                    }}
                                    className="w-full border border-slate-300 rounded px-1 py-1 bg-white text-xs">
                                    <option value=""></option>
                                    {opts.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                  </select>
                                ) : (
                                  <input value={editLine.unit} onChange={e => setEdit('unit', e.target.value)}
                                    className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"/>
                                );
                              })()}
                            </td>
                            <td className="px-1.5 py-1">
                              <NumberInput value={editLine.unitPrice} min={0} decimals={0}
                                onChange={v => setEditLine(l => recompute({ ...l, unitPrice: v }))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="number" min="0" max="100" step="0.1" value={editLine.discountPercent || ''}
                                onChange={e => setEdit('discountPercent', Number(e.target.value))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              <input readOnly value={editLine.discountAmount > 0 ? editLine.discountAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                                className="w-full border border-slate-100 rounded px-1.5 py-1 bg-slate-50 text-slate-500 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.discountAccountId} disabled={!(editLine.discountAmount > 0)}
                                onChange={e => setEditLine(l => ({ ...l, discountAccountId: e.target.value }))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs disabled:bg-slate-50">
                                <option value=""></option>
                                {discountAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.taxCode} onChange={e => setEdit('taxCode', e.target.value)}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value="">None</option>
                                {taxCodes.map((t: any) => <option key={t.id} value={t.code || t.id}>{t.code} ({t.rate}%)</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <input readOnly value={editLine.taxAmount > 0 ? editLine.taxAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                                className="w-full border border-slate-100 rounded px-1.5 py-1 bg-slate-50 text-slate-500 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              <input readOnly value={editLine.amount > 0 ? editLine.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                                className="w-full border border-slate-100 rounded px-1.5 py-1 bg-slate-50 text-slate-600 text-right text-xs"/>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.departmentId}
                                onChange={e => setEditLine(l => ({ ...l, departmentId: e.target.value }))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.locationId}
                                onChange={e => setEditLine(l => ({ ...l, locationId: e.target.value }))}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </td>
                          </tr>
                        )}
                        {editingId === null && (
                          <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                            <td colSpan={15} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {editingId !== null && (
                      <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                        <button type="button" onClick={commitEdit}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800">
                          <Plus size={11}/> Add
                        </button>
                        <button type="button" onClick={cancelEdit}
                          className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50">
                          <X size={11}/> Cancel
                        </button>
                        <button type="button" onClick={removeEditing}
                          className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50">
                          <Trash2 size={11}/> Remove
                        </button>
                      </div>
                    )}
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
