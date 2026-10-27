import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, ShoppingCart } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import CurrencyRateField from '../../components/CurrencyRateField';
import AutoNumberField from '../../components/AutoNumberField';
import ApprovalFields from '../../components/transaction/ApprovalFields';
import { computeDueDate } from '../../utils/format';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface POLine {
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
  taxAmt: number;
  amount: number;
  departmentId: string;
  locationId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchaseOrderForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { vendors, items, locations, departments, taxCodes, currencies, paymentTerms, accounts, uomUnits } = useFormOptions();
  const discountAccounts = accounts.filter((a: any) =>
    a.subtype === 'purchase_discount' || (a.type === 'cost_of_goods' && String(a.name).toLowerCase().includes('discount')));

  // Units available for the line currently being edited, based on its item's UOM Type
  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };
  // conversion_rate_to_base for a uom id (base=1). Stock is stored in base units, so
  // dividing a base-unit qty by this rate shows it in the selected transaction unit.
  const rateOf = (uomId?: string): number => {
    const u = (uomUnits || []).find((x: any) => x.id === uomId);
    const r = Number(u?.conversion_rate_to_base || 1);
    return r > 0 ? r : 1;
  };
  // Display a base-unit stock qty converted into the line's selected unit
  const stockInUnit = (baseQty: number, uomId?: string): string => {
    const v = Number(baseQty || 0) / rateOf(uomId);
    return v.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  };

  const { data: subsidiariesData } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });
  const subsidiaries: any[] = subsidiariesData || [];

  // Load existing PO for edit
  const { data: existingPO } = useQuery({
    queryKey: ['po-edit', id],
    queryFn: () => api.get(`/api/purchasing/orders/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  // ── UI state ─────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'files'>('lines');

  // ── File state ────────────────────────────────────────────────────────────
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    vendorId: '',
    documentNumber: '',
    orderDate: new Date().toISOString().split('T')[0],
    expectedReceiptDate: '',
    currency: 'IDR',
    exchangeRate: 1,
    paymentTerms: 'Net30',
    dueDate: computeDueDate(new Date().toISOString().split('T')[0], 'Net30'),
    locationId: '',
    departmentId: '',
    subsidiaryId: '',
    memo: '',
    discountAccountId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  // Recompute Due Date whenever Order Date or Payment Terms change (Due = Order Date + terms)
  const setOrderDate = (v: string) => setForm(f => ({ ...f, orderDate: v, dueDate: computeDueDate(v, f.paymentTerms) }));
  const setPaymentTerms = (v: string) => setForm(f => ({ ...f, paymentTerms: v, dueDate: computeDueDate(f.orderDate, v) }));
  // Selecting a vendor pulls its default Payment Terms from the vendor master and
  // recomputes the Due Date accordingly (user can still override afterwards).
  const setVendor = (vendorId: string) => setForm(f => {
    const v = vendors.find((x: any) => x.id === vendorId);
    const terms = v?.payment_terms || f.paymentTerms;
    return { ...f, vendorId, paymentTerms: terms, dueDate: computeDueDate(f.orderDate, terms) };
  });

  useEffect(() => {
    if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id);
  }, [subsidiaries]);

  // ── Line state ────────────────────────────────────────────────────────────
  const [lineCounter, setLineCounter] = useState(1000);
  const [lines, setLines] = useState<POLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Populate form + lines when editing an existing PO
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!existingPO || initialized) return;
    setForm({
      vendorId: existingPO.vendor_id || '',
      documentNumber: existingPO.po_number || '',
      orderDate: existingPO.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      expectedReceiptDate: existingPO.expected_receipt_date?.split('T')[0] || '',
      currency: existingPO.currency || 'IDR',
      exchangeRate: parseFloat(existingPO.exchange_rate) || 1,
      paymentTerms: existingPO.payment_terms || 'Net30',
      dueDate: existingPO.due_date?.split('T')[0] || computeDueDate(existingPO.order_date?.split('T')[0], existingPO.payment_terms || 'Net30'),
      locationId: existingPO.location_id || '',
      departmentId: existingPO.department_id || '',
      subsidiaryId: existingPO.subsidiary_id || '',
      memo: existingPO.memo || '',
      discountAccountId: existingPO.discount_account_id || '',
    });
    if (existingPO.lines?.length) {
      setLines(existingPO.lines.map((l: any, i: number) => ({
        id: 1000 + i,
        dbId: l.id,
        itemId: l.item_id || '',
        description: l.description || '',
        qtyOnHand: 0, qtyAvailable: 0,
        quantity: parseFloat(l.quantity) || 0,
        unit: l.uom_code || l.uom_name || '',
        uomId: l.uom_id || '',
        unitPrice: parseFloat(l.unit_price) || 0,
        discountPercent: parseFloat(l.discount_percent) || 0,
        discountAmount: parseFloat(l.discount_amount) || 0,
        discountAccountId: l.discount_account_id || '',
        taxCode: l.tax_code || '',
        taxRate: parseFloat(l.tax_rate) || 0,
        taxAmt: parseFloat(l.tax_amount) || 0,
        amount: parseFloat(l.amount) || 0,
        departmentId: l.department_id || '',
        locationId: l.location_id || '',
      })));
      setLineCounter(1000 + existingPO.lines.length);
    }
    setInitialized(true);
  }, [existingPO, initialized]);

  const blankLine = (): POLine => ({
    id: lineCounter, itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0, quantity: 1, unit: '', uomId: '',
    unitPrice: 0, discountPercent: 0, discountAmount: 0, discountAccountId: '', taxCode: '', taxRate: 0, taxAmt: 0, amount: 0,
    departmentId: '', locationId: '',
  });
  const [editLine, setEditLine] = useState<POLine>(blankLine());

  // Stock by chosen location for the line being edited (line location, else header location)
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

  // Refresh saved lines' stock when header location changes
  const poItemKey = lines.map(l => l.itemId).filter(Boolean).join(',');
  useEffect(() => {
    const ids = Array.from(new Set(lines.map(l => l.itemId).filter(Boolean)));
    if (ids.length === 0) return;
    const params: any = { itemIds: ids.join(',') };
    if (form.locationId) params.locationId = form.locationId;
    api.get('/api/sales/stock', { params })
      .then(r => {
        const map = r.data.data || {};
        setLines(prev => prev.map(l => {
          const eff = l.locationId || form.locationId;
          // only auto-refresh lines that follow the header location (no explicit line location)
          if (l.locationId && l.locationId !== form.locationId) return l;
          const s = eff ? map[l.itemId] : map[l.itemId];
          return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : l;
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId, poItemKey]);

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

  // Recompute amount (net of discount) + tax for a line given changed fields
  const recompute = (l: POLine): POLine => {
    const gross = l.quantity * l.unitPrice;
    const discountAmount = Math.round(gross * (l.discountPercent / 100) * 100) / 100;
    const amount = gross - discountAmount;
    const taxAmt = Math.round(amount * (l.taxRate / 100) * 100) / 100;
    return { ...l, discountAmount, amount, taxAmt };
  };

  const grossSubtotal = lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice)), 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmt, 0);
  const totalDiscount = lines.reduce((s, l) => s + (l.discountAmount || 0), 0);
  const netTotal = grossSubtotal - totalDiscount;

  // ── Save ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.put(`/api/purchasing/orders/${id}`, data)
      : api.post('/api/purchasing/orders', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      if (fileRows.some(r => r.file)) {
        try { await uploadFileRows(fileRows, 'purchase_order', savedId, api.post.bind(api)); }
        catch (e: any) { toast.error('PO saved but file upload failed: ' + (e.response?.data?.error || e.message)); }
      }
      toast.success(isEdit ? 'Purchase Order updated' : 'Purchase Order created');
      navigate(`/purchasing/orders/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save PO'),
  });

  const handleSave = () => {
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    if (!form.orderDate) { toast.error('Order Date is required'); return; }
    mutation.mutate({
      ...form,
      expectedReceiptDate: form.expectedReceiptDate || null,
      dueDate: form.dueDate || null,
      locationId: form.locationId || null,
      departmentId: form.departmentId || null,
      subsidiaryId: form.subsidiaryId || null,
      discountAccountId: form.discountAccountId || null,
      lines: lines.map(l => ({
        lineId: l.dbId || null,
        itemId: l.itemId, description: l.description, quantity: l.quantity,
        unit: l.unit, uomId: l.uomId || null, unitPrice: l.unitPrice,
        discountPercent: l.discountPercent, discountAmount: l.discountAmount,
        discountAccountId: l.discountAccountId || null,
        taxCode: l.taxCode, taxRate: l.taxRate, taxAmount: l.taxAmt, taxAmt: l.taxAmt, amount: l.amount,
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
              <h1 className="text-xl font-semibold text-slate-800">{isEdit ? 'Edit Purchase Order' : 'Purchase Order'}</h1>
              {isEdit && existingPO?.po_number && <span className="text-xl font-semibold text-slate-500">{existingPO.po_number}</span>}
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
                  <AutoNumberField type="purchase_order" isEdit={isEdit}
                    value={form.documentNumber} assignedNumber={existingPO?.po_number}
                    onChange={v => set('documentNumber', v)} />
                  <div>
                    <label className={lbl}>Vendor <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.vendorId} onChange={e => setVendor(e.target.value)}>
                      <option value="">-- Select Vendor --</option>
                      {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Order Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} value={form.orderDate} onChange={e => setOrderDate(e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Expected Receipt Date</label>
                    <input type="date" className={inp} value={form.expectedReceiptDate} onChange={e => set('expectedReceiptDate', e.target.value)}/>
                  </div>
                </div>
                <div className="space-y-3">
                  <CurrencyRateField
                    currency={form.currency}
                    exchangeRate={form.exchangeRate}
                    date={form.orderDate}
                    onChange={({ currency, exchangeRate }) => setForm(f => ({ ...f, currency, exchangeRate }))}
                  />
                  <div>
                    <label className={lbl}>Payment Terms</label>
                    <select className={sel} value={form.paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                      {paymentTerms.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Due Date</label>
                    <input type="date" className={inp} value={form.dueDate} onChange={e => set('dueDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Memo</label>
                    <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Internal notes..."/>
                  </div>
                  <ApprovalFields
                    approvalStatus={existingPO?.approval_status}
                    configuredApproverName={existingPO?.configured_approver_name}
                    approvedByName={existingPO?.approved_by_name}
                  />
                </div>
                <div className="space-y-3">
                  {/* Summary box (fixed top-right, always last in column) */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{grossSubtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{totalDiscount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{totalTax.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{(netTotal + totalTax).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                    </div>
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
                      <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditingId(line.id); }}
                        className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                        <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(line.qtyAvailable, line.uomId)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(line.qtyOnHand, line.uomId)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{line.discountPercent ? `${line.discountPercent}%` : '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{line.discountAmount > 0 ? line.discountAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{line.discountAmount > 0 ? (accounts.find((a: any) => a.id === line.discountAccountId)?.code || '-') : '-'}</td>
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
                              const unitPrice = item ? parseFloat(item.last_purchase_price || item.purchase_price || item.standard_cost || 0) : 0;
                              // Default the Unit to the item's Primary Purchase Unit (fallback to base uom)
                              const opts = (uomUnits || []).filter((u: any) => u.uom_type_id === item?.uom_type_id);
                              const purchaseUnit = opts.find((u: any) => u.id === item?.purchase_uom_id) || opts.find((u: any) => u.is_base_unit) || opts[0];
                              const unit = purchaseUnit?.name || item?.uom_code || item?.uom || '';
                              const uomId = purchaseUnit?.id || '';
                              // qtyOnHand/qtyAvailable set by the stock-by-location effect
                              setEditLine(l => recompute({ ...l, itemId: e.target.value, description: item?.name || '', unit, uomId, unitPrice }));
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
                        <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editLine.qtyAvailable, editLine.uomId)}</td>
                        <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editLine.qtyOnHand, editLine.uomId)}</td>
                        <td className="px-1.5 py-1">
                          <input type="number" step="0.001" value={editLine.quantity || ''}
                            onChange={e => setEditLine(l => recompute({ ...l, quantity: Number(e.target.value) }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          {(() => {
                            const opts = unitsForItem(editLine.itemId);
                            return opts.length > 0 ? (
                              <select value={editLine.uomId || ''}
                                onChange={e => {
                                  const u = opts.find((x: any) => x.id === e.target.value);
                                  setEditLine(l => {
                                    // Re-express the unit price in the newly selected unit:
                                    // pricePerBase = oldPrice / oldRate ; newPrice = pricePerBase * newRate
                                    const oldRate = rateOf(l.uomId);
                                    const newRate = Number(u?.conversion_rate_to_base || 1) || 1;
                                    const newPrice = Math.round((Number(l.unitPrice || 0) / oldRate) * newRate * 100) / 100;
                                    return recompute({ ...l, uomId: e.target.value, unit: u?.name || '', unitPrice: newPrice });
                                  });
                                }}
                                className="w-full border border-slate-300 rounded text-xs px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                                <option value=""></option>
                                {opts.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            ) : (
                              <input type="text" value={editLine.unit}
                                onChange={e => setEditLine(l => ({ ...l, unit: e.target.value }))}
                                placeholder="pcs"
                                className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>
                            );
                          })()}
                        </td>
                        <td className="px-1.5 py-1">
                          <NumberInput value={editLine.unitPrice} min={0}
                            onChange={v => setEditLine(l => recompute({ ...l, unitPrice: v }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="number" step="0.01" min="0" max="100" value={editLine.discountPercent || ''}
                            onChange={e => setEditLine(l => recompute({ ...l, discountPercent: Number(e.target.value) }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input readOnly value={editLine.discountAmount > 0 ? editLine.discountAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                            className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.discountAccountId} disabled={!(editLine.discountAmount > 0)}
                            onChange={e => setEditLine(l => ({ ...l, discountAccountId: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50">
                            <option value=""></option>
                            {discountAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.taxCode}
                            onChange={e => setEditLine(l => recompute({ ...l, taxCode: e.target.value, taxRate: getTaxRate(e.target.value) }))}
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
                        <td colSpan={15} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
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
