import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2, Play, Pencil, Trash2, Plus, CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface SavedImport {
  id: string;
  name: string;
  record_type: string;
  mode: string;
  delimiter: string;
  file_name: string | null;
  row_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

const MODE_LABEL: Record<string, string> = { add: 'ADD', update: 'UPDATE', addupdate: 'ADD OR UPDATE' };

export default function SavedCSVImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; success: number; errors: string[] } | null>(null);

  const { data: types = [] } = useQuery<any[]>({
    queryKey: ['import-types'],
    queryFn: () => api.get('/api/settings/import-types').then(r => r.data.data || []),
  });
  const typeLabel = (v: string) => types.find(t => t.value === v)?.label || v;

  const { data, isLoading } = useQuery<SavedImport[]>({
    queryKey: ['saved-imports'],
    queryFn: () => api.get('/api/settings/saved-imports').then(r => r.data.data || []),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/saved-imports/${id}`),
    onSuccess: () => { toast.success('Saved import deleted'); qc.invalidateQueries({ queryKey: ['saved-imports'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  // Run a saved import directly: fetch full config (incl. rows) and POST to the import engine.
  const runSaved = async (id: string) => {
    setRunningId(id); setResult(null);
    try {
      const full = await api.get(`/api/settings/saved-imports/${id}`).then(r => r.data.data);
      if (!full.rows?.length) { toast.error('This saved import has no CSV data to run'); return; }
      const res = await api.post('/api/settings/import-csv', {
        type: full.record_type, mode: full.mode, mapping: full.mapping, rows: full.rows,
      });
      const r = res.data.data;
      setResult({ id, success: r.success, errors: r.errors || [] });
      await api.put(`/api/settings/saved-imports/${id}`, { markRun: true });
      qc.invalidateQueries({ queryKey: ['saved-imports'] });
      if (r.errors?.length) toast(`Imported ${r.success}, ${r.errors.length} error(s)`, { icon: '⚠️' });
      else toast.success(`Imported ${r.success} record(s)`);
    } catch (e: any) {
      const d = e.response?.data?.data;
      if (d) setResult({ id, success: d.success || 0, errors: d.errors || [] });
      toast.error(e.response?.data?.error || 'Run failed');
    } finally { setRunningId(null); }
  };

  const rows: SavedImport[] = data || [];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Database size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Saved CSV Imports</h1>
            <span className="text-sm text-slate-500">Reuse previously saved import setups</span>
          </div>
          <button onClick={() => navigate('/settings/import-csv')} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New Import
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {result && (
          <div className={`border rounded p-4 ${result.errors.length === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">{result.success} record(s) imported</span>
              <button onClick={() => setResult(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">dismiss</button>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-1">
                <div className="flex items-center gap-2 mb-1"><XCircle size={15} className="text-red-500" /><span className="text-sm font-medium text-red-700">{result.errors.length} error(s):</span></div>
                <ul className="list-disc list-inside space-y-0.5 max-h-48 overflow-auto">
                  {result.errors.slice(0, 50).map((err, i) => <li key={i} className="text-xs text-red-600">{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left">Name</th>
                  <th className="px-3 py-1.5 text-left">Record Type</th>
                  <th className="px-3 py-1.5 text-left w-32">Mode</th>
                  <th className="px-3 py-1.5 text-left">File</th>
                  <th className="px-3 py-1.5 text-right w-20">Rows</th>
                  <th className="px-3 py-1.5 text-left w-40">Last Run</th>
                  <th className="px-3 py-1.5 text-center w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-slate-400">No saved imports yet. Create one from the Import Assistant.</td></tr>
                  : rows.map(s => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-700">{s.name}</td>
                      <td className="px-3 py-1.5 text-slate-600">{typeLabel(s.record_type)}</td>
                      <td className="px-3 py-1.5"><span className="badge badge-gray text-2xs uppercase">{MODE_LABEL[s.mode] || s.mode}</span></td>
                      <td className="px-3 py-1.5 text-slate-500 truncate max-w-[200px]">{s.file_name || '—'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{s.row_count}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => runSaved(s.id)} disabled={runningId === s.id}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-60" title="Run this saved import">
                            {runningId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run
                          </button>
                          <button onClick={() => navigate(`/settings/import-csv?saved=${s.id}`)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" title="Open in Import Assistant"><Pencil size={14} /></button>
                          <button onClick={() => { if (confirm(`Delete saved import "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
