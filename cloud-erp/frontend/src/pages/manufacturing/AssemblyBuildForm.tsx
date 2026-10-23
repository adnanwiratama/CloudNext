import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Hammer } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency, formatNumber } from '../../utils/format';
import toast from 'react-hot-toast';

export default function AssemblyBuildForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items, locations, departments } = useFormOptions();

  const { data: subsidiariesData } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []),
  });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);

  const [form, setForm] = useState({
    buildDate: new Date().toISOString().split('T')[0],
    assemblyItemId: searchParams.get('itemId') || '',
    bomId: searchParams.get('bomId') || '',
    buildQty: 1,
    locationId: '',
    departmentId: '',
    subsidiaryId: '',
    workOrderId: searchParams.get('workOrderId') || '',
    memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (subsidiaries.length > 0 && !form.subsidiaryId) set('subsidiaryId', subsidiaries[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsidiaries]);

  const assemblyItems = items.filter((it: any) => ['assembly', 'finished_good', 'inventory'].includes(it.type));

  // Resolve the active BOM for the selected assembly item automatically.
  const { data: itemBoms } = useQuery({
    queryKey: ['ab-item-boms', form.assemblyItemId],
    queryFn: () => api.get('/api/manufacturing/boms', { params: { finishedGoodId: form.assemblyItemId, limit: 200 } }).then(r => r.data.data || []),
    enabled: !!form.assemblyItemId,
  });
  useEffect(() => {
    if (!form.assemblyItemId) return;
    if (itemBoms && itemBoms.length > 0 && !form.bomId) {
      setForm(f => (f.bomId ? f : { ...f, bomId: itemBoms[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemBoms, form.assemblyItemId]);

  // Load BOM components for the preview table.
  const { data: bomData } = useQuery({
    queryKey: ['ab-bom-detail', form.bomId],
    queryFn: () => api.get(`/api/manufacturing/boms/${form.bomId}`).then(r => r.data.data),
    enabled: !!form.bomId,
  });
  const components: any[] = bomData?.components || bomData?.lines || [];

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/manufacturing/assembly-builds', data),
    onSuccess: (res) => {
      toast.success('Assembly build recorded. Inventory updated.');
      navigate(`/manufacturing/assembly-builds/${res.data.data.id}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record assembly'),
  });

  const handleSave = () => {
    if (!form.assemblyItemId) { toast.error('Assembly Item is required'); return; }
    if (!form.buildQty || Number(form.buildQty) <= 0) { toast.error('Build Quantity must be greater than 0'); return; }
    if (!form.locationId) { toast.error('Location is required'); return; }
    mutation.mutate({
      assemblyItemId: form.assemblyItemId,
      buildDate: form.buildDate,
      buildQty: Number(form.buildQty),
      locationId: form.locationId,
      departmentId: form.departmentId || null,
      subsidiaryId: form.subsidiaryId || null,
      workOrderId: form.workOrderId || null,
      bomId: form.bomId || null,
      memo: form.memo,
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
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white"><Hammer size={15}/></div>
              <h1 className="text-xl font-semibold text-slate-800">Assembly Build</h1>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/manufacturing/assembly-builds')} className="hover:underline">List</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/manufacturing/assembly-builds')}
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
                    <label className={lbl}>Assembly Item <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.assemblyItemId}
                      onChange={e => { set('assemblyItemId', e.target.value); set('bomId', ''); }}>
                      <option value="">-- Select Assembly Item --</option>
                      {assemblyItems.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Build Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} value={form.buildDate} onChange={e => set('buildDate', e.target.value)}/>
                  </div>
                  <div>
                    <label className={lbl}>Build Quantity <span className="text-red-500">*</span></label>
                    <input type="number" min="0.001" step="0.001" className={inp} value={form.buildQty} onChange={e => set('buildQty', e.target.value)}/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Finish To Location <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                      <option value="">-- Select Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Linked Work Order</label>
                    <input type="text" className={inp} value={form.workOrderId} onChange={e => set('workOrderId', e.target.value)} placeholder="Work Order ID (optional)"/>
                  </div>
                  <div>
                    <label className={lbl}>Memo</label>
                    <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Internal notes..."/>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Bill of Materials</label>
                    <input readOnly value={bomData?.bom_number ? `${bomData.bom_number} - ${bomData.name || ''}` : (form.assemblyItemId ? 'Auto-resolved on save' : '-')}
                      className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default"/>
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

        {/* ── Components preview ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            <div className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px border-blue-600 text-blue-700">Components</div>
          </div>
          <div className="p-3">
            {components.length > 0 ? (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
                  Building <strong>{formatNumber(Number(form.buildQty) || 0, 2)} unit(s)</strong> consumes the following components:
                </div>
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Component</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Qty per Unit</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total Required</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((comp: any, i: number) => (
                      <tr key={comp.id || i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{comp.item_code}</span><div>{comp.item_name}</div></td>
                        <td className="px-3 py-1.5 text-right">{formatNumber(comp.quantity, 4)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{comp.uom_code || comp.uom_name || ''}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-blue-600">{formatNumber(parseFloat(comp.quantity) * (Number(form.buildQty) || 0), 4)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(comp.standard_cost || comp.average_cost || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">
                {form.assemblyItemId ? 'No active BOM components found for this item. The build will auto-resolve its BOM on save.' : 'Select an assembly item to preview components.'}
              </div>
            )}
          </div>
        </div>

        {/* ── GL note ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded p-3">
            <p className="font-medium">GL &amp; Inventory Impact</p>
            <p className="text-xs text-emerald-700 mt-1">Dr. Inventory (finished good's inventory account) / Cr. Inventory (component inventory accounts)</p>
          </div>
        </div>

        {/* ── Bottom Save/Cancel ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/manufacturing/assembly-builds')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
