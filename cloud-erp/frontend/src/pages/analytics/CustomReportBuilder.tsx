import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, X, ChevronUp, ChevronDown, Play, Save, ArrowLeft } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel } from '../../utils/reportExport';
import toast from 'react-hot-toast';

// ── Types mirroring the backend contract ─────────────────────────────────────
interface CatalogCol { key: string; column: string; source: 'header' | 'line'; label: string; type: 'string' | 'number' | 'boolean' | 'date'; }
interface RunCol extends CatalogCol { /* key here is the src__column alias */ }
interface FilterRow { field: string; op: string; value?: string; value2?: string; }

const OPERATORS: { value: string; label: string; needsValue: boolean; needsTwo?: boolean }[] = [
  { value: '=', label: 'equals', needsValue: true },
  { value: '!=', label: 'not equals', needsValue: true },
  { value: '>', label: 'greater than', needsValue: true },
  { value: '>=', label: 'greater or equal', needsValue: true },
  { value: '<', label: 'less than', needsValue: true },
  { value: '<=', label: 'less or equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'starts', label: 'starts with', needsValue: true },
  { value: 'ends', label: 'ends with', needsValue: true },
  { value: 'in', label: 'is any of (comma list)', needsValue: true },
  { value: 'between', label: 'between', needsValue: true, needsTwo: true },
  { value: 'is_empty', label: 'is empty', needsValue: false },
  { value: 'is_not_empty', label: 'is not empty', needsValue: false },
];

const fmtCell = (v: any, type: string) => {
  if (v == null || v === '') return '';
  if (type === 'number') { const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString('id-ID', { maximumFractionDigits: 4 }); }
  if (type === 'date') { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  if (type === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

export default function CustomReportBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isExisting = !!id && id !== 'new';
  // When opened via /:id (not /edit) we still allow editing; edit vs view is soft.

  const [recordType, setRecordType] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);   // catalog keys (h.col / l.col)
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isOwner, setIsOwner] = useState(true);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Run results
  const [runCols, setRunCols] = useState<RunCol[]>([]);
  const [runRows, setRunRows] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Record types
  const { data: types } = useQuery({
    queryKey: ['custom-report-types'],
    queryFn: () => api.get('/api/reports/custom/types').then(r => r.data.data as { value: string; label: string; category: string; hasLines: boolean }[]),
  });

  // Column catalog for the chosen type
  const { data: fieldData, isFetching: loadingFields } = useQuery({
    queryKey: ['custom-report-fields', recordType],
    queryFn: () => api.get('/api/reports/custom/fields', { params: { type: recordType } }).then(r => r.data.data as { columns: CatalogCol[]; label: string }),
    enabled: !!recordType,
  });
  const catalog: CatalogCol[] = fieldData?.columns || [];
  const catalogByKey = useMemo(() => Object.fromEntries(catalog.map(c => [c.key, c])), [catalog]);

  // Load an existing saved report
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['custom-report', id],
    queryFn: () => api.get(`/api/reports/custom/${id}`).then(r => r.data.data),
    enabled: isExisting,
  });

  useEffect(() => {
    if (!existing) return;
    setLoadedId(existing.id);
    setRecordType(existing.record_type);
    setSelectedKeys(existing.columns || []);
    setFilters((existing.filters || []).map((f: any) => ({ ...f })));
    setName(existing.name || '');
    setDescription(existing.description || '');
    setVisibility(existing.visibility === 'public' ? 'public' : 'private');
    setIsOwner(!!existing.isOwner);
  }, [existing]);

  // When the type changes on a NEW report, reset selections/filters.
  const changeType = (t: string) => {
    setRecordType(t);
    setSelectedKeys([]);
    setFilters([]);
    setRunCols([]); setRunRows([]);
  };

  const addColumn = (key: string) => setSelectedKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  const removeColumn = (key: string) => setSelectedKeys(prev => prev.filter(k => k !== key));
  const moveColumn = (idx: number, dir: -1 | 1) => setSelectedKeys(prev => {
    const n = [...prev]; const j = idx + dir;
    if (j < 0 || j >= n.length) return prev;
    [n[idx], n[j]] = [n[j], n[idx]]; return n;
  });

  const addFilter = () => setFilters(prev => [...prev, { field: catalog[0]?.key || '', op: '=', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRow>) => setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i));

  const run = async () => {
    if (!recordType) { toast.error('Pick a record type first'); return; }
    setRunning(true);
    try {
      const body = { type: recordType, columns: selectedKeys, filters: filters.filter(f => f.field && f.op) };
      const r = await api.post('/api/reports/custom/run', body);
      setRunCols(r.data.data.columns || []);
      setRunRows(r.data.data.rows || []);
      if ((r.data.data.rows || []).length === 0) toast('No rows matched', { icon: 'ℹ️' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to run report');
    } finally { setRunning(false); }
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Give the report a name'); return; }
    if (!recordType) { toast.error('Pick a record type'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), recordType, columns: selectedKeys, filters: filters.filter(f => f.field && f.op), visibility, description };
      if (loadedId && isOwner) {
        await api.put(`/api/reports/custom/${loadedId}`, body);
        toast.success('Report updated');
      } else {
        const r = await api.post('/api/reports/custom', body);
        toast.success('Report saved');
        navigate(`/analytics/custom-reports/${r.data.data.id}`, { replace: true });
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save report');
    } finally { setSaving(false); }
  };

  // Export model from the current run result.
  const buildModel = (): ReportModel | null => {
    if (!runCols.length) return null;
    return {
      title: name || 'Custom Report',
      subtitle: `${fieldData?.label || recordType} · ${runRows.length} row(s)`,
      columns: runCols.map(c => ({ label: c.label, align: c.type === 'number' ? 'right' as const : 'left' as const })),
      rows: runRows.map(row => ({ cells: runCols.map(c => fmtCell(row[c.key], c.type)) })),
    };
  };

  const field = 'border border-slate-300 rounded text-sm px-2 py-1.5 bg-white';

  if (isExisting && loadingExisting) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-blue-500" /></div>;
  }

  const txnTypes = (types || []).filter(t => t.category === 'Transactions');
  const masterTypes = (types || []).filter(t => t.category === 'Master Data');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/analytics/custom-reports')} className="text-slate-500 hover:text-slate-700"><ArrowLeft size={18} /></button>
            <h1 className="text-xl font-semibold text-slate-800">{loadedId ? (isOwner ? 'Edit Report' : name || 'Report') : 'New Custom Report'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ReportExportBar build={buildModel} disabled={!runCols.length} />
          </div>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {/* Config card */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-4 space-y-4">
          {/* Row 1: name + type + visibility */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Report Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Open Sales Orders" className={`${field} w-full`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Record Type</label>
              <select value={recordType} onChange={e => changeType(e.target.value)} className={`${field} w-full`} disabled={!!loadedId}>
                <option value="">— Select —</option>
                {txnTypes.length > 0 && <optgroup label="Transactions">{txnTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>}
                {masterTypes.length > 0 && <optgroup label="Master Data">{masterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Visibility</label>
              <select value={visibility} onChange={e => setVisibility(e.target.value as any)} className={`${field} w-full`}>
                <option value="private">Private (only me)</option>
                <option value="public">Public (everyone)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" className={`${field} w-full`} />
          </div>

          {recordType && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
              {/* Columns picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">Columns {loadingFields && <Loader2 size={12} className="inline animate-spin text-blue-500" />}</span>
                  <span className="text-xs text-slate-400">{selectedKeys.length} selected</span>
                </div>
                {/* Available */}
                <div className="border border-slate-200 rounded max-h-48 overflow-auto mb-2">
                  {catalog.filter(c => !selectedKeys.includes(c.key)).map(c => (
                    <button key={c.key} onClick={() => addColumn(c.key)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 text-left border-b border-slate-50 last:border-0">
                      <span>{c.label}</span>
                      <Plus size={13} className="text-slate-400" />
                    </button>
                  ))}
                  {catalog.length > 0 && catalog.filter(c => !selectedKeys.includes(c.key)).length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-400">All columns selected</div>
                  )}
                </div>
                {/* Selected (ordered) */}
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Selected (in order)</div>
                <div className="border border-slate-200 rounded max-h-48 overflow-auto">
                  {selectedKeys.length === 0 ? <div className="px-3 py-2 text-xs text-slate-400">None — defaults to first columns when run</div>
                    : selectedKeys.map((k, i) => {
                      const c = catalogByKey[k];
                      return (
                        <div key={k} className="flex items-center justify-between px-3 py-1.5 text-sm border-b border-slate-50 last:border-0">
                          <span className="text-slate-700">{c?.label || k}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveColumn(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={14} /></button>
                            <button onClick={() => moveColumn(i, 1)} disabled={i === selectedKeys.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={14} /></button>
                            <button onClick={() => removeColumn(k)} className="text-slate-400 hover:text-red-600"><X size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Filters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">Filters</span>
                  <button onClick={addFilter} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Plus size={13} /> Add Filter</button>
                </div>
                <div className="space-y-2">
                  {filters.length === 0 && <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded px-3 py-3 text-center">No filters — all records returned</div>}
                  {filters.map((f, i) => {
                    const opDef = OPERATORS.find(o => o.value === f.op);
                    return (
                      <div key={i} className="flex items-center gap-1.5 flex-wrap">
                        <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })} className={`${field} flex-1 min-w-[130px]`}>
                          {catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value })} className={`${field} min-w-[110px]`}>
                          {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {opDef?.needsValue && (
                          <input value={f.value || ''} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="value" className={`${field} w-28`} />
                        )}
                        {opDef?.needsTwo && (
                          <input value={f.value2 || ''} onChange={e => updateFilter(i, { value2: e.target.value })} placeholder="and" className={`${field} w-28`} />
                        )}
                        <button onClick={() => removeFilter(i)} className="text-slate-400 hover:text-red-600"><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button onClick={run} disabled={running || !recordType} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
            </button>
            <button onClick={save} disabled={saving || !recordType} className="flex items-center gap-1.5 px-4 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {loadedId && isOwner ? 'Update' : 'Save'}
            </button>
          </div>
        </div>

        {/* Results */}
        {runCols.length > 0 && (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">Results · {runRows.length} row(s)</div>
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {runCols.map(c => <th key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {runRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/40">
                    {runCols.map(c => <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'} text-slate-700`}>{fmtCell(row[c.key], c.type)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
