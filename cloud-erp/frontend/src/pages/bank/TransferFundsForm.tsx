import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, ArrowRight } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export default function TransferFundsForm() {
  const navigate = useNavigate();
  const { accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || a.subtype==='bank' || ['1010','1020','1025','1030'].includes(a.code));
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'info'|'files'>('info');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    transferDate: new Date().toISOString().split('T')[0],
    fromAccountId: '', toAccountId: '', amount: 0,
    reference: '', memo: '', locationId: '', departmentId: '', subsidiaryId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/bank/transfers', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id;
      if (savedId) try { await uploadFileRows(fileRows, 'bank_transfer', savedId, api.post.bind(api)); } catch (_) {}
      toast.success('Fund transfer recorded');
      if (savedId) navigate(`/bank/transfers/${savedId}`, { state: { justSaved: true } });
      else navigate('/bank/transfers-list');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record transfer'),
  });

  const handleSave = () => {
    if (!form.fromAccountId) { toast.error('From Account is required'); return; }
    if (!form.toAccountId)   { toast.error('To Account is required'); return; }
    if (form.fromAccountId === form.toAccountId) { toast.error('From and To accounts must be different'); return; }
    if (!form.amount || form.amount <= 0) { toast.error('Amount must be > 0'); return; }
    mutation.mutate({ ...form, amount: Number(form.amount), locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white"><ArrowRight size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Transfer Funds</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/transfers-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_transfer')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button onClick={() => navigate('/bank/transfers-list')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Transfer Date <span className="text-red-500">*</span></label>
                    <input type="date" value={form.transferDate} onChange={e=>set('transferDate',e.target.value)} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Amount <span className="text-red-500">*</span></label>
                    <input type="number" min="0" step="0.01" value={form.amount||''} onChange={e=>set('amount',parseFloat(e.target.value)||0)} className={`${dis} text-right font-medium`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Reference</label>
                    <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer reference"/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">From Account <span className="text-red-500">*</span></label>
                    <select value={form.fromAccountId} onChange={e=>set('fromAccountId',e.target.value)} className={sel}>
                      <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">To Account <span className="text-red-500">*</span></label>
                    <select value={form.toAccountId} onChange={e=>set('toAccountId',e.target.value)} className={sel}>
                      <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={sel}><option value="">--</option>{departments.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={sel}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                    <input value={form.memo} onChange={e=>set('memo',e.target.value)} className={dis} placeholder="Purpose of transfer"/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                  <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={sel}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                  <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={sel}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                  <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={sel}><option value="">--</option>{departments.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['info','files'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='info'?'Transfer Details':'Files'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='info' && (
              <div className="flex items-center justify-center py-6 gap-6">
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">From</div>
                  <div className="text-sm font-medium text-slate-800 px-4 py-2 bg-slate-100 rounded">{bankAccounts.find((a:any)=>a.id===form.fromAccountId)?.name||'—'}</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <ArrowRight size={24} className="text-blue-500"/>
                  <div className="text-xs font-bold text-blue-700">{Number(form.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">To</div>
                  <div className="text-sm font-medium text-slate-800 px-4 py-2 bg-slate-100 rounded">{bankAccounts.find((a:any)=>a.id===form.toAccountId)?.name||'—'}</div>
                </div>
              </div>
            )}
            {activeTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button onClick={()=>navigate('/bank/transfers-list')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
