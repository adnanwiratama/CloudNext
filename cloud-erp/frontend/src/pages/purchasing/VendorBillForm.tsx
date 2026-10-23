import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, FileText } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import CurrencyRateField from '../../components/CurrencyRateField';
import AutoNumberField from '../../components/AutoNumberField';
import { computeDueDate } from '../../utils/format';
import toast from 'react-hot-toast';

interface ItemLine {
  id: number; kind: 'item'; poLineId?: string; poMaxQty?: number;
  itemId: string; description: string; qtyOnHand: number; qtyAvailable: number;
  qty: number; unitPrice: number; discountPercent: number; discountAmount: number; discountAccountId: string;
  uomId: string; uom: string;
  taxCode: string; taxRate: number; taxAmt: number; amount: number; departmentId: string; locationId: string;
}
interface ExpenseLine {
  id: number; kind: 'expense';
  accountId: string; description: string; amount: number;
  taxCode: string; taxRate: number; taxAmt: number; departmentId: string; locationId: string;
}
type BillLine = ItemLine | ExpenseLine;

const blankItem = (id: number): ItemLine => ({
  id, kind: 'item', itemId: '', description: '', qtyOnHand: 0, qtyAvailable: 0,
  qty: 1, unitPrice: 0, discountPercent: 0, discountAmount: 0, discountAccountId: '',
  uomId: '', uom: '',
  taxCode: '', taxRate: 0, taxAmt: 0, amount: 0, departmentId: '', locationId: '',
});
const blankExpense = (id: number): ExpenseLine => ({
  id, kind: 'expense', accountId: '', description: '', amount: 0,
  taxCode: '', taxRate: 0, taxAmt: 0, departmentId: '', locationId: '',
});

export default function VendorBillForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { vendors, items, accounts, locations, departments, taxCodes, uomUnits } = useFormOptions();
  const expenseAccounts = accounts.filter((a: any) => ['expense', 'cost_of_goods', 'other_expense'].includes(a.type));
  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };
  const rateOf = (uomId?: string): number => {
    const u = (uomUnits || []).find((x: any) => x.id === uomId);
    const r = Number(u?.conversion_rate_to_base || 1);
    return r > 0 ? r : 1;
  };
  const stockInUnit = (baseQty: number, uomId?: string): string =>
    (Number(baseQty || 0) / rateOf(uomId)).toLocaleString('id-ID', { maximumFractionDigits: 4 });
  const discountAccounts = accounts.filter((a: any) =>
    a.subtype === 'purchase_discount' || (a.type === 'cost_of_goods' && String(a.name).toLowerCase().includes('discount')));
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const preVendorId = searchParams.get('vendorId') || '';
  const prePoId = searchParams.get('poId') || '';
  const fromPO = !!prePoId;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [tab, setTab] = useState<'lines' | 'files'>('lines');
  const [lineSubTab, setLineSubTab] = useState<'item' | 'expense'>('item');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [counter, setCounter] = useState(1000);

  const [form, setForm] = useState({
    vendorId: preVendorId, billDate: new Date().toISOString().split('T')[0],
    dueDate: computeDueDate(new Date().toISOString().split('T')[0], 'net30'), billNumber: '', documentNumber: '', purchaseOrderId: prePoId, poNumber: '', currency: 'IDR', exchangeRate: 1,
    paymentTerms: 'net30', locationId: '', departmentId: '', subsidiaryId: '', memo: '', taxRate: 0,
    discountAccountId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  // Due Date auto = Bill Date + Payment Terms (reactive, still editable). computeDueDate
  // pulls the number out of terms like "net60" / "Net 60" → 60 days.
  const setBillDate = (v: string) => setForm(f => ({ ...f, billDate: v, dueDate: computeDueDate(v, f.paymentTerms) }));
  const setPaymentTerms = (v: string) => setForm(f => ({ ...f, paymentTerms: v, dueDate: computeDueDate(f.billDate, v) }));

  const [itemLines, setItemLines] = useState<ItemLine[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);

  // Editing state (shared cursor: editingKind + editingId)
  const [editingKind, setEditingKind] = useState<'item' | 'expense' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null); // -1 = new
  const [editItem, setEditItem] = useState<ItemLine>(blankItem(0));
  const [editExpense, setEditExpense] = useState<ExpenseLine>(blankExpense(0));

  // ── Prefill from PO ────────────────────────────────────────────────────────
  const { data: poData } = useQuery({
    queryKey: ['po-for-bill', prePoId],
    queryFn: () => api.get(`/api/purchasing/orders/${prePoId}`).then(r => r.data.data),
    enabled: !!prePoId && !isEdit,
  });
  const [poLoaded, setPoLoaded] = useState(false);
  useEffect(() => {
    if (isEdit || !poData || poLoaded) return;
    setForm(f => ({
      ...f,
      vendorId: poData.vendor_id || f.vendorId,
      purchaseOrderId: poData.id, poNumber: poData.po_number || '',
      currency: poData.currency || f.currency,
      paymentTerms: poData.payment_terms || f.paymentTerms,
      dueDate: poData.due_date?.split('T')[0] || f.dueDate,
      subsidiaryId: poData.subsidiary_id || '',
      locationId: poData.location_id || '',
      departmentId: poData.department_id || '',
    }));
    if (poData.lines?.length) {
      let c = 1000;
      // Default qty to the PO remaining unbilled amount (ordered qty − already billed qty)
      const billableLines = poData.lines
        .map((l: any) => {
          const ordered = parseFloat(l.quantity) || 0;
          const billed = parseFloat(l.qty_billed) || 0;
          const billQty = Math.max(0, ordered - billed);
          return { l, ordered, billed, billQty };
        })
        .filter((x: any) => x.billQty > 0);
      setItemLines(billableLines.map(({ l, ordered, billQty }: any) => {
        const unitPrice = parseFloat(l.unit_price) || 0;
        const ratio = ordered > 0 ? billQty / ordered : 1;
        const disc = Math.round((parseFloat(l.discount_amount) || 0) * ratio * 100) / 100;
        const taxAmt = Math.round((parseFloat(l.tax_amount) || 0) * ratio * 100) / 100;
        return {
          id: ++c, kind: 'item' as const, poLineId: l.id, poMaxQty: billQty, itemId: l.item_id || '', description: l.description || '',
          uomId: l.uom_id || '', uom: l.uom_code || l.uom_name || '',
          qtyOnHand: 0, qtyAvailable: 0, qty: billQty, unitPrice,
          discountPercent: parseFloat(l.discount_percent) || 0, discountAmount: disc,
          discountAccountId: l.discount_account_id || '',
          taxCode: l.tax_code || '', taxRate: parseFloat(l.tax_rate) || 0,
          taxAmt, amount: billQty * unitPrice - disc,
          departmentId: l.department_id || '', locationId: l.location_id || '',
        };
      }));
      setCounter(c);
    }
    setPoLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poData, poLoaded]);

  // ── EDIT MODE: load the existing bill ───────────────────────────────────────
  const { data: existingBill } = useQuery({
    queryKey: ['vendor-bill-edit', id],
    queryFn: () => api.get(`/api/purchasing/bills/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const [billLoaded, setBillLoaded] = useState(false);
  useEffect(() => {
    if (!isEdit || !existingBill || billLoaded) return;
    setForm(f => ({
      ...f,
      vendorId: existingBill.vendor_id || '', billDate: existingBill.bill_date?.split('T')[0] || f.billDate,
      dueDate: existingBill.due_date?.split('T')[0] || '', billNumber: existingBill.vendor_bill_number || '',
      purchaseOrderId: existingBill.po_id || '', poNumber: existingBill.po_number || '',
      currency: existingBill.currency || f.currency, exchangeRate: parseFloat(existingBill.exchange_rate) || 1, paymentTerms: existingBill.payment_terms || f.paymentTerms,
      locationId: existingBill.location_id || '', departmentId: existingBill.department_id || '',
      subsidiaryId: existingBill.subsidiary_id || '', memo: existingBill.memo || '',
      discountAccountId: existingBill.discount_account_id || '',
    }));
    if (existingBill.lines?.length) {
      let c = 1000;
      const newItemLines: ItemLine[] = [];
      const newExpenseLines: ExpenseLine[] = [];
      for (const l of existingBill.lines) {
        if (l.item_id) {
          const qty = parseFloat(l.quantity) || 0;
          const unitPrice = parseFloat(l.unit_price) || 0;
          newItemLines.push({
            id: ++c, kind: 'item', poLineId: l.po_line_id || undefined, itemId: l.item_id,
            description: l.description || '', qtyOnHand: 0, qtyAvailable: 0, qty, unitPrice,
            discountPercent: parseFloat(l.discount_percent) || 0, discountAmount: parseFloat(l.discount_amount) || 0,
            discountAccountId: l.discount_account_id || '', uomId: l.uom_id || '', uom: l.uom_code || l.uom_name || '',
            taxCode: l.tax_code || '', taxRate: parseFloat(l.tax_rate) || 0, taxAmt: parseFloat(l.tax_amount) || 0,
            amount: parseFloat(l.amount) || 0, departmentId: l.department_id || '', locationId: l.location_id || '',
          });
        } else {
          newExpenseLines.push({
            id: ++c, kind: 'expense', accountId: l.expense_account_id || l.account_id || '', description: l.description || '',
            amount: parseFloat(l.amount) || 0, taxCode: l.tax_code || '', taxRate: parseFloat(l.tax_rate) || 0,
            taxAmt: parseFloat(l.tax_amount) || 0, departmentId: l.department_id || '', locationId: l.location_id || '',
          });
        }
      }
      setItemLines(newItemLines);
      setExpenseLines(newExpenseLines);
      setCounter(c);
    }
    setBillLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingBill, isEdit, billLoaded]);

  // ── Recompute helpers ────────────────────────────────────────────────────
  const recomputeItem = (l: ItemLine, changedKey?: string): ItemLine => {
    const gross = Number(l.qty) * Number(l.unitPrice);
    let discountAmount = l.discountAmount;
    let discountPercent = l.discountPercent;
    if (changedKey === 'discountAmount') {
      discountAmount = Number(l.discountAmount);
      discountPercent = gross > 0 ? Math.round((discountAmount / gross) * 10000) / 100 : 0;
    } else {
      discountAmount = Math.round(gross * (Number(discountPercent) / 100) * 100) / 100;
    }
    const amount = gross - discountAmount;
    const taxAmt = Math.round(amount * (Number(l.taxRate) / 100) * 100) / 100;
    return { ...l, discountAmount, discountPercent, amount, taxAmt };
  };

  const setEI = (key: string, value: any) => {
    setEditItem(l => {
      const u: any = { ...l, [key]: value };
      // Bill qty cannot exceed the PO remaining unbilled qty (when billing from a PO line)
      if (key === 'qty' && l.poMaxQty != null && Number(value) > Number(l.poMaxQty)) {
        u.qty = Number(l.poMaxQty);
        toast.error(`Qty cannot exceed remaining PO qty (${l.poMaxQty})`);
      }
      if (key === 'itemId') {
        const it = items.find((i: any) => i.id === value);
        if (it) {
          u.description = it.name;
          u.unitPrice = parseFloat(it.last_purchase_price || it.purchase_price || it.standard_cost || 0);
          u.qtyOnHand = parseFloat(it.qty_on_hand || 0);
          u.qtyAvailable = parseFloat(it.qty_available || 0);
          // Default UOM to the item's Primary Purchase Unit (standalone bill)
          const opts = (uomUnits || []).filter((x: any) => x.uom_type_id === it.uom_type_id);
          const purchaseUnit = opts.find((x: any) => x.id === it.purchase_uom_id) || opts.find((x: any) => x.is_base_unit) || opts[0];
          u.uomId = purchaseUnit?.id || '';
          u.uom = purchaseUnit?.name || it.uom_code || '';
        }
      }
      if (key === 'taxCode') { const tc = taxCodes.find((t: any) => t.code === value || t.id === value); if (tc) u.taxRate = parseFloat(tc.rate || 0); }
      return recomputeItem(u, key);
    });
  };
  const setEE = (key: string, value: any) => {
    setEditExpense(l => {
      const u: any = { ...l, [key]: value };
      if (key === 'taxCode') { const tc = taxCodes.find((t: any) => t.code === value || t.id === value); if (tc) u.taxRate = parseFloat(tc.rate || 0); }
      u.taxAmt = Math.round(Number(u.amount) * (Number(u.taxRate) / 100) * 100) / 100;
      return u;
    });
  };

  // ── Add / edit / cancel / remove ───────────────────────────────────────────
  const startNewItem = () => { setCounter(c => c + 1); setEditItem(blankItem(counter + 1)); setEditingKind('item'); setEditingId(-1); };
  const startNewExpense = () => { setCounter(c => c + 1); setEditExpense(blankExpense(counter + 1)); setEditingKind('expense'); setEditingId(-1); };
  const editItemRow = (l: ItemLine) => { setEditItem({ ...l }); setEditingKind('item'); setEditingId(l.id); };
  const editExpenseRow = (l: ExpenseLine) => { setEditExpense({ ...l }); setEditingKind('expense'); setEditingId(l.id); };
  const cancelEdit = () => { setEditingKind(null); setEditingId(null); };

  const commitEdit = () => {
    if (editingKind === 'item') {
      if (!editItem.itemId && !editItem.description) { toast.error('Item or description is required'); return; }
      if (editingId === -1) { setCounter(c => c + 1); setItemLines(p => [...p, { ...editItem, id: counter + 1 }]); }
      else setItemLines(p => p.map(l => l.id === editingId ? editItem : l));
    } else if (editingKind === 'expense') {
      if (!editExpense.accountId) { toast.error('Expense account is required'); return; }
      if (editingId === -1) { setCounter(c => c + 1); setExpenseLines(p => [...p, { ...editExpense, id: counter + 1 }]); }
      else setExpenseLines(p => p.map(l => l.id === editingId ? editExpense : l));
    }
    setEditingKind(null); setEditingId(null);
  };
  const removeEditing = () => {
    if (editingId !== null && editingId !== -1) {
      if (editingKind === 'item') setItemLines(p => p.filter(l => l.id !== editingId));
      else setExpenseLines(p => p.filter(l => l.id !== editingId));
    }
    setEditingKind(null); setEditingId(null);
  };

  // ── Totals (items + expenses) ──────────────────────────────────────────────
  // Subtotal = GROSS (Qty x Unit Price) for items + expense amounts
  const itemsGross = itemLines.reduce((s, l) => s + (Number(l.qty) * Number(l.unitPrice)), 0);
  const expSubtotal = expenseLines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const subtotal = itemsGross + expSubtotal;
  const taxTotal = itemLines.reduce((s, l) => s + l.taxAmt, 0) + expenseLines.reduce((s, l) => s + l.taxAmt, 0);
  const totalDiscount = itemLines.reduce((s, l) => s + (l.discountAmount || 0), 0);
  const total = subtotal - totalDiscount + taxTotal;

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/purchasing/bills/${id}`, data) : api.post('/api/purchasing/bills', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'vendor_bill', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(isEdit ? 'Vendor bill updated' : 'Vendor bill recorded');
      navigate(`/purchasing/bills/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save bill'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    const lines = [
      ...itemLines.map(l => ({
        poLineId: l.poLineId || null, uomId: l.uomId || null,
        itemId: l.itemId || null, description: l.description, qty: l.qty, unitPrice: l.unitPrice,
        discountPercent: l.discountPercent, discountAmount: l.discountAmount, discountAccountId: l.discountAccountId || null,
        accountId: null, taxCode: l.taxCode || null, taxAmt: l.taxAmt, amount: l.amount,
        departmentId: l.departmentId || null, locationId: l.locationId || null,
      })),
      ...expenseLines.map(l => ({
        itemId: null, description: l.description, qty: 1, unitPrice: Number(l.amount),
        discountPercent: 0, discountAmount: 0, discountAccountId: null,
        accountId: l.accountId || null, taxCode: l.taxCode || null, taxAmt: l.taxAmt, amount: Number(l.amount),
        departmentId: l.departmentId || null, locationId: l.locationId || null,
      })),
    ];
    mutation.mutate({
      ...form, purchaseOrderId: form.purchaseOrderId || null, locationId: form.locationId || null,
      departmentId: form.departmentId || null, subsidiaryId: form.subsidiaryId || null,
      discountAccountId: form.discountAccountId || null,
      lines, subtotal, taxAmount: taxTotal, totalAmount: total,
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';
  const cell = 'w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Vendor Bill' : 'Vendor Bill'}</span>
              {form.poNumber && <span className="text-sm text-slate-500">from PO: {form.poNumber}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/bills')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_bill')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="bill-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="bill-form" onSubmit={handleSubmit}>
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
                    <AutoNumberField type="vendor_bill" isEdit={isEdit}
                      value={form.documentNumber} assignedNumber={existingBill?.bill_number}
                      onChange={v=>set('documentNumber',v)} />
                    <div><label className="block text-xs text-slate-500 mb-1">Vendor <span className="text-red-500">*</span></label>
                      <select value={form.vendorId} onChange={e=>set('vendorId',e.target.value)} className={dis} required>
                        <option value="">-- Select Vendor --</option>{vendors.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Bill Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.billDate} onChange={e=>setBillDate(e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Due Date</label>
                      <input type="date" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Vendor Invoice #</label>
                      <input value={form.billNumber} onChange={e=>set('billNumber',e.target.value)} className={dis} placeholder="Vendor's invoice number"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">PO Reference</label>
                      <input readOnly value={form.poNumber || '-'} className={`${dis} bg-slate-50 text-blue-700 font-mono`}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} className={dis}>
                        <option value="immediate">Immediate</option><option value="net15">Net 15</option><option value="net30">Net 30</option><option value="net60">Net 60</option><option value="net90">Net 90</option>
                      </select></div>
                    <CurrencyRateField
                      currency={form.currency}
                      exchangeRate={form.exchangeRate}
                      date={form.billDate}
                      onChange={({ currency, exchangeRate }) => setForm(f => ({ ...f, currency, exchangeRate }))}
                    />
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`}/></div>
                  </div>
                  <div className="space-y-3">
                    {/* Summary box (fixed top-right, always last in column) */}
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                      <div className="text-sm">
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{subtotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{totalDiscount.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{taxTotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                        <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      </div>
                    </div>
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

          {/* Item & Expenses + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {([['lines','Item & Expenses'],['files','Files']] as const).map(([key,label])=>(
                <button key={key} type="button" onClick={()=>setTab(key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===key?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab==='lines' && (
                <div>
                  {/* Sub-tabs */}
                  <div className="flex gap-1 mb-3">
                    {([['item',`Item (${itemLines.length})`],['expense',`Expenses (${expenseLines.length})`]] as const).map(([key,label])=>(
                      <button key={key} type="button" onClick={()=>{setLineSubTab(key); cancelEdit();}}
                        className={`px-3 py-1.5 text-xs font-medium rounded ${lineSubTab===key?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500 hover:text-slate-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── ITEM sub-tab ── */}
                  {lineSubTab==='item' && (
                    <div className="border border-slate-200 rounded overflow-x-auto">
                      <table className="w-full text-xs min-w-max">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Description</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">UOM</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Unit Price</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc %</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Disc Account</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Tax</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemLines.map(l => (
                            <tr key={l.id} onClick={()=>editItemRow(l)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                              <td className="px-3 py-1.5 text-slate-700">{items.find((i:any)=>i.id===l.itemId)?.name || '-'}</td>
                              <td className="px-3 py-1.5 text-slate-600">{l.description || '-'}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-600">{stockInUnit(l.qtyAvailable, l.uomId)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{stockInUnit(l.qtyOnHand, l.uomId)}</td>
                              <td className="px-3 py-1.5 text-right">{l.qty.toLocaleString('id-ID')}</td>
                              <td className="px-3 py-1.5 text-slate-600">{l.uom || '-'}</td>
                              <td className="px-3 py-1.5 text-right">{l.unitPrice.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                              <td className="px-3 py-1.5 text-right">{l.discountPercent?`${l.discountPercent}%`:'-'}</td>
                              <td className="px-3 py-1.5 text-right">{l.discountAmount>0?l.discountAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                              <td className="px-3 py-1.5 text-slate-600">{l.discountAmount>0?(accounts.find((a:any)=>a.id===l.discountAccountId)?.code || '-'):'-'}</td>
                              <td className="px-3 py-1.5">{l.taxCode||'-'}</td>
                              <td className="px-3 py-1.5 text-right font-medium">{l.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                            </tr>
                          ))}
                          {editingKind==='item' && (
                            <tr className="border-t border-blue-300 bg-blue-50/40">
                              <td className="px-1.5 py-1"><select value={editItem.itemId} onChange={e=>setEI('itemId',e.target.value)} autoFocus className={`${cell} bg-white`}><option value=""></option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}</select></td>
                              <td className="px-1.5 py-1"><input value={editItem.description} onChange={e=>setEI('description',e.target.value)} className={cell}/></td>
                              <td className="px-1.5 py-1 text-right text-emerald-600">{stockInUnit(editItem.qtyAvailable, editItem.uomId)}</td>
                              <td className="px-1.5 py-1 text-right text-slate-500">{stockInUnit(editItem.qtyOnHand, editItem.uomId)}</td>
                              <td className="px-1.5 py-1"><input type="number" min="0" step="0.001" value={editItem.qty||''} onChange={e=>setEI('qty',Number(e.target.value))} className={`${cell} text-right`}/></td>
                              <td className="px-1.5 py-1">
                                {fromPO ? (
                                  <input readOnly value={editItem.uom || '-'} className={`${cell} bg-slate-50 text-slate-600`} title="Inherited from PO"/>
                                ) : (() => {
                                  const opts = unitsForItem(editItem.itemId);
                                  return opts.length > 0 ? (
                                    <select value={editItem.uomId || ''} onChange={e=>{ const un=opts.find((x:any)=>x.id===e.target.value); setEditItem(l=>{ const oldRate=rateOf(l.uomId); const newRate=Number(un?.conversion_rate_to_base||1)||1; const newPrice=Math.round((Number(l.unitPrice||0)/oldRate)*newRate*100)/100; return recomputeItem({...l, uomId:e.target.value, uom:un?.name||'', unitPrice:newPrice}); }); }} className={`${cell} bg-white`}>
                                      <option value=""></option>
                                      {opts.map((un:any)=><option key={un.id} value={un.id}>{un.name}</option>)}
                                    </select>
                                  ) : (
                                    <input value={editItem.uom} onChange={e=>setEditItem(l=>({...l, uom:e.target.value}))} className={cell}/>
                                  );
                                })()}
                              </td>
                              <td className="px-1.5 py-1"><NumberInput value={editItem.unitPrice} min={0} onChange={v=>setEI('unitPrice',v)} className={`${cell} text-right`}/></td>
                              <td className="px-1.5 py-1"><input type="number" min="0" max="100" step="0.01" value={editItem.discountPercent||''} onChange={e=>setEI('discountPercent',Number(e.target.value))} className={`${cell} text-right`}/></td>
                              <td className="px-1.5 py-1"><input type="number" min="0" step="0.01" value={editItem.discountAmount||''} onChange={e=>setEI('discountAmount',Number(e.target.value))} className={`${cell} text-right`}/></td>
                              <td className="px-1.5 py-1"><select value={editItem.discountAccountId} disabled={!(editItem.discountAmount>0)} onChange={e=>setEI('discountAccountId',e.target.value)} className={`${cell} bg-white disabled:bg-slate-50`}><option value=""></option>{discountAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></td>
                              <td className="px-1.5 py-1"><select value={editItem.taxCode} onChange={e=>setEI('taxCode',e.target.value)} className={`${cell} bg-white`}><option value="">None</option>{taxCodes.map((t:any)=><option key={t.id} value={t.code||t.id}>{t.code} ({t.rate}%)</option>)}</select></td>
                              <td className="px-3 py-1 text-right font-medium">{editItem.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                            </tr>
                          )}
                          {editingKind==null && (
                            <tr onClick={startNewItem} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                              <td colSpan={12} className="px-3 py-2 text-slate-400 text-xs italic">Click to add an item line...</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {editingKind==='item' && (
                        <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                          <button type="button" onClick={commitEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                          <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                          <button type="button" onClick={removeEditing} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── EXPENSE sub-tab (like Write Check) ── */}
                  {lineSubTab==='expense' && (
                    <div className="border border-slate-200 rounded overflow-x-auto">
                      <table className="w-full text-xs min-w-max">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56">Account (Expense)</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Memo / Description</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenseLines.map(l => (
                            <tr key={l.id} onClick={()=>editExpenseRow(l)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                              <td className="px-3 py-1.5 text-slate-700">{(() => { const a = accounts.find((x:any)=>x.id===l.accountId); return a ? `${a.code} - ${a.name}` : '-'; })()}</td>
                              <td className="px-3 py-1.5 text-slate-600">{l.description || '-'}</td>
                              <td className="px-3 py-1.5">{l.taxCode||'-'}</td>
                              <td className="px-3 py-1.5 text-slate-500">{departments.find((d:any)=>d.id===l.departmentId)?.name || '-'}</td>
                              <td className="px-3 py-1.5 text-right font-medium">{Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                            </tr>
                          ))}
                          {editingKind==='expense' && (
                            <tr className="border-t border-blue-300 bg-blue-50/40">
                              <td className="px-1.5 py-1"><select value={editExpense.accountId} onChange={e=>setEE('accountId',e.target.value)} autoFocus className={`${cell} bg-white`}><option value=""></option>{expenseAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></td>
                              <td className="px-1.5 py-1"><input value={editExpense.description} onChange={e=>setEE('description',e.target.value)} className={cell}/></td>
                              <td className="px-1.5 py-1"><select value={editExpense.taxCode} onChange={e=>setEE('taxCode',e.target.value)} className={`${cell} bg-white`}><option value="">None</option>{taxCodes.map((t:any)=><option key={t.id} value={t.code||t.id}>{t.code} ({t.rate}%)</option>)}</select></td>
                              <td className="px-1.5 py-1"><select value={editExpense.departmentId} onChange={e=>setEE('departmentId',e.target.value)} className={`${cell} bg-white`}><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                              <td className="px-1.5 py-1"><NumberInput value={editExpense.amount} min={0} onChange={v=>setEE('amount',v)} className={`${cell} text-right`}/></td>
                            </tr>
                          )}
                          {editingKind==null && (
                            <tr onClick={startNewExpense} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                              <td colSpan={5} className="px-3 py-2 text-slate-400 text-xs italic">Click to add an expense line...</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {editingKind==='expense' && (
                        <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                          <button type="button" onClick={commitEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                          <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                          <button type="button" onClick={removeEditing} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                        </div>
                      )}
                    </div>
                  )}


                </div>
              )}
              {tab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="bill-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
