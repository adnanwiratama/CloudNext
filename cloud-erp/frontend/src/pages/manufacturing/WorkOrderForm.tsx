import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export default function WorkOrderForm() {
  const navigate = useNavigate();
  const { items, locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'info'|'files'>('info');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    itemId: '', bomId: '', quantity: 1,
    plannedStartDate: new Date().toISOString().split('T')[0],
    plannedEndDate: '', locationId: '', departmentId: '', subsidiaryId: '',
    priority: 'normal', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data: boms } = useQuery({
    queryKey: ['boms'],
    queryFn: () => api.get('/api/manufacturing/boms', { params: { limit: 200 } }).then(r => r.data.data || []),
  });
  const filteredBoms = (boms||[]).filter((b:any) => !form.itemId || b.finished_good_id === form.itemId);
  const finishedGoods = items.filter((i:any) => ['finished_good','assembly','inventory'].includes(i.type));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/manufacturing/work-orders', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id;
      if (savedId) try { await uploadFileRows(fileRows, 'work_order', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Work Order created');
      navigate(`/manufacturing/work-orders/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create work order'),
  });

  const handleSave = () => {
    if (!form.itemId) { toast.error('Item to produce is required'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast.error('Quantity must be > 0'); return; }
    mutation.mutate({
      ...form, quantity: Number(form.quantity),
      locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null,
      bomId: form.bomId||null, plannedEndDate: form.plannedEndDate||null,
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-700 flex items-center justify-center text-white font-bold text-xs">WO</div>
              <span className="text-xl font-bold text-slate-800">Work Order</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/manufacturing/work-orders')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=work_order')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button onClick={() => navigate('/manufacturing/work-orders')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Item to Produce <span className="text-red-500">*</span></label>
                    <select value={form.itemId} onChange={e => { set('itemId',e.target.value); set('bomId',''); }} className={sel}>
                      <option value="">-- Select Item --</option>
                      {finishedGoods.map((i:any) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Bill of Materials</label>
                    <select value={form.bomId} onChange={e => set('bomId',e.target.value)} className={sel}>
                      <option value="">-- Select BOM --</option>
                      {filteredBoms.map((b:any) => <option key={b.id} value={b.id}>{b.bom_number} - {b.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Quantity <span className="text-red-500">*</span></label>
                    <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => set('quantity',e.target.value)} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Planned Start Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.plannedStartDate} onChange={e => set('plannedStartDate',e.target.value)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Planned End Date</label>
                    <input type="date" value={form.plannedEndDate} onChange={e => set('plannedEndDate',e.target.value)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Priority</label>
                    <select value={form.priority} onChange={e => set('priority',e.target.value)} className={sel}>
                      <option value="low">Low</option><option value="normal">Normal</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e => set('locationId',e.target.value)} className={sel}>
                      <option value="">--</option>{locations.map((l:any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e => set('departmentId',e.target.value)} className={sel}>
                      <option value="">--</option>{departments.map((d:any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <textarea value={form.memo} onChange={e => set('memo',e.target.value)} rows={2} className={`${dis} resize-none`} placeholder="Production instructions..."/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                  <select value={form.subsidiaryId} onChange={e => set('subsidiaryId',e.target.value)} className={sel}>
                    <option value="">--</option>{subsidiaries.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                  <select value={form.departmentId} onChange={e => set('departmentId',e.target.value)} className={sel}>
                    <option value="">--</option>{departments.map((d:any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                  <select value={form.locationId} onChange={e => set('locationId',e.target.value)} className={sel}>
                    <option value="">--</option>{locations.map((l:any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['info','files'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='info'?'Work Order Details':'Files'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='info' && (
              <div className="text-sm text-slate-500 bg-blue-50 border border-blue-100 rounded p-4">
                <p className="font-medium text-blue-800 mb-1">GL Impact on Completion</p>
                <p className="text-xs text-blue-700"><strong>Dr. Finished Goods Inventory → Cr. WIP (Work in Process)</strong><br/>
                Components consumed: <strong>Dr. WIP → Cr. Raw Material Inventory</strong></p>
              </div>
            )}
            {activeTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button onClick={() => navigate('/manufacturing/work-orders')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
