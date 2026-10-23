import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Hash, Save, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface SeqRow {
  id: string;
  transaction_type: string;
  display_label: string;
  prefix: string | null;
  suffix: string | null;
  min_digits: number;
  initial_number: number;
  last_number: number;
  increment: number;
  include_year: boolean;
  allow_override: boolean;
}

// Build a live preview of the next generated number for a row.
function preview(r: SeqRow): string {
  const year = r.include_year ? `-${new Date().getFullYear()}-` : '';
  const next = Math.max((r.last_number || 0) + (r.increment || 1), r.initial_number || 1);
  const num = String(next).padStart(Math.max(1, r.min_digits || 1), '0');
  return `${r.prefix || ''}${year}${num}${r.suffix || ''}`;
}

export default function AutoNumberPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<SeqRow[]>([]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<SeqRow[]>({
    queryKey: ['auto-numbers'],
    queryFn: () => api.get('/api/settings/auto-numbers').then(r => r.data.data || []),
  });

  useEffect(() => { if (data) { setRows(data); setDirty(new Set()); } }, [data]);

  const edit = (id: string, patch: Partial<SeqRow>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    setDirty(d => new Set(d).add(id));
  };

  const saveMutation = useMutation({
    mutationFn: (r: SeqRow) => api.put(`/api/settings/auto-numbers/${r.id}`, {
      prefix: r.prefix, suffix: r.suffix, minDigits: r.min_digits,
      initialNumber: r.initial_number, currentNumber: r.last_number,
      increment: r.increment, includeYear: r.include_year, allowOverride: r.allow_override,
    }),
    onSuccess: (_res, r) => {
      setDirty(d => { const n = new Set(d); n.delete(r.id); return n; });
      qc.invalidateQueries({ queryKey: ['auto-numbers'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const saveAll = async () => {
    const toSave = rows.filter(r => dirty.has(r.id));
    if (!toSave.length) { toast('No changes to save', { icon: 'ℹ️' }); return; }
    try {
      for (const r of toSave) await saveMutation.mutateAsync(r);
      toast.success(`Saved ${toSave.length} number setup(s)`);
    } catch { /* per-row error already toasted */ }
  };

  const num = 'w-20 border border-slate-300 rounded text-sm px-2 py-1 text-right focus:outline-none focus:border-blue-400';
  const txt = 'w-24 border border-slate-300 rounded text-sm px-2 py-1 focus:outline-none focus:border-blue-400';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Hash size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Auto Generated Number</h1>
            <span className="text-sm text-slate-500">Configure the numbering format for each record type</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-600 rounded hover:bg-slate-50"><RefreshCw size={13} /> Refresh</button>
            <button onClick={saveAll} disabled={saveMutation.isPending || dirty.size === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />} Save{dirty.size > 0 ? ` (${dirty.size})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left w-28">Prefix</th>
                  <th className="px-3 py-2 text-left w-28">Suffix</th>
                  <th className="px-3 py-2 text-right w-28">Minimum Digits</th>
                  <th className="px-3 py-2 text-right w-28">Initial Number</th>
                  <th className="px-3 py-2 text-right w-28">Current Number</th>
                  <th className="px-3 py-2 text-center w-24">Include Year</th>
                  <th className="px-3 py-2 text-center w-28">Allow Override</th>
                  <th className="px-3 py-2 text-left w-48">Next Number Preview</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">No record types configured.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 ${dirty.has(r.id) ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{r.display_label}</td>
                    <td className="px-3 py-1.5"><input className={txt} value={r.prefix || ''} onChange={e => edit(r.id, { prefix: e.target.value })} /></td>
                    <td className="px-3 py-1.5"><input className={txt} value={r.suffix || ''} onChange={e => edit(r.id, { suffix: e.target.value })} /></td>
                    <td className="px-3 py-1.5 text-right"><input type="number" min={1} className={num} value={r.min_digits} onChange={e => edit(r.id, { min_digits: parseInt(e.target.value) || 1 })} /></td>
                    <td className="px-3 py-1.5 text-right"><input type="number" min={1} className={num} value={r.initial_number} onChange={e => edit(r.id, { initial_number: parseInt(e.target.value) || 1 })} /></td>
                    <td className="px-3 py-1.5 text-right"><input type="number" min={0} className={num} value={r.last_number} onChange={e => edit(r.id, { last_number: parseInt(e.target.value) || 0 })} /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={r.include_year} onChange={e => edit(r.id, { include_year: e.target.checked })} /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={r.allow_override} onChange={e => edit(r.id, { allow_override: e.target.checked })} /></td>
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-700">{preview(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">Changed rows are highlighted. Click Save to apply. New transactions of each type will use the configured format. "Allow Override" lets users enter a custom number on the transaction form.</p>
      </div>
    </div>
  );
}
