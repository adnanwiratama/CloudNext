import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Copy, ArrowDownToLine, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';
import ApprovalFields from '../../components/transaction/ApprovalFields';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ExpenseLine {
  id: number;
  accountId: string;
  amount: number;
  taxCode: string;
  taxRate: number;
  taxAmt: number;
  grossAmt: number;
  memo: string;
  department: string;
  location: string;
}

interface ItemLine {
  id: number;
  itemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxCode: string;
  taxRate: number;
  taxAmt: number;
  grossAmt: number;
  memo: string;
  department: string;
  location: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WriteChecksForm() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const isEdit   = !!id && id !== 'new';
  const { vendors, accounts, locations, customers, departments, taxCodes, items } = useFormOptions();

  const bankAccounts    = accounts.filter((a: any) => ['1010','1020','1025','1030'].includes(a.code) || a.subtype === 'bank' || a.is_bank);
  const expenseAccounts = accounts.filter((a: any) => a.type === 'expense' || a.type === 'other_expense' || (a.code && parseInt(a.code) >= 5000 && parseInt(a.code) < 7000));

  const { data: periodsData }     = useQuery({ queryKey: ['accounting-periods'], queryFn: () => api.get('/api/settings/accounting-periods').then(r => r.data.data || []) });
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'],        queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const periods     : any[] = periodsData     || [];
  const subsidiaries: any[] = subsidiariesData || [];

  const payees = [
    ...vendors.map((v: any) => ({ id: v.id, name: v.name, type: 'vendor' })),
    ...customers.map((c: any) => ({ id: c.id, name: c.name, type: 'customer' })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const { data: existingCheck } = useQuery({
    queryKey: ['check-edit', id],
    queryFn: () => api.get(`/api/bank/checks/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  // Auto-Generated Number config for Write Check (bank_check): tells us whether the
  // user may enter a manual document number and the next auto-number preview.
  const { data: numberConfig } = useQuery({
    queryKey: ['auto-number', 'bank_check'],
    queryFn: () => api.get('/api/settings/auto-numbers/by-type/bank_check').then(r => r.data.data),
  });
  const allowOverride = !!numberConfig?.allowOverride;
  const numberPreview = numberConfig?.preview || 'To Be Generated';

  // ── UI state ───────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen,   setClassOpen]   = useState(true);
  const [lineTab,     setLineTab]     = useState<'expenses'|'items'|'files'>('expenses');

  // ── File state ──────────────────────────────────────────────────────────────
  const [fileRows, setFileRows] = useState<Array<{ id: string; file: File|null; title: string; description: string; folder: string }>>([
    { id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' },
  ]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [initialized, setInitialized] = useState(false);
  const [form, setForm] = useState({
    bankAccountId : '',
    balance       : 0,
    checkDate     : new Date().toISOString().split('T')[0],
    postingPeriodId: '',
    checkNumber   : '',
    documentNumber: '',  // auto-generated CH/YYYY-NNNNNN
    memo          : '',
    payeeId       : '',
    payeeName     : '',
    subsidiaryId  : '',
    departmentId  : '',
    locationId    : '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ── Line state ─────────────────────────────────────────────────────────────
  const [lineCounter,        setLineCounter]        = useState(1000);
  const [editingLineId,      setEditingLineId]      = useState<number | null>(null);
  const [editingItemLineId,  setEditingItemLineId]  = useState<number | null>(null);

  const blankExpense = (): ExpenseLine => ({ id: lineCounter, accountId: '', amount: 0, taxCode: '', taxRate: 0, taxAmt: 0, grossAmt: 0, memo: '', department: '', location: '' });
  const blankItem    = (): ItemLine    => ({ id: lineCounter, itemId: '', description: '', quantity: 1, unit: '', unitPrice: 0, amount: 0, taxCode: '', taxRate: 0, taxAmt: 0, grossAmt: 0, memo: '', department: '', location: '' });

  const [lines,     setLines]     = useState<ExpenseLine[]>([]);
  const [itemLines, setItemLines] = useState<ItemLine[]>([]);
  const [editLine,     setEditLine]     = useState<ExpenseLine>(blankExpense());
  const [editItemLine, setEditItemLine] = useState<ItemLine>(blankItem());

  // ── Auto-fill posting period from date ────────────────────────────────────
  useEffect(() => {
    if (!form.checkDate || periods.length === 0) return;
    const d = new Date(form.checkDate);
    const match = periods.find((p: any) => {
      const s = new Date(p.start_date), e = new Date(p.end_date);
      return d >= s && d <= e && p.status === 'open';
    });
    if (match) set('postingPeriodId', match.id);
  }, [form.checkDate, periods]);

  // ── Auto-fill subsidiary ───────────────────────────────────────────────────
  useEffect(() => {
    if (subsidiaries.length > 0 && !form.subsidiaryId)
      set('subsidiaryId', subsidiaries[0].id);
  }, [subsidiaries]);

  // ── Fetch balance when bank account changes ────────────────────────────────
  useEffect(() => {
    if (!form.bankAccountId) { set('balance', 0); return; }
    api.get(`/api/accounting/accounts/${form.bankAccountId}/balance`)
      .then(r => set('balance', r.data.data?.balance ?? 0))
      .catch(() => set('balance', 0));
  }, [form.bankAccountId]);

  // ── Populate form when editing ─────────────────────────────────────────────
  useEffect(() => {
    if (!existingCheck || initialized) return;
    if (vendors.length === 0 && customers.length === 0) return;
    setForm({
      bankAccountId : existingCheck.bank_account_id || '',
      balance       : 0,
      checkDate     : existingCheck.check_date ? new Date(existingCheck.check_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      postingPeriodId: existingCheck.posting_period_id || '',
      checkNumber   : existingCheck.check_number || '',
      documentNumber: existingCheck.document_number || existingCheck.check_number || '',
      memo          : existingCheck.memo || '',
      payeeId       : existingCheck.vendor_id || existingCheck.customer_id || '',
      payeeName     : existingCheck.vendor_name || existingCheck.pay_to || '',
      subsidiaryId  : existingCheck.subsidiary_id || '',
      departmentId  : existingCheck.department_id || '',
      locationId    : existingCheck.location_id || '',
    });
    if (existingCheck.lines?.length > 0) {
      setLines(existingCheck.lines.map((l: any, i: number) => ({
        id: 2000 + i, accountId: l.account_id || '', amount: parseFloat(l.amount) || 0,
        taxCode: l.tax_code || '', taxRate: parseFloat(l.tax_rate) || 0,
        taxAmt: parseFloat(l.tax_amt) || 0, grossAmt: parseFloat(l.gross_amt) || parseFloat(l.amount) || 0,
        memo: l.memo || '', department: l.department || '', location: l.location_id || '',
      })));
    }
    setInitialized(true);
  }, [existingCheck, initialized, vendors, customers]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalExpAmt  = lines.reduce((s, l) => s + l.amount, 0);
  const totalExpTax  = lines.reduce((s, l) => s + l.taxAmt, 0);
  const totalItemAmt = itemLines.reduce((s, l) => s + l.amount, 0);
  const totalItemTax = itemLines.reduce((s, l) => s + l.taxAmt, 0);
  const grandTotal   = totalExpAmt + totalItemAmt;
  const grandTax     = totalExpTax + totalItemTax;

  // ── Tax helper ─────────────────────────────────────────────────────────────
  const getTaxRate = (code: string): number => {
    const t = taxCodes.find((tc: any) => tc.code === code);
    return t ? parseFloat(t.rate) : 0;
  };

  // ── Expense line actions ───────────────────────────────────────────────────
  const startNewLine = () => { setLineCounter(c => c + 1); setEditLine({ ...blankExpense(), id: lineCounter + 1 }); setEditingLineId(-1); };
  const cancelLine   = () => setEditingLineId(null);
  const clearAll     = () => { setLines([]); setEditingLineId(null); };
  const addLine = () => {
    if (!editLine.accountId) { toast.error('Account is required'); return; }
    if (editingLineId === -1) {
      setLineCounter(c => c + 1);
      setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]);
    } else {
      setLines(prev => prev.map(l => l.id === editingLineId ? { ...editLine } : l));
    }
    setEditLine(blankExpense());
    setEditingLineId(null);
  };
  const removeLine = (lid: number) => { setLines(prev => prev.filter(l => l.id !== lid)); setEditingLineId(null); };
  const copyPrevious = () => {
    if (!lines.length) return;
    setLineCounter(c => c + 1);
    setEditLine({ ...lines[lines.length - 1], id: lineCounter + 1 });
  };

  // ── Item line actions ──────────────────────────────────────────────────────
  const startNewItemLine = () => { setLineCounter(c => c + 1); setEditItemLine({ ...blankItem(), id: lineCounter + 1 }); setEditingItemLineId(-1); };
  const cancelItemLine   = () => setEditingItemLineId(null);
  const clearItemAll     = () => { setItemLines([]); setEditingItemLineId(null); };
  const addItemLine = () => {
    if (!editItemLine.itemId) { toast.error('Item is required'); return; }
    if (editingItemLineId === -1) {
      setLineCounter(c => c + 1);
      setItemLines(prev => [...prev, { ...editItemLine, id: lineCounter + 1 }]);
    } else {
      setItemLines(prev => prev.map(l => l.id === editingItemLineId ? { ...editItemLine } : l));
    }
    setEditItemLine(blankItem());
    setEditingItemLineId(null);
  };
  const removeItemLine = (lid: number) => { setItemLines(prev => prev.filter(l => l.id !== lid)); setEditingItemLineId(null); };

  // ── Save ───────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      // The transaction/document number is assigned by the backend per the
      // Auto-Generated Number setup. Only pass a manual documentNumber when
      // override is enabled and the user entered one.
      if (!isEdit && !allowOverride) data.documentNumber = '';
      return isEdit ? api.put(`/api/bank/checks/${id}`, data) : api.post('/api/bank/write-checks', data);
    },
    onSuccess: async (res) => {
      const savedId = isEdit ? id : res.data?.data?.id;
      // Upload files if any
      const filesToUpload = fileRows.filter(r => r.file);
      if (filesToUpload.length > 0 && savedId) {
        try {
          const formData = new FormData();
          formData.append('sourceType', 'bank_check');
          formData.append('sourceId', savedId);
          filesToUpload.forEach((row, i) => {
            formData.append('files', row.file!);
            formData.append('titles', row.title || row.file!.name);
            formData.append('descriptions', row.description || '');
            formData.append('folder', row.folder || 'Attachments');
          });
          await api.post('/api/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (e: any) {
          toast.error('Check saved but file upload failed: ' + (e.response?.data?.error || e.message));
        }
      }
      toast.success(isEdit ? 'Check updated' : 'Check saved');
      if (savedId) navigate(`/bank/checks/${savedId}`, { state: { justSaved: true } });
      else navigate('/bank/checks-list');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save check'),
  });

  const handleSave = () => {
    if (!form.bankAccountId)             { toast.error('Account (bank) is required'); return; }
    if (!form.payeeId && !form.payeeName) { toast.error('Payee is required'); return; }
    if (grandTotal <= 0)                  { toast.error('At least one expense or item line required'); return; }
    mutation.mutate({
      bankAccountId   : form.bankAccountId,
      checkDate       : form.checkDate,
      checkNumber     : form.checkNumber || '',
      documentNumber  : form.documentNumber,
      payTo           : form.payeeName,
      vendorId        : payees.find(p => p.id === form.payeeId && p.type === 'vendor') ? form.payeeId : null,
      amount          : grandTotal,
      tax             : grandTax,
      memo            : form.memo,
      postingPeriodId : form.postingPeriodId || null,
      subsidiaryId    : form.subsidiaryId || null,
      departmentId    : form.departmentId  || null,
      locationId      : form.locationId    || null,
      lines: lines.map(l => ({
        accountId: l.accountId, amount: l.amount, taxCode: l.taxCode,
        taxRate: l.taxRate, taxAmt: l.taxAmt, grossAmt: l.grossAmt,
        memo: l.memo, department: l.department, location: l.location,
      })),
      itemLines: itemLines.map(l => ({
        itemId: l.itemId, description: l.description, quantity: l.quantity, unit: l.unit,
        unitPrice: l.unitPrice, amount: l.amount, taxCode: l.taxCode, taxRate: l.taxRate,
        taxAmt: l.taxAmt, grossAmt: l.grossAmt, memo: l.memo, department: l.department, location: l.location,
      })),
    });
  };

  // ── Tax select helper ──────────────────────────────────────────────────────
  const TaxSelect = ({ value, onChange }: { value: string; onChange: (code: string, rate: number) => void }) => (
    <select value={value}
      onChange={e => { const rate = getTaxRate(e.target.value); onChange(e.target.value, rate); }}
      className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
      <option value=""></option>
      {taxCodes.map((tc: any) => (
        <option key={tc.id} value={tc.code}>{tc.code} - {tc.name}</option>
      ))}
    </select>
  );

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Header bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white font-bold text-sm">✓</div>
              <h1 className="text-xl font-semibold text-slate-800">Check</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/checks-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_check')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/bank/checks-list')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

        {/* ── Primary Information ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                {/* Col 1 */}
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Transaction Number</div>
                    {isEdit ? (
                      <div className="text-sm font-medium text-slate-800">{form.checkNumber}</div>
                    ) : allowOverride ? (
                      <input
                        type="text"
                        value={form.documentNumber}
                        onChange={e => set('documentNumber', e.target.value)}
                        placeholder="Auto Generated Number"
                        className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    ) : (
                      <div className="text-sm font-medium text-slate-400 italic">Auto Generated Number</div>
                    )}
                    {!isEdit && allowOverride && (
                      <div className="text-2xs text-slate-400 mt-0.5">Leave blank to auto-generate</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Account</label>
                    <select value={form.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value="">Cheque Account</option>
                      {bankAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Balance</div>
                    <div className="text-sm font-medium text-slate-800">
                      {form.balance.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Payee <span className="text-red-500">*</span></label>
                    <select value={form.payeeId}
                      onChange={e => { const p = payees.find(x => x.id === e.target.value); set('payeeId', e.target.value); if (p) set('payeeName', p.name); }}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      <optgroup label="Vendors">
                        {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </optgroup>
                      <optgroup label="Customers">
                        {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                </div>
                {/* Col 2 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Amount</label>
                    <input readOnly value={grandTotal > 0 ? grandTotal.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : ''} placeholder="0.00"
                      className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-600 cursor-not-allowed"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tax</label>
                    <input readOnly value={grandTax > 0 ? grandTax.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : ''} placeholder="0.00"
                      className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-600 cursor-not-allowed"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.checkDate} onChange={e => set('checkDate', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Posting Period <span className="text-red-500">*</span></label>
                    <select value={form.postingPeriodId} onChange={e => set('postingPeriodId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      {periods.filter((p: any) => p.status === 'open').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* Col 3 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Check #</label>
                    <input type="text" value={form.checkNumber} onChange={e => set('checkNumber', e.target.value)} placeholder="0"
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Memo</label>
                    <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
                  <ApprovalFields showAlways={true}
                    approvalStatus={existingCheck?.approval_status}
                    configuredApproverName={existingCheck?.configured_approver_name}
                    approvedByName={existingCheck?.approved_by_name}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Classification ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
            {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Subsidiary <span className="text-red-500">*</span></label>
                  <select value={form.subsidiaryId} onChange={e => set('subsidiaryId', e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                    <option value=""></option>
                    {subsidiaries.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Department</label>
                  <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                    <option value=""></option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Location</label>
                  <select value={form.locationId} onChange={e => set('locationId', e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                    <option value=""></option>
                    {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Expenses & Items + Files ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          {/* Main tab header */}
          <div className="border-b border-slate-200 px-4 flex items-center gap-0">
            <button onClick={() => setLineTab(lineTab==='files' ? 'expenses' : lineTab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab!=='files'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Expenses &amp; Items
            </button>
            <button onClick={() => setLineTab('files')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab==='files'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Files {fileRows.filter(r=>r.file).length > 0 ? `(${fileRows.filter(r=>r.file).length})` : ''}
            </button>
          </div>
          {/* Sub-tabs + content wrapper */}
          {lineTab !== 'files' ? (
          <>
          <div className="px-4 pt-2 pb-0 border-b border-slate-100 flex gap-6">
            <button onClick={() => { setLineTab('expenses'); setEditingLineId(null); setEditingItemLineId(null); }}
              className={`text-sm pb-1.5 border-b-2 font-medium transition-colors ${lineTab==='expenses'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Expenses {totalExpAmt > 0 ? totalExpAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '0.00'}
            </button>
            <button onClick={() => { setLineTab('items'); setEditingLineId(null); setEditingItemLineId(null); }}
              className={`text-sm pb-1.5 border-b-2 font-medium transition-colors ${lineTab==='items'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Items {totalItemAmt > 0 ? totalItemAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '0.00'}
            </button>
          </div>

          <div className="p-3">
            <div className="mb-2">
              <button onClick={() => lineTab==='expenses' ? clearAll() : clearItemAll()}
                className="px-3 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                Clear All Lines
              </button>
            </div>

            {/* ════ EXPENSES TABLE ════ */}
            {lineTab === 'expenses' && (
            <div className="border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-xs min-w-max">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Account <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Tax Code</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Tax Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax Amt</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Gross Amt</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Memo</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.id} onClick={() => { setEditLine({...line}); setEditingLineId(line.id); }}
                      className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                      <td className="px-3 py-1.5 text-slate-700">{expenseAccounts.find((a: any) => a.id === line.accountId)?.name || '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-800 font-medium">{line.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.taxCode || '-'}</td>
                      <td className="px-3 py-1.5 text-center text-slate-500">{line.taxRate > 0 ? `${line.taxRate}%` : '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{line.taxAmt > 0 ? line.taxAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{(line.grossAmt || line.amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.memo || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.department)?.name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.location)?.name || '-'}</td>
                    </tr>
                  ))}
                  {editingLineId !== null && (
                    <tr className="border-t border-blue-300 bg-blue-50/40">
                      <td className="px-1.5 py-1">
                        <select value={editLine.accountId} onChange={e => setEditLine(l => ({ ...l, accountId: e.target.value }))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" autoFocus>
                          <option value=""></option>
                          {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1">
                        <input type="number" step="0.01" value={editLine.amount || ''}
                          onChange={e => { const amt = Number(e.target.value); const tAmt = Math.round(amt*(editLine.taxRate/100)*100)/100; setEditLine(l => ({...l, amount: amt, taxAmt: tAmt, grossAmt: amt+tAmt})); }}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1">
                        <TaxSelect value={editLine.taxCode} onChange={(code, rate) => {
                          const tAmt = Math.round(editLine.amount*(rate/100)*100)/100;
                          setEditLine(l => ({...l, taxCode: code, taxRate: rate, taxAmt: tAmt, grossAmt: l.amount+tAmt}));
                        }}/>
                      </td>
                      <td className="px-1.5 py-1"><input readOnly value={editLine.taxRate > 0 ? `${editLine.taxRate}%` : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-center"/></td>
                      <td className="px-1.5 py-1"><input readOnly value={editLine.taxAmt > 0 ? editLine.taxAmt.toLocaleString('id-ID',{minimumFractionDigits:2}) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/></td>
                      <td className="px-1.5 py-1"><input readOnly value={(editLine.grossAmt||editLine.amount) > 0 ? (editLine.grossAmt||editLine.amount).toLocaleString('id-ID',{minimumFractionDigits:2}) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/></td>
                      <td className="px-1.5 py-1"><input type="text" value={editLine.memo} onChange={e => setEditLine(l => ({...l, memo: e.target.value}))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/></td>
                      <td className="px-1.5 py-1">
                        <select value={editLine.department} onChange={e => setEditLine(l => ({...l, department: e.target.value}))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                          <option value=""></option>
                          {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1">
                        <select value={editLine.location} onChange={e => setEditLine(l => ({...l, location: e.target.value}))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                          <option value=""></option>
                          {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  )}
                  {editingLineId === null && (
                    <tr onClick={startNewLine} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <td colSpan={9} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {editingLineId !== null && (
                <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2 flex-wrap">
                  <button onClick={addLine} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                  <button onClick={cancelLine} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                  <button onClick={copyPrevious} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-600 rounded hover:bg-slate-50"><Copy size={11}/> Copy Previous</button>
                  <button onClick={startNewLine} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-600 rounded hover:bg-slate-50"><ArrowDownToLine size={11}/> Insert</button>
                  <button onClick={() => editingLineId !== -1 && removeLine(editingLineId)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                </div>
              )}
            </div>
            )}

            {/* ════ ITEMS TABLE ════ */}
            {lineTab === 'items' && (
            <div className="border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-xs min-w-max">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Description</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Tax Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Gross Amt</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Memo</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Department</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {itemLines.map(line => (
                    <tr key={line.id} onClick={() => { setEditItemLine({...line}); setEditingItemLineId(line.id); }}
                      className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                      <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800">{line.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.taxCode || '-'}</td>
                      <td className="px-3 py-1.5 text-center text-slate-500">{line.taxRate > 0 ? `${line.taxRate}%` : '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{line.taxAmt > 0 ? line.taxAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{(line.grossAmt || line.amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.memo || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.department)?.name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.location)?.name || '-'}</td>
                    </tr>
                  ))}
                  {editingItemLineId !== null && (
                    <tr className="border-t border-blue-300 bg-blue-50/40">
                      <td className="px-1.5 py-1">
                        <select value={editItemLine.itemId}
                          onChange={e => {
                            const item = items.find((i: any) => i.id === e.target.value);
                            const unitPrice = item ? parseFloat(item.standard_cost || item.sale_price || 0) : 0;
                            const unit = item?.uom || item?.uom_name || '';
                            const amt = Number(editItemLine.quantity) * unitPrice;
                            const tAmt = Math.round(amt*(editItemLine.taxRate/100)*100)/100;
                            setEditItemLine(l => ({...l, itemId: e.target.value, description: item?.name||'', unit, unitPrice, amount: amt, taxAmt: tAmt, grossAmt: amt+tAmt}));
                          }}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" autoFocus>
                          <option value=""></option>
                          {items.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1"><input type="text" value={editItemLine.description} onChange={e => setEditItemLine(l => ({...l, description: e.target.value}))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/></td>
                      <td className="px-1.5 py-1">
                        <input type="number" step="0.001" value={editItemLine.quantity || ''}
                          onChange={e => { const qty=Number(e.target.value); const amt=qty*editItemLine.unitPrice; const tAmt=Math.round(amt*(editItemLine.taxRate/100)*100)/100; setEditItemLine(l => ({...l, quantity: qty, amount: amt, taxAmt: tAmt, grossAmt: amt+tAmt})); }}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1"><input type="text" value={editItemLine.unit} onChange={e => setEditItemLine(l => ({...l, unit: e.target.value}))} placeholder="pcs" className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/></td>
                      <td className="px-1.5 py-1">
                        <input type="number" step="0.01" value={editItemLine.unitPrice || ''}
                          onChange={e => { const price=Number(e.target.value); const amt=editItemLine.quantity*price; const tAmt=Math.round(amt*(editItemLine.taxRate/100)*100)/100; setEditItemLine(l => ({...l, unitPrice: price, amount: amt, taxAmt: tAmt, grossAmt: amt+tAmt})); }}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1"><input readOnly value={editItemLine.amount > 0 ? editItemLine.amount.toLocaleString('id-ID',{minimumFractionDigits:2}) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-600 text-right"/></td>
                      <td className="px-1.5 py-1">
                        <TaxSelect value={editItemLine.taxCode} onChange={(code, rate) => {
                          const tAmt = Math.round(editItemLine.amount*(rate/100)*100)/100;
                          setEditItemLine(l => ({...l, taxCode: code, taxRate: rate, taxAmt: tAmt, grossAmt: l.amount+tAmt}));
                        }}/>
                      </td>
                      <td className="px-1.5 py-1"><input readOnly value={editItemLine.taxRate > 0 ? `${editItemLine.taxRate}%` : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-center"/></td>
                      <td className="px-1.5 py-1"><input readOnly value={editItemLine.taxAmt > 0 ? editItemLine.taxAmt.toLocaleString('id-ID',{minimumFractionDigits:2}) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/></td>
                      <td className="px-1.5 py-1"><input readOnly value={(editItemLine.grossAmt||editItemLine.amount) > 0 ? (editItemLine.grossAmt||editItemLine.amount).toLocaleString('id-ID',{minimumFractionDigits:2}) : '-'} className="w-full border border-slate-100 rounded text-xs px-1.5 py-1 bg-slate-50 text-slate-500 text-right"/></td>
                      <td className="px-1.5 py-1"><input type="text" value={editItemLine.memo} onChange={e => setEditItemLine(l => ({...l, memo: e.target.value}))} className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/></td>
                      <td className="px-1.5 py-1">
                        <select value={editItemLine.department} onChange={e => setEditItemLine(l => ({...l, department: e.target.value}))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                          <option value=""></option>
                          {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1">
                        <select value={editItemLine.location} onChange={e => setEditItemLine(l => ({...l, location: e.target.value}))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                          <option value=""></option>
                          {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  )}
                  {editingItemLineId === null && (
                    <tr onClick={startNewItemLine} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <td colSpan={13} className="px-3 py-2 text-slate-400 text-xs italic">Click to add an item...</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {editingItemLineId !== null && (
                <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2 flex-wrap">
                  <button onClick={addItemLine} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                  <button onClick={cancelItemLine} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                  <button onClick={startNewItemLine} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-600 rounded hover:bg-slate-50"><ArrowDownToLine size={11}/> Insert</button>
                  <button onClick={() => editingItemLineId !== -1 && removeItemLine(editingItemLineId)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                </div>
              )}
            </div>
            )}
          </div>
          </>
          ) : (
          <div className="p-3">
            {/* Upload new file button */}
            <div className="mb-3 flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 border border-blue-300 text-blue-700 text-xs font-medium rounded hover:bg-blue-50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Attach File
                <input type="file" multiple className="hidden" onChange={e => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(f => {
                    setFileRows(rows => [...rows, { id: `f_${Date.now()}_${Math.random()}`, file: f, title: f.name, description: '', folder: 'Attachments' }]);
                  });
                }}/>
              </label>
              <span className="text-xs text-slate-400">Max 50MB per file. PDF, Word, Excel, Image, ZIP supported.</span>
            </div>

            {/* Files table */}
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">File</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Description</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Folder</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Size</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-600 w-16">Del</th>
                  </tr>
                </thead>
                <tbody>
                  {fileRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">No files attached yet.</td></tr>
                  ) : fileRows.map((row, idx) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-1.5">
                        {row.file ? (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold flex-shrink-0 ${
                              /pdf/.test(row.file.type) ? 'bg-red-500' :
                              /image/.test(row.file.type) ? 'bg-green-500' :
                              /word|doc/.test(row.file.type) ? 'bg-blue-500' :
                              /excel|sheet|xls/.test(row.file.type) ? 'bg-emerald-500' : 'bg-slate-500'
                            }`}>{row.file.name.split('.').pop()?.toUpperCase().slice(0,3)||'?'}</span>
                            <span className="text-slate-700 truncate max-w-[200px]">{row.file.name}</span>
                          </div>
                        ) : (
                          <label className="flex items-center gap-1 cursor-pointer text-blue-600 hover:text-blue-800 text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Choose file...
                            <input type="file" className="hidden" onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setFileRows(rows => rows.map(r => r.id===row.id ? {...r, file:f, title:r.title||f.name} : r));
                            }}/>
                          </label>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={row.title} onChange={e => setFileRows(rows => rows.map(r => r.id===row.id?{...r,title:e.target.value}:r))}
                          className="w-full border border-slate-200 rounded px-2 py-0.5 text-xs" placeholder="Title..."/>
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={row.description} onChange={e => setFileRows(rows => rows.map(r => r.id===row.id?{...r,description:e.target.value}:r))}
                          className="w-full border border-slate-200 rounded px-2 py-0.5 text-xs" placeholder="Description..."/>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={row.folder} onChange={e => setFileRows(rows => rows.map(r => r.id===row.id?{...r,folder:e.target.value}:r))}
                          className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs bg-white">
                          <option>Attachments</option><option>Invoices</option><option>Receipts</option><option>Contracts</option><option>Other</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500">
                        {row.file ? (row.file.size>1024*1024?`${(row.file.size/1024/1024).toFixed(1)} MB`:`${Math.round(row.file.size/1024)||1} KB`) : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => setFileRows(rows => rows.filter(r => r.id!==row.id))} className="text-red-400 hover:text-red-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setFileRows(rows => [...rows, {id:`f_${Date.now()}`,file:null,title:'',description:'',folder:'Attachments'}])}
              className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Row
            </button>
          </div>
          )} {/* end ternary */}
        </div>

        {/* ── Bottom Save/Cancel ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/bank/checks-list')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
