import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, FileText } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import CurrencyRateField from '../../components/CurrencyRateField';
import AutoNumberField from '../../components/AutoNumberField';
import { computeDueDate } from '../../utils/format';
import toast from 'react-hot-toast';

interface InvoiceLine {
  id: number; itemId: string; description: string;
  qtyOnHand: number; qtyAvailable: number;
  quantity: number; unit: string; uomId: string; unitPrice: number;
  discountPercent: number; discountAmount: number; discountAccountId: string;
  taxCode: string; taxRate: number;
  taxAmount: number; amount: number; departmentId: string; locationId: string;
}
const blankLine = (n: number): InvoiceLine => ({
  id: n, itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0, quantity: 1, unit: '', uomId: '', unitPrice: 0,
  discountPercent: 0, discountAmount: 0, discountAccountId: '',
  taxCode: '', taxRate: 0, taxAmount: 0, amount: 0, departmentId: '', locationId: '',
});

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const soId = searchParams.get('soId');
  const isEdit = !!id && id !== 'new';

  const { customers, items, locations, departments, taxCodes, accounts, paymentTerms, uomUnits } = useFormOptions();
  const discountAccounts = accounts.filter((a: any) =>
    a.subtype === 'sales_discount' || (a.type === 'income' && String(a.name).toLowerCase().includes('discount')));

  // UOM helpers (same as Sales Order form)
  const rateOf = (uomId?: string): number => {
    const u = (uomUnits || []).find((x: any) => x.id === uomId);
    const r = Number(u?.conversion_rate_to_base || 1);
    return r > 0 ? r : 1;
  };
  const stockInUnit = (baseQty: number, uomId?: string): string =>
    (Number(baseQty || 0) / rateOf(uomId)).toLocaleString('id-ID', { maximumFractionDigits: 4 });
  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'items'|'files'>('items');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    customerId: '', documentNumber: '', invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: computeDueDate(new Date().toISOString().split('T')[0], 'Net30'), soId: soId || '', currency: 'IDR', exchangeRate: 1, paymentTerms: 'Net30',
    locationId: '', departmentId: '', subsidiaryId: '', memo: '', discountAccountId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  // Due Date = Invoice Date + Payment Terms; recompute when either changes.
  const setInvoiceDate = (v: string) => setForm(f => ({ ...f, invoiceDate: v, dueDate: computeDueDate(v, f.paymentTerms) }));
  const setPaymentTerms = (v: string) => setForm(f => ({ ...f, paymentTerms: v, dueDate: computeDueDate(f.invoiceDate, v) }));
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  // Header Department/Location cascade to every saved line AND the row being edited,
  // so picking a header Location immediately refreshes that line's Available/On Hand.
  const setHeaderDepartment = (v: string) => {
    set('departmentId', v);
    setLines(prev => prev.map(l => ({ ...l, departmentId: v })));
    setEditLine(l => ({ ...l, departmentId: v }));
  };
  const setHeaderLocation = (v: string) => {
    set('locationId', v);
    setLines(prev => prev.map(l => ({ ...l, locationId: v })));
    setEditLine(l => ({ ...l, locationId: v }));
  };

  const { data: soData } = useQuery({ queryKey: ['so-for-invoice', soId], queryFn: () => api.get(`/api/sales/orders/${soId}`).then(r => r.data.data), enabled: !!soId });
  useEffect(() => {
    if (soData) {
      set('customerId', soData.customer_id);
      set('currency', soData.currency);
      if (soData.due_date) set('dueDate', soData.due_date.split('T')[0]);
      if (soData.payment_terms) set('paymentTerms', soData.payment_terms);
      set('locationId', soData.location_id || '');
      set('departmentId', soData.department_id || '');
      if (soData.lines?.length) {
        setLines(soData.lines.map((l: any, i: number) => {
          const qty = parseFloat(l.quantity) || 1;
          const unitPrice = parseFloat(l.unit_price) || 0;
          const discountAmount = parseFloat(l.discount_amount) || 0;
          const taxRate = parseFloat(l.tax_rate) || 0;
          const amount = (qty * unitPrice) - discountAmount;
          return {
            id: 1000+i, itemId: l.item_id||'', description: l.description||'',
            qtyOnHand: 0, qtyAvailable: 0,
            quantity: qty, unit: l.uom_code || l.uom_name || '', uomId: l.uom_id || '', unitPrice,
            discountPercent: parseFloat(l.discount_percent)||0, discountAmount, discountAccountId: l.discount_account_id||'',
            // Inherit the Sales Order's tax code / rate and recompute tax
            taxCode: l.tax_code || '', taxRate, taxAmount: amount * (taxRate / 100), amount,
            departmentId: l.department_id||'', locationId: l.location_id||'',
          };
        }));
      }
    }
  }, [soData]);

  // EDIT MODE: load the existing invoice
  const { data: existingInvoice } = useQuery({
    queryKey: ['invoice-edit', id],
    queryFn: () => api.get(`/api/sales/invoices/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const [invoiceLoaded, setInvoiceLoaded] = useState(false);
  useEffect(() => {
    if (!isEdit || !existingInvoice || invoiceLoaded) return;
    setForm(f => ({
      ...f,
      customerId: existingInvoice.customer_id || '',
      invoiceDate: existingInvoice.invoice_date?.split('T')[0] || f.invoiceDate,
      dueDate: existingInvoice.due_date?.split('T')[0] || '',
      soId: existingInvoice.so_id || '',
      currency: existingInvoice.currency || f.currency,
      exchangeRate: parseFloat(existingInvoice.exchange_rate) || 1,
      paymentTerms: existingInvoice.payment_terms || f.paymentTerms,
      locationId: existingInvoice.location_id || '',
      departmentId: existingInvoice.department_id || '',
      subsidiaryId: existingInvoice.subsidiary_id || '',
      memo: existingInvoice.memo || '',
      discountAccountId: existingInvoice.discount_account_id || '',
    }));
    if (existingInvoice.lines?.length) {
      setLines(existingInvoice.lines.map((l: any, i: number) => {
        const qty = parseFloat(l.quantity) || 1;
        const unitPrice = parseFloat(l.unit_price) || 0;
        const discountAmount = parseFloat(l.discount_amount) || 0;
        const taxRate = parseFloat(l.tax_rate) || 0;
        const amount = (qty * unitPrice) - discountAmount;
        return {
          id: 1000 + i, itemId: l.item_id || '', description: l.description || '',
          qtyOnHand: 0, qtyAvailable: 0, quantity: qty, unit: l.uom_code || l.uom_name || '', uomId: l.uom_id || '', unitPrice,
          discountPercent: parseFloat(l.discount_percent) || 0, discountAmount, discountAccountId: l.discount_account_id || '',
          taxCode: l.tax_code || '', taxRate, taxAmount: parseFloat(l.tax_amount) || amount * (taxRate / 100), amount,
          departmentId: l.department_id || '', locationId: l.location_id || '',
        };
      }));
    }
    setInvoiceLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingInvoice, isEdit, invoiceLoaded]);

  // ── Line editing (PO-style Add / Cancel / Remove) ─────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null); // -1 = new
  const [editLine, setEditLine] = useState<InvoiceLine>(blankLine(0));

  const recompute = (l: InvoiceLine, changedKey?: string): InvoiceLine => {
    const gross = Number(l.quantity) * Number(l.unitPrice);
    let discountAmount = l.discountAmount;
    let discountPercent = l.discountPercent;
    if (changedKey === 'discountAmount') {
      discountAmount = Number(l.discountAmount);
      discountPercent = gross > 0 ? Math.round((discountAmount / gross) * 10000) / 100 : 0;
    } else {
      discountAmount = Math.round(gross * (Number(discountPercent) / 100) * 100) / 100;
    }
    const amount = gross - discountAmount;
    const taxAmount = Math.round(amount * (Number(l.taxRate) / 100) * 100) / 100;
    return { ...l, discountAmount, discountPercent, amount, taxAmount };
  };

  const setEdit = (key: string, value: any) => {
    setEditLine(l => {
      const u: any = { ...l, [key]: value };
      if (key === 'itemId') {
        const it = items.find((i: any) => i.id === value);
        if (it) {
          u.description = it.name || '';
          u.unitPrice = parseFloat(it.sales_price || it.sale_price || it.standard_cost || 0);
          // Default the Unit to the item's Primary Sale Unit (fallback to base uom)
          const opts = (uomUnits || []).filter((x: any) => x.uom_type_id === it.uom_type_id);
          const saleUnit = opts.find((x: any) => x.id === it.sales_uom_id) || opts.find((x: any) => x.is_base_unit) || opts[0];
          u.unit = saleUnit?.name || it.uom_code || '';
          u.uomId = saleUnit?.id || '';
          // qtyOnHand/qtyAvailable set by the per-location stock effect below
        }
      }
      if (key === 'taxCode') { const tc = taxCodes.find((t: any) => t.code === value || t.id === value); if (tc) u.taxRate = parseFloat(tc.rate || 0); }
      return recompute(u, key);
    });
  };

  // Per-location stock for the line being edited (line location, else header location)
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

  // Refresh saved lines' stock per their location when header location changes
  // Refresh each saved line's stock for its own effective location (line location else header).
  const invLocKey = lines.map(l => `${l.itemId}@${l.locationId || form.locationId || ''}`).filter(Boolean).join(',');
  useEffect(() => {
    const withItem = lines.filter(l => l.itemId);
    if (withItem.length === 0) return;
    // Group items by their effective location, then fetch each location group once.
    const byLoc = new Map<string, string[]>();
    for (const l of withItem) {
      const loc = l.locationId || form.locationId || '';
      if (!byLoc.has(loc)) byLoc.set(loc, []);
      byLoc.get(loc)!.push(l.itemId);
    }
    Promise.all(Array.from(byLoc.entries()).map(([loc, ids]) => {
      const params: any = { itemIds: Array.from(new Set(ids)).join(',') };
      if (loc) params.locationId = loc;
      return api.get('/api/sales/stock', { params }).then(r => ({ loc, map: r.data.data || {} })).catch(() => ({ loc, map: {} }));
    })).then(results => {
      const byLocMap: Record<string, any> = {};
      for (const { loc, map } of results) byLocMap[loc] = map;
      setLines(prev => prev.map(l => {
        if (!l.itemId) return l;
        const loc = l.locationId || form.locationId || '';
        const s = (byLocMap[loc] || {})[l.itemId];
        return s ? { ...l, qtyOnHand: s.onHand, qtyAvailable: s.available } : { ...l, qtyOnHand: 0, qtyAvailable: 0 };
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId, invLocKey]);

  const startNewLine = () => { setLineCounter(c => c + 1); setEditLine({ ...blankLine(lineCounter + 1), departmentId: form.departmentId, locationId: form.locationId }); setEditingId(-1); };
  const editExistingLine = (l: InvoiceLine) => { setEditLine({ ...l }); setEditingId(l.id); };
  const cancelEdit = () => { setEditLine(blankLine(0)); setEditingId(null); };
  const commitEdit = () => {
    if (!editLine.itemId && !editLine.description) { toast.error('Item or description is required'); return; }
    if (editingId === -1) { setLineCounter(c => c + 1); setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]); }
    else setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    setEditLine(blankLine(0)); setEditingId(null);
  };
  const removeEditing = () => {
    if (editingId !== null && editingId !== -1) setLines(prev => prev.filter(l => l.id !== editingId));
    setEditLine(blankLine(0)); setEditingId(null);
  };

  // Subtotal = gross (Qty x Unit Price) summed across lines; discount tracked separately.
  const subtotal = lines.reduce((s,l)=>s+(Number(l.quantity)*Number(l.unitPrice)),0);
  const taxTotal = lines.reduce((s,l)=>s+l.taxAmount,0);
  const totalDiscount = lines.reduce((s,l)=>s+(l.discountAmount||0),0);
  const total = subtotal - totalDiscount + taxTotal;

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/sales/invoices/${id}`, data) : api.post('/api/sales/invoices', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'invoice', String(savedId), api.post.bind(api)); } catch(_) {}
      toast.success(isEdit ? 'Invoice updated' : `Invoice ${res.data.data.invoice_number} created`);
      navigate(`/sales/invoices/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save invoice'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    const validLines = lines.filter(l => l.itemId || l.description);
    if (!validLines.length) { toast.error('At least one line is required'); return; }
    mutation.mutate({
      ...form, soId: form.soId || null, locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null, discountAccountId: form.discountAccountId||null,
      lines: validLines.map(l => ({ itemId: l.itemId||null, description: l.description, quantity: Number(l.quantity), unit: l.unit||null, uomId: l.uomId||null, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent), discountAmount: Number(l.discountAmount), discountAccountId: l.discountAccountId||null, taxCode: l.taxCode||null, taxAmount: Number(l.taxAmount), amount: Number(l.amount), departmentId: l.departmentId||null, locationId: l.locationId||null })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Invoice</span>
              {soData && <span className="text-sm text-slate-500">from SO: {soData.so_number}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/invoices')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=invoice')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="flex">
            <button type="submit" form="inv-form" disabled={mutation.isPending} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-l hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} {isEdit?'Save Changes':'Save'}
            </button>
            <button type="button" className="px-2 py-1.5 bg-blue-700 text-white border-l border-blue-600 rounded-r hover:bg-blue-800">▾</button>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="inv-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary Information */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <AutoNumberField type="invoice" isEdit={isEdit}
                      value={form.documentNumber} assignedNumber={existingInvoice?.invoice_number}
                      onChange={v=>set('documentNumber',v)} />
                    <div><label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e=>set('customerId',e.target.value)} className={dis} required>
                        <option value="">-- Select Customer --</option>
                        {customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Invoice Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Due Date</label>
                      <input type="date" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <CurrencyRateField
                      currency={form.currency}
                      exchangeRate={form.exchangeRate}
                      date={form.invoiceDate}
                      onChange={({ currency, exchangeRate }) => setForm(f => ({ ...f, currency, exchangeRate }))}
                    />
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} className={dis}>
                        {paymentTerms.map((t:string)=><option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`}/></div>
                  </div>
                  {/* Column 3 — Summary (matches Vendor Bill) */}
                  <div className="space-y-3">
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                      <div className="text-sm">
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{subtotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{totalDiscount.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{taxTotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      </div>
                    </div>
                    {totalDiscount > 0 && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded">
                        <label className="block text-2xs text-slate-500 mb-1">Discount Account (posted to GL as reduction)</label>
                        <select value={form.discountAccountId} onChange={e=>set('discountAccountId', e.target.value)}
                          className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                          <option value="">-- Select Discount Account --</option>
                          {discountAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={dis}>
                      <option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>setHeaderDepartment(e.target.value)} className={dis}>
                      <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>setHeaderLocation(e.target.value)} className={dis}>
                      <option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                </div>
              </div>
            )}
          </div>

          {/* Lines + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['items','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='items'?'Items':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='items' && (
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Item</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc %</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Disc Account</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax Amt</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l=>(
                        <tr key={l.id} onClick={()=>editExistingLine(l)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                          <td className="px-3 py-1.5 text-slate-700">{items.find((i:any)=>i.id===l.itemId)?.name || l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(l.qtyAvailable, l.uomId)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(l.qtyOnHand, l.uomId)}</td>
                          <td className="px-3 py-1.5 text-right">{l.quantity.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.unit || '-'}</td>
                          <td className="px-3 py-1.5 text-right">{l.unitPrice.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-1.5 text-right">{l.discountPercent?`${l.discountPercent}%`:'-'}</td>
                          <td className="px-3 py-1.5 text-right">{l.discountAmount>0?l.discountAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.discountAmount>0?(accounts.find((a:any)=>a.id===l.discountAccountId)?.code||'-'):'-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.taxCode||'-'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{l.taxAmount>0?l.taxAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{l.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-1.5 text-slate-500">{departments.find((d:any)=>d.id===l.departmentId)?.name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{locations.find((loc:any)=>loc.id===l.locationId)?.name||'-'}</td>
                        </tr>
                      ))}
                      {editingId !== null && (
                        <tr className="border-t border-blue-300 bg-blue-50/40">
                          <td className="px-1.5 py-1"><select value={editLine.itemId} onChange={e=>setEdit('itemId',e.target.value)} autoFocus className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs"><option value=""></option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}</select></td>
                          <td className="px-1.5 py-1"><input value={editLine.description} onChange={e=>setEdit('description',e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"/></td>
                          <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editLine.qtyAvailable, editLine.uomId)}</td>
                          <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editLine.qtyOnHand, editLine.uomId)}</td>
                          <td className="px-1.5 py-1"><input type="number" min="0.001" step="0.001" value={editLine.quantity||''} onChange={e=>setEdit('quantity',Number(e.target.value))} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                          <td className="px-1.5 py-1">
                            {(() => {
                              const opts = unitsForItem(editLine.itemId);
                              return opts.length > 0 ? (
                                <select value={editLine.uomId || ''}
                                  onChange={e => {
                                    const u = opts.find((x: any) => x.id === e.target.value);
                                    setEditLine(l => {
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
                          <td className="px-1.5 py-1"><NumberInput value={editLine.unitPrice} min={0} onChange={v=>setEdit('unitPrice',v)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                          <td className="px-1.5 py-1"><input type="number" min="0" max="100" step="0.1" value={editLine.discountPercent||''} onChange={e=>setEdit('discountPercent',Number(e.target.value))} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                          <td className="px-1.5 py-1"><input type="number" min="0" step="0.01" value={editLine.discountAmount||''} onChange={e=>setEdit('discountAmount',Number(e.target.value))} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                          <td className="px-1.5 py-1"><select value={editLine.discountAccountId} disabled={!(editLine.discountAmount>0)} onChange={e=>setEdit('discountAccountId',e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs disabled:bg-slate-50"><option value=""></option>{discountAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></td>
                          <td className="px-1.5 py-1"><select value={editLine.taxCode} onChange={e=>setEdit('taxCode',e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs"><option value="">None</option>{taxCodes.map((t:any)=><option key={t.id} value={t.code||t.id}>{t.code} ({t.rate}%)</option>)}</select></td>
                          <td className="px-3 py-1 text-right text-slate-500">{editLine.taxAmount>0?editLine.taxAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                          <td className="px-3 py-1 text-right font-medium">{editLine.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td className="px-1.5 py-1"><select value={editLine.departmentId} onChange={e=>setEdit('departmentId',e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs"><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                          <td className="px-1.5 py-1"><select value={editLine.locationId} onChange={e=>setEdit('locationId',e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs"><option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></td>
                        </tr>
                      )}
                      {editingId === null && (
                        <tr onClick={startNewLine} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                          <td colSpan={15} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {editingId !== null && (
                    <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                      <button type="button" onClick={commitEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                      <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                      <button type="button" onClick={removeEditing} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                    </div>
                  )}
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="inv-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} {isEdit?'Save Changes':'Save'}
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
