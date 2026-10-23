import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

type EntityType = '' | 'customer' | 'vendor' | 'employee';

interface DepositLine {
  id: number;
  accountId: string;
  memo: string;
  amount: number;
  department: string;
  location: string;
  entityType: EntityType;   // combined Entity: which kind
  entityId: string;         // combined Entity: the id
}

export default function MakeDepositForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { accounts, locations, departments, customers, vendors, employees } = useFormOptions();

  const bankAccounts    = accounts.filter((a: any) => a.is_bank || a.subtype === 'bank' || ['1010','1020','1025','1030'].includes(a.code));
  const creditAccounts  = accounts.filter((a: any) => a.type !== 'bank');

  const empName = (e: any) => e.name || e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || '-';

  // Combined Entity dropdown: value is encoded "type:id"; label resolves across all 3 sources.
  const entityValue = (l: { entityType: EntityType; entityId: string }) => l.entityType && l.entityId ? `${l.entityType}:${l.entityId}` : '';
  const entityLabel = (type: EntityType, entId: string): string => {
    if (!type || !entId) return '';
    if (type === 'customer') return customers.find((c: any) => c.id === entId)?.name || '';
    if (type === 'vendor')   return vendors.find((v: any) => v.id === entId)?.name || '';
    if (type === 'employee') { const e = employees.find((x: any) => x.id === entId); return e ? empName(e) : ''; }
    return '';
  };

  const { data: subsidiariesData } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });
  const subsidiaries: any[] = subsidiariesData || [];

  // ── UI state ──────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen,   setClassOpen]   = useState(true);
  const [activeTab,   setActiveTab]   = useState<'lines' | 'files'>('lines');

  // ── File state ──────────────────────────────────────────────────────────────
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    bankAccountId: '',
    depositDate:   new Date().toISOString().split('T')[0],
    reference:     '',
    memo:          '',
    subsidiaryId:  '',
    departmentId:  '',
    locationId:    '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isEdit && subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id);
  }, [subsidiaries]);

  // ── Selected bank balance ───────────────────────────────────────────────────
  // Prefer the live /balance endpoint; fall back to net_balance from the options.
  const selectedBank = accounts.find((a: any) => a.id === form.bankAccountId);
  const { data: bankBalance } = useQuery({
    queryKey: ['account-balance', form.bankAccountId],
    queryFn: () => api.get(`/api/accounting/accounts/${form.bankAccountId}/balance`).then(r => r.data.data?.balance ?? 0),
    enabled: !!form.bankAccountId,
    staleTime: 10000,
  });
  const effectiveBalance = (form.bankAccountId)
    ? (bankBalance != null ? Number(bankBalance) : Number(selectedBank?.net_balance ?? 0))
    : null;

  // ── Line state ────────────────────────────────────────────────────────────
  const [counter, setCounter] = useState(1000);
  const [lines,   setLines]   = useState<DepositLine[]>([]);
  const [editId,  setEditId]  = useState<number | null>(null);
  const blank = (): DepositLine => ({ id: counter, accountId: '', memo: '', amount: 0, department: '', location: '', entityType: '', entityId: '' });
  const [editLine, setEditLine] = useState<DepositLine>(blank());

  // ── Edit mode: load existing deposit ────────────────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['deposit-edit', id],
    queryFn: () => api.get(`/api/bank/deposits/${id}`).then(r => r.data.data),
    enabled: isEdit, staleTime: 0,
  });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    if (!existing || loadedId === existing.id) return;
    setForm({
      bankAccountId: existing.bank_account_id || '',
      depositDate: existing.deposit_date ? new Date(existing.deposit_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      reference: existing.reference || '',
      memo: existing.memo || '',
      subsidiaryId: existing.subsidiary_id || '',
      departmentId: existing.department_id || '',
      locationId: existing.location_id || '',
    });
    let c = counter;
    const mapped: DepositLine[] = (existing.lines || []).map((l: any) => {
      c += 1;
      const entityType: EntityType = l.entity_customer_id ? 'customer' : l.entity_vendor_id ? 'vendor' : l.entity_employee_id ? 'employee' : '';
      const entityId = l.entity_customer_id || l.entity_vendor_id || l.entity_employee_id || '';
      return { id: c, accountId: l.account_id || '', memo: l.memo || '', amount: Number(l.amount || 0), department: l.department_id || '', location: l.location_id || '', entityType, entityId };
    });
    setCounter(c + 1);
    setLines(mapped);
    setLoadedId(existing.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

  const startNew = () => { setCounter(c => c + 1); setEditLine({ ...blank(), id: counter + 1 }); setEditId(-1); };
  const cancelLine = () => setEditId(null);
  const addLine = () => {
    if (!editLine.accountId) { toast.error('Account is required'); return; }
    if (editId === -1) {
      setCounter(c => c + 1);
      setLines(p => [...p, { ...editLine, id: counter + 1 }]);
    } else {
      setLines(p => p.map(l => l.id === editId ? { ...editLine } : l));
    }
    setEditLine(blank());
    setEditId(null);
  };
  const removeLine = (lid: number) => { setLines(p => p.filter(l => l.id !== lid)); setEditId(null); };

  // ── Save ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) return api.put(`/api/bank/deposits/${id}`, data);
      const numRes = await api.get('/api/settings/next-number/DEP');
      data.documentNumber = numRes.data.data.formatted;
      return api.post('/api/bank/deposits', data);
    },
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id || id;
      if (fileRows.filter(r => r.file).length > 0 && savedId) {
        try { await uploadFileRows(fileRows, 'bank_deposit', savedId, api.post.bind(api)); }
        catch (e: any) { toast.error('Deposit saved but file upload failed: ' + (e.response?.data?.error || e.message)); }
      }
      toast.success(isEdit ? 'Deposit updated' : 'Deposit recorded');
      if (savedId) navigate(`/bank/deposits/${savedId}`, { state: { justSaved: true } });
      else navigate('/bank/deposits-list');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save deposit'),
  });

  const handleSave = () => {
    if (!form.bankAccountId) { toast.error('Bank Account is required'); return; }
    if (!form.depositDate)   { toast.error('Deposit Date is required'); return; }
    if (lines.length === 0)  { toast.error('At least one deposit line is required'); return; }
    mutation.mutate({
      bankAccountId: form.bankAccountId,
      depositDate:   form.depositDate,
      reference:     form.reference,
      memo:          form.memo,
      totalAmount,
      subsidiaryId:  form.subsidiaryId || null,
      departmentId:  form.departmentId || null,
      locationId:    form.locationId   || null,
      lines: lines.map(l => ({
        accountId: l.accountId, memo: l.memo, amount: l.amount,
        department: l.department, location: l.location,
        entityCustomerId: l.entityType === 'customer' ? l.entityId : null,
        entityVendorId:   l.entityType === 'vendor'   ? l.entityId : null,
        entityEmployeeId: l.entityType === 'employee' ? l.entityId : null,
      })),
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-sm">↓</div>
              <h1 className="text-xl font-semibold text-slate-800">{isEdit ? 'Edit Deposit' : 'Make Deposit'}</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/deposits-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_deposit')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/bank/deposits-list')}
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
                    <div className="text-sm font-medium text-slate-800">{isEdit ? (existing?.deposit_number || '—') : 'To Be Generated'}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Bank Account <span className="text-red-500">*</span></label>
                    <select value={form.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      {bankAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                    {form.bankAccountId && (
                      <div className="mt-1.5 text-xs flex items-center gap-1.5">
                        <span className="text-slate-500">Current Balance:</span>
                        <span className={`font-semibold ${(effectiveBalance ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {effectiveBalance == null ? '…' : formatCurrency(effectiveBalance)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Deposit Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.depositDate} onChange={e => set('depositDate', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
                </div>
                {/* Col 2 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Total Amount</label>
                    <input readOnly value={totalAmount > 0 ? totalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : ''} placeholder="0.00"
                      className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-600 cursor-not-allowed"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Reference</label>
                    <input type="text" value={form.reference} onChange={e => set('reference', e.target.value)}
                      placeholder="Bank slip / reference"
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
                </div>
                {/* Col 3 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Memo</label>
                    <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"/>
                  </div>
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
                  <label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
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

        {/* ── Lines + Files ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['lines', 'files'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'lines' ? `Deposit Lines${lines.length > 0 ? ` (${lines.length})` : ''}` : `Files${fileRows.filter(r => r.file).length > 0 ? ` (${fileRows.filter(r => r.file).length})` : ''}`}
              </button>
            ))}
          </div>

          <div className="p-3">
            {activeTab === 'lines' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Account <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Entity</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Memo</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(line => (
                      <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditId(line.id); }}
                        className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                        <td className="px-3 py-1.5 text-slate-700">{creditAccounts.find((a: any) => a.id === line.accountId)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {line.entityType && line.entityId
                            ? <>{entityLabel(line.entityType, line.entityId) || '-'}<span className="ml-1 text-2xs text-slate-400">({line.entityType})</span></>
                            : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">{line.memo || '-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{line.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.department)?.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.location)?.name || '-'}</td>
                      </tr>
                    ))}
                    {editId !== null && (
                      <tr className="border-t border-blue-300 bg-blue-50/40">
                        <td className="px-1.5 py-1">
                          <select value={editLine.accountId} onChange={e => setEditLine(l => ({ ...l, accountId: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" autoFocus>
                            <option value=""></option>
                            {creditAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={entityValue(editLine)}
                            onChange={e => { const [t, eid] = e.target.value.split(':'); setEditLine(l => ({ ...l, entityType: (t as EntityType) || '', entityId: eid || '' })); }}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value="">-- None --</option>
                            <optgroup label="Customers">
                              {customers.map((c: any) => <option key={`c-${c.id}`} value={`customer:${c.id}`}>{c.name}</option>)}
                            </optgroup>
                            <optgroup label="Vendors">
                              {vendors.map((v: any) => <option key={`v-${v.id}`} value={`vendor:${v.id}`}>{v.name}</option>)}
                            </optgroup>
                            <optgroup label="Employees">
                              {employees.map((emp: any) => <option key={`e-${emp.id}`} value={`employee:${emp.id}`}>{empName(emp)}</option>)}
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="text" value={editLine.memo} onChange={e => setEditLine(l => ({ ...l, memo: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <NumberInput value={editLine.amount} onChange={v => setEditLine(l => ({ ...l, amount: v }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.department} onChange={e => setEditLine(l => ({ ...l, department: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value=""></option>
                            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <select value={editLine.location} onChange={e => setEditLine(l => ({ ...l, location: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white">
                            <option value=""></option>
                            {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )}
                    {editId === null && (
                      <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td colSpan={6} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                      </tr>
                    )}
                  </tbody>
                  {lines.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={3} className="px-3 py-2 text-right text-slate-600 text-xs">TOTAL</td>
                        <td className="px-3 py-2 text-right text-slate-800">{totalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {editId !== null && (
                  <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                    <button onClick={addLine} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                    <button onClick={cancelLine} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                    <button onClick={() => editId !== -1 && removeLine(editId)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/bank/deposits-list')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
