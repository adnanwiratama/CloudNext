import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, ClipboardList } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export const PR_PRIORITIES: { value: string; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

interface ReqLine {
  id: number; dbId?: string; itemId: string; description: string;
  quantity: number; unit: string; uomId: string; unitPrice: number; amount: number;
  departmentId: string; locationId: string;
}

const blankLine = (counter: number): ReqLine => ({
  id: counter, itemId: '', description: '', quantity: 1, unit: '', uomId: '', unitPrice: 0, amount: 0,
  departmentId: '', locationId: '',
});

export default function PurchaseRequisitionForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';

  const { items, locations, departments, currencies, uomUnits } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const unitsForItem = (itemId: string): any[] => { const it = items.find((i: any) => i.id === itemId); if (!it?.uom_type_id) return []; return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id); };
  const rateOf = (uomId?: string): number => { const u = (uomUnits || []).find((x: any) => x.id === uomId); const r = Number(u?.conversion_rate_to_base || 1); return r > 0 ? r : 1; };

  // ── Edit: load existing requisition ────────────────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['requisition-edit', id],
    queryFn: () => api.get(`/api/purchasing/requisitions/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'items' | 'files'>('items');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    requestDate: new Date().toISOString().split('T')[0], requiredDate: '',
    requestedBy: '', priority: 'normal', currency: 'IDR',
    locationId: '', departmentId: '', subsidiaryId: '', memo: '', shippingAmount: 0,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [lines, setLines] = useState<ReqLine[]>([]);

  useEffect(() => { if (subsidiaries.length > 0 && !form.subsidiaryId && !isEdit) set('subsidiaryId', subsidiaries[0].id); }, [subsidiaries]);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!existing || initialized) return;
    setForm({
      requestDate: existing.request_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      requiredDate: existing.required_date?.split('T')[0] || '',
      requestedBy: existing.requested_by_name || '',
      priority: existing.priority || 'normal', currency: existing.currency || 'IDR',
      locationId: existing.location_id || '', departmentId: existing.department_id || '',
      subsidiaryId: existing.subsidiary_id || '', memo: existing.memo || '',
      shippingAmount: parseFloat(existing.shipping_amount) || 0,
    });
    if (existing.lines?.length) {
      setLines(existing.lines.map((l: any, i: number) => ({
        id: 1000 + i, dbId: l.id, itemId: l.item_id || '', description: l.description || '',
        quantity: parseFloat(l.quantity) || 1, unit: l.uom_code || l.uom_name || l.unit || '', uomId: l.uom_id || '',
        unitPrice: parseFloat(l.unit_price) || 0, amount: parseFloat(l.amount) || 0,
        departmentId: l.department_id || '', locationId: l.location_id || '',
      })));
    }
    setInitialized(true);
  }, [existing, initialized]);

  // ── Line editing (PO-style Add / Cancel / Remove) ──────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<ReqLine>(blankLine(0));

  const recompute = (l: ReqLine): ReqLine => ({ ...l, amount: Number(l.quantity) * Number(l.unitPrice) });

  const startNew = () => { setLineCounter(c => c + 1); setEditLine({ ...blankLine(lineCounter + 1) }); setEditingId(-1); };
  const editExisting = (line: ReqLine) => { setEditLine({ ...line }); setEditingId(line.id); };
  const cancelEdit = () => { setEditLine(blankLine(0)); setEditingId(null); };
  const commitEdit = () => {
    if (!editLine.itemId) { toast.error('Item is required'); return; }
    if (editingId === -1) { setLineCounter(c => c + 1); setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]); }
    else setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    setEditLine(blankLine(0)); setEditingId(null);
  };
  const removeEditing = () => { if (editingId !== null && editingId !== -1) setLines(prev => prev.filter(l => l.id !== editingId)); setEditLine(blankLine(0)); setEditingId(null); };

  const setEdit = (key: string, value: any) => {
    setEditLine(l => {
      const u: any = { ...l, [key]: value };
      if (key === 'itemId') {
        const item = items.find((i: any) => i.id === value);
        if (item) {
          u.description = item.name || '';
          u.unitPrice = parseFloat(item.last_purchase_price || item.standard_cost || item.average_cost || 0);
          const opts = (uomUnits || []).filter((x: any) => x.uom_type_id === item.uom_type_id);
          const purchaseUnit = opts.find((x: any) => x.id === item.purchase_uom_id) || opts.find((x: any) => x.is_base_unit) || opts[0];
          u.unit = purchaseUnit?.name || item.uom_code || '';
          u.uomId = purchaseUnit?.id || '';
        }
      }
      return recompute(u);
    });
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const total = subtotal + Number(form.shippingAmount);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/purchasing/requisitions/${id}`, data) : api.post('/api/purchasing/requisitions', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'purchase_requisition', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(isEdit ? 'Purchase Requisition updated' : 'Purchase Requisition saved');
      navigate(`/purchasing/requisitions/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save requisition'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requestDate) { toast.error('Request Date is required'); return; }
    const validLines = lines.filter(l => l.itemId);
    if (!validLines.length) { toast.error('At least one item line is required'); return; }
    mutation.mutate({
      ...form,
      requiredDate: form.requiredDate || null,
      locationId: form.locationId || null, departmentId: form.departmentId || null, subsidiaryId: form.subsidiaryId || null,
      shippingAmount: Number(form.shippingAmount) || 0,
      lines: validLines.map(l => ({
        itemId: l.itemId, lineId: l.dbId || null, description: l.description, quantity: Number(l.quantity),
        unit: l.unit, uomId: l.uomId || null, unitPrice: Number(l.unitPrice), estimatedPrice: Number(l.unitPrice),
        amount: Number(l.amount), departmentId: l.departmentId || null, locationId: l.locationId || null,
      })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center text-white"><ClipboardList size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Purchase Requisition</span>
              {isEdit && existing?.requisition_number && <span className="text-xl font-semibold text-slate-500">{existing.requisition_number}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button type="button" onClick={() => navigate('/purchasing/requisitions')} className="hover:underline">List</button>
              <button type="button" onClick={() => navigate('/customization/forms?module=purchase_requisition')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button type="submit" form="pr-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null}{isEdit ? 'Save Changes' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="pr-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

          {/* Primary Information */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  {/* Column 1 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Request Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.requestDate} onChange={e => set('requestDate', e.target.value)} className={dis} required/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Required Date</label>
                      <input type="date" value={form.requiredDate} onChange={e => set('requiredDate', e.target.value)} className={dis}/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Requested By</label>
                      <input type="text" value={form.requestedBy} onChange={e => set('requestedBy', e.target.value)} className={dis} placeholder="Employee name"/>
                    </div>
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Priority</label>
                      <select value={form.priority} onChange={e => set('priority', e.target.value)} className={dis}>
                        {PR_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e => set('currency', e.target.value)} className={dis}>
                        {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Memo / Justification</label>
                      <input type="text" value={form.memo} onChange={e => set('memo', e.target.value)} className={dis} placeholder="Reason for purchase request"/>
                    </div>
                  </div>
                  {/* Column 3 — Summary */}
                  <div className="space-y-3">
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                      <div className="text-sm">
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{subtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between px-3 py-1.5 border-b border-slate-100 items-center">
                          <span className="text-slate-600">Shipping</span>
                          <NumberInput value={form.shippingAmount} min={0} onChange={v => set('shippingAmount', v)} className="w-28 border border-slate-200 rounded px-1.5 py-0.5 text-right text-xs"/>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Estimated</span><span>{total.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setClassOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
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
                    <label className="block text-xs text-slate-500 mb-1">Deliver To Location</label>
                    <select value={form.locationId} onChange={e => set('locationId', e.target.value)} className={dis}>
                      <option value="">-- Select Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lines + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['items', 'files'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'items' ? 'Items' : 'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab === 'items' && (
                <div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item <span className="text-red-500">*</span></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Est. Price</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Est. Total</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map(line => (
                          <tr key={line.id} onClick={() => editExisting(line)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                            <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                            <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{line.unitPrice.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-slate-800">{Number(line.amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-slate-500">{departments.find((d: any) => d.id === line.departmentId)?.name || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{locations.find((l: any) => l.id === line.locationId)?.name || '-'}</td>
                          </tr>
                        ))}
                        {editingId !== null && (
                          <tr className="border-t border-blue-300 bg-blue-50/40">
                            <td className="px-1.5 py-1">
                              <select value={editLine.itemId} onChange={e => setEdit('itemId', e.target.value)} autoFocus className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1"><input value={editLine.description} onChange={e => setEdit('description', e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"/></td>
                            <td className="px-1.5 py-1"><input type="number" min="0.001" step="0.001" value={editLine.quantity || ''} onChange={e => setEdit('quantity', Number(e.target.value))} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                            <td className="px-1.5 py-1">
                              {(() => {
                                const opts = unitsForItem(editLine.itemId);
                                return opts.length > 0 ? (
                                  <select value={editLine.uomId || ''} onChange={e => { const u = opts.find((x: any) => x.id === e.target.value); setEditLine(l => { const oldRate = rateOf(l.uomId); const newRate = Number(u?.conversion_rate_to_base || 1) || 1; const newPrice = Math.round((Number(l.unitPrice || 0) / oldRate) * newRate * 100) / 100; return recompute({ ...l, uomId: e.target.value, unit: u?.name || '', unitPrice: newPrice }); }); }} className="w-full border border-slate-300 rounded px-1 py-1 bg-white text-xs">
                                    <option value=""></option>
                                    {opts.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                  </select>
                                ) : <input value={editLine.unit} onChange={e => setEdit('unit', e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"/>;
                              })()}
                            </td>
                            <td className="px-1.5 py-1"><NumberInput value={editLine.unitPrice} min={0} decimals={0} onChange={v => setEditLine(l => recompute({ ...l, unitPrice: v }))} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right text-xs"/></td>
                            <td className="px-1.5 py-1"><input readOnly value={editLine.amount > 0 ? editLine.amount.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'} className="w-full border border-slate-100 rounded px-1.5 py-1 bg-slate-50 text-slate-600 text-right text-xs"/></td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.departmentId} onChange={e => setEditLine(l => ({ ...l, departmentId: e.target.value }))} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={editLine.locationId} onChange={e => setEditLine(l => ({ ...l, locationId: e.target.value }))} className="w-full border border-slate-300 rounded px-1.5 py-1 bg-white text-xs">
                                <option value=""></option>
                                {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </td>
                          </tr>
                        )}
                        {editingId === null && (
                          <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                            <td colSpan={8} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a line...</td>
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
                </div>
              )}
              {lineTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom save bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="pr-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null}{isEdit ? 'Save Changes' : 'Save'}
            </button>
            <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}
