import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2, Layers } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CompLine {
  id: number;
  dbId?: string;
  itemId: string;
  description: string;
  componentYield: number;
  bomQuantity: number;
  quantity: number;
  unit: string;
  uomId: string;
}

export default function BOMForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id && id !== 'new';
  const { items, uomUnits } = useFormOptions();

  // Items eligible as the finished good / "Bill Of Materials" item
  const finishedGoods = items.filter((i: any) => ['finished_good', 'assembly', 'inventory'].includes(i.type));

  // UOM options for a given item (filtered by its uom_type_id)
  const unitsForItem = (itemId: string): any[] => {
    const it = items.find((i: any) => i.id === itemId);
    if (!it?.uom_type_id) return [];
    return (uomUnits || []).filter((u: any) => u.uom_type_id === it.uom_type_id);
  };

  // ── UI state ───────────────────────────────────────────────────────────────
  const [primaryOpen, setPrimaryOpen] = useState(true);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    memo: '',
    finishedGoodId: searchParams.get('finishedGoodId') || '',
    revision: '1',
    effectiveDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    quantity: 1,
    uomId: '',
    yieldPercent: 100,
    inactive: false,
    description: '',
  });
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ── Line state ───────────────────────────────────────────────────────────────
  const [lineCounter, setLineCounter] = useState(1000);
  const [lines, setLines] = useState<CompLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const blankLine = (): CompLine => ({
    id: lineCounter, itemId: '', description: '', componentYield: 100, bomQuantity: 1, quantity: 1, unit: '', uomId: '',
  });
  const [editLine, setEditLine] = useState<CompLine>(blankLine());

  // Load existing BOM for edit
  const { data: existingBom } = useQuery({
    queryKey: ['bom-edit', id],
    queryFn: () => api.get(`/api/manufacturing/boms/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!existingBom || initialized) return;
    setForm({
      name: existingBom.name || '',
      memo: existingBom.memo || '',
      finishedGoodId: existingBom.finished_good_id || '',
      revision: existingBom.revision || '1',
      effectiveDate: existingBom.effective_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      expiryDate: existingBom.expiry_date?.split('T')[0] || '',
      quantity: parseFloat(existingBom.quantity) || 1,
      uomId: existingBom.uom_id || '',
      yieldPercent: existingBom.yield_percent != null ? parseFloat(existingBom.yield_percent) : 100,
      inactive: existingBom.is_active === false || existingBom.status === 'inactive',
      description: existingBom.description || '',
    });
    setCreatedAt(existingBom.created_at || null);
    const comps = existingBom.components || existingBom.lines || [];
    if (comps.length) {
      setLines(comps.map((c: any, i: number) => ({
        id: 1000 + i,
        dbId: c.id,
        itemId: c.item_id || '',
        description: c.description || '',
        componentYield: c.component_yield != null ? parseFloat(c.component_yield) : 100,
        bomQuantity: c.bom_quantity != null ? parseFloat(c.bom_quantity) : 1,
        quantity: parseFloat(c.quantity) || 1,
        unit: c.uom_code || c.uom_name || '',
        uomId: c.uom_id || '',
      })));
      setLineCounter(1000 + comps.length);
    }
    setInitialized(true);
  }, [existingBom, initialized]);

  // ── Line editing ───────────────────────────────────────────────────────────────
  const startNew = () => {
    setLineCounter(c => c + 1);
    setEditLine({ ...blankLine(), id: lineCounter + 1 });
    setEditingId(-1);
  };
  const cancelEdit = () => { setEditLine(blankLine()); setEditingId(null); };

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

  const removeLine = (lid: number) => { setLines(prev => prev.filter(l => l.id !== lid)); setEditLine(blankLine()); setEditingId(null); };

  // ── Save ───────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.put(`/api/manufacturing/boms/${id}`, data)
      : api.post('/api/manufacturing/boms', data),
    onSuccess: (res) => {
      const savedId = res.data.data?.id || id;
      toast.success(isEdit ? 'BOM updated' : 'BOM created');
      navigate(`/manufacturing/boms/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save BOM'),
  });

  const handleSave = () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (!form.finishedGoodId) { toast.error('Bill Of Materials item is required'); return; }
    mutation.mutate({
      name: form.name,
      finishedGoodId: form.finishedGoodId,
      revision: form.revision,
      effectiveDate: form.effectiveDate || null,
      expiryDate: form.expiryDate || null,
      quantity: Number(form.quantity) || 1,
      uomId: form.uomId || null,
      yieldPercent: Number(form.yieldPercent) || 100,
      inactive: !!form.inactive,
      memo: form.memo,
      description: form.description,
      components: lines.filter(l => l.itemId).map(l => ({
        itemId: l.itemId,
        description: l.description,
        componentYield: Number(l.componentYield) || 100,
        bomQuantity: Number(l.bomQuantity) || 1,
        quantity: Number(l.quantity) || 1,
        uomId: l.uomId || null,
        scrapPercent: 0,
        supplyType: 'pull',
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
              <div className="w-8 h-8 rounded bg-indigo-700 flex items-center justify-center text-white"><Layers size={15}/></div>
              <h1 className="text-xl font-semibold text-slate-800">Bill of Materials</h1>
              {isEdit && existingBom?.bom_number && <span className="text-xl font-semibold text-slate-500">{existingBom.bom_number}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/manufacturing/boms')} className="hover:underline">List</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/manufacturing/boms')}
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
                    <label className={lbl}>Name <span className="text-red-500">*</span></label>
                    <input type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Produk A - Standard BOM"/>
                  </div>
                  <div>
                    <label className={lbl}>Memo</label>
                    <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Internal notes..."/>
                  </div>
                  <div>
                    <label className={lbl}>Bill Of Materials <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.finishedGoodId} onChange={e => set('finishedGoodId', e.target.value)}>
                      <option value="">-- Select Item --</option>
                      {finishedGoods.map((i: any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Effective Start Date</label>
                    <input type="date" className={inp} value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Effective End Date</label>
                    <input type="date" className={inp} value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Revision</label>
                    <input type="text" className={inp} value={form.revision} onChange={e => set('revision', e.target.value)}/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-5">
                    <input id="inactive" type="checkbox" checked={form.inactive} onChange={e => set('inactive', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"/>
                    <label htmlFor="inactive" className="text-sm text-slate-700">Inactive</label>
                  </div>
                  {isEdit && (
                    <div>
                      <label className={lbl}>Date Created</label>
                      <input readOnly value={createdAt ? formatDate(createdAt) : '-'}
                        className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default"/>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Components ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            <div className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px border-blue-600 text-blue-700">Components</div>
          </div>
          <div className="p-3">
            <div className="border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-xs min-w-max">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56">Item <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Description</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Component Yield</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">BOM Quantity</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Quantity <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.id} onClick={() => { setEditLine({ ...line }); setEditingId(line.id); }}
                      className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                      <td className="px-3 py-1.5 text-slate-700">{items.find((i: any) => i.id === line.itemId)?.name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{line.description || '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{line.componentYield}%</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{line.bomQuantity.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{line.quantity.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-1.5 text-slate-500">{line.unit || '-'}</td>
                    </tr>
                  ))}
                  {editingId !== null && (
                    <tr className="border-t border-blue-300 bg-blue-50/40">
                      <td className="px-1.5 py-1">
                        <select value={editLine.itemId}
                          onChange={e => {
                            const item = items.find((i: any) => i.id === e.target.value);
                            const opts = (uomUnits || []).filter((u: any) => u.uom_type_id === item?.uom_type_id);
                            const baseUnit = opts.find((u: any) => u.is_base_unit) || opts[0];
                            setEditLine(l => ({ ...l, itemId: e.target.value, description: item?.name || '', unit: baseUnit?.name || '', uomId: baseUnit?.id || '' }));
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
                        <input type="number" step="0.01" min="0" max="100" value={editLine.componentYield}
                          onChange={e => setEditLine(l => ({ ...l, componentYield: Number(e.target.value) }))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1">
                        <NumberInput value={editLine.bomQuantity} min={0} decimals={4}
                          onChange={v => setEditLine(l => ({ ...l, bomQuantity: v }))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1">
                        <NumberInput value={editLine.quantity} min={0} decimals={4}
                          onChange={v => setEditLine(l => ({ ...l, quantity: v }))}
                          className="w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400 text-right"/>
                      </td>
                      <td className="px-1.5 py-1">
                        {(() => {
                          const opts = unitsForItem(editLine.itemId);
                          return opts.length > 0 ? (
                            <select value={editLine.uomId || ''}
                              onChange={e => {
                                const u = opts.find((x: any) => x.id === e.target.value);
                                setEditLine(l => ({ ...l, uomId: e.target.value, unit: u?.name || '' }));
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
                    </tr>
                  )}
                  {editingId === null && (
                    <tr onClick={startNew} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <td colSpan={6} className="px-3 py-2 text-slate-400 text-xs italic">Click to add a component...</td>
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
          </div>
        </div>

        {/* ── Bottom Save/Cancel ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/manufacturing/boms')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
