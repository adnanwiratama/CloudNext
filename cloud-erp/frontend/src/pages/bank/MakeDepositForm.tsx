import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface DepositLine {
  id: number;
  accountId: string;
  memo: string;
  amount: number;
  department: string;
  location: string;
}

export default function MakeDepositForm() {
  const navigate = useNavigate();
  const { accounts, locations, departments } = useFormOptions();

  const bankAccounts    = accounts.filter((a: any) => a.is_bank || a.subtype === 'bank' || ['1010','1020','1025','1030'].includes(a.code));
  const creditAccounts  = accounts.filter((a: any) => a.type !== 'bank');

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
    if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id);
  }, [subsidiaries]);

  // ── Line state ────────────────────────────────────────────────────────────
  const [counter, setCounter] = useState(1000);
  const [lines,   setLines]   = useState<DepositLine[]>([]);
  const [editId,  setEditId]  = useState<number | null>(null);
  const blank = (): DepositLine => ({ id: counter, accountId: '', memo: '', amount: 0, department: '', location: '' });
  const [editLine, setEditLine] = useState<DepositLine>(blank());

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
      const numRes = await api.get('/api/settings/next-number/DEP');
      data.documentNumber = numRes.data.data.formatted;
      return api.post('/api/bank/deposits', data);
    },
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id;
      if (fileRows.filter(r => r.file).length > 0 && savedId) {
        try { await uploadFileRows(fileRows, 'bank_deposit', savedId, api.post.bind(api)); }
        catch (e: any) { toast.error('Deposit saved but file upload failed: ' + (e.response?.data?.error || e.message)); }
      }
      toast.success('Deposit recorded');
      if (savedId) navigate(`/bank/deposits/${savedId}`, { state: { justSaved: true } });
      else navigate('/bank/deposits-list');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record deposit'),
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
      lines: lines.map(l => ({ accountId: l.accountId, memo: l.memo, amount: l.amount, department: l.department, location: l.location })),
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
              <h1 className="text-xl font-semibold text-slate-800">Make Deposit</h1>
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
                    <div className="text-sm font-medium text-slate-800">To Be Generated</div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Bank Account <span className="text-red-500">*</span></label>
                    <select value={form.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      {bankAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
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
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* Col 3 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e => set('locationId', e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      <option value=""></option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
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
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Memo</th>
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
                          <input type="text" value={editLine.memo} onChange={e => setEditLine(l => ({ ...l, memo: e.target.value }))}
                            className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400"/>
                        </td>
                        <td className="px-1.5 py-1">
                          <input type="number" step="0.01" value={editLine.amount || ''}
                            onChange={e => setEditLine(l => ({ ...l, amount: Number(e.target.value) }))}
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
                        <td colSpan={5} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
                      </tr>
                    )}
                  </tbody>
                  {lines.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={2} className="px-3 py-2 text-right text-slate-600 text-xs">TOTAL</td>
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
