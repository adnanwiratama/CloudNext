import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Loader2, Search, Download, Ban, Eye, Ruler } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function UomListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['uom-types', showInactive],
    queryFn: () => api.get('/api/settings/uom-types', { params: { includeInactive: showInactive } }).then(r => r.data.data || []),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/uom-types/${id}`),
    onSuccess: () => { toast.success('UOM type deactivated'); qc.invalidateQueries({ queryKey: ['uom-types'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  // Flatten types -> one row per unit (so each unit shows its own rate + base flag)
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: any[] = [];
    (data || []).forEach((t: any) => {
      (t.units || []).forEach((u: any) => {
        out.push({
          typeId: t.id, typeName: t.name, typeActive: t.is_active,
          unitId: u.id, name: u.name, abbreviation: u.abbreviation || u.code,
          isBase: u.is_base_unit, rate: Number(u.conversion_rate_to_base || 0), active: u.is_active,
        });
      });
      if (!(t.units || []).length) {
        out.push({ typeId: t.id, typeName: t.name, typeActive: t.is_active, unitId: null, name: '—', abbreviation: '—', isBase: false, rate: null, active: t.is_active });
      }
    });
    if (!q) return out;
    return out.filter(r => r.name.toLowerCase().includes(q) || String(r.abbreviation).toLowerCase().includes(q) || r.typeName.toLowerCase().includes(q));
  }, [data, search]);

  const exportCsv = () => {
    const header = ['UOM Name', 'UOM Type', 'Base Unit', 'Abbreviation', 'Conversion Rate', 'Status'];
    const lines = rows.map(r => [r.name, r.typeName, r.isBase ? 'Yes' : '', r.abbreviation, r.rate ?? '', r.active ? 'Active' : 'Inactive']);
    const csv = [header, ...lines].map(l => l.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'units-of-measure.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Ruler size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Units of Measure</h1>
            <span className="text-sm text-slate-500">Define UOM types and conversion rates against a base unit</span>
          </div>
          <button onClick={() => navigate('/settings/uom/new')} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New UOM
          </button>
        </div>
        {/* Toolbar */}
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap border-t border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search UOM" className="bg-transparent text-sm outline-none w-56" />
          </div>
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-600 rounded hover:bg-slate-50"><Download size={13} /> Export</button>
          <label className="flex items-center gap-2 text-sm text-slate-600 ml-auto cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Show Inactive
          </label>
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
                  <th className="px-3 py-1.5 text-left">UOM Name</th>
                  <th className="px-3 py-1.5 text-left">UOM Type</th>
                  <th className="px-3 py-1.5 text-left w-28">Base Unit</th>
                  <th className="px-3 py-1.5 text-left w-32">Abbreviation</th>
                  <th className="px-3 py-1.5 text-right w-36">Conversion Rate</th>
                  <th className="px-3 py-1.5 text-left w-24">Status</th>
                  <th className="px-3 py-1.5 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No units of measure defined yet.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.unitId || `${r.typeId}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{r.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.typeName}</td>
                    <td className="px-3 py-1.5">{r.isBase ? <span className="badge badge-blue text-2xs">Base Unit</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.abbreviation}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.rate == null ? '—' : r.rate.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                    <td className="px-3 py-1.5"><span className={`badge text-2xs ${r.active ? 'badge-green' : 'badge-gray'}`}>{r.active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="View / Edit" className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" onClick={() => navigate(`/settings/uom/${r.typeId}`)}><Eye size={13} /></button>
                        <button title="Edit" className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" onClick={() => navigate(`/settings/uom/${r.typeId}`)}><Pencil size={12} /></button>
                        {r.typeActive && (
                          <button title="Deactivate Type" className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" onClick={() => { if (confirm(`Deactivate UOM type "${r.typeName}"?`)) deactivate.mutate(r.typeId); }}><Ban size={13} /></button>
                        )}
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
