import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, X, ChevronUp, ChevronDown, GripVertical, Play } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel } from '../../utils/reportExport';
import toast from 'react-hot-toast';

// ── Types mirroring the backend contract ─────────────────────────────────────
interface CatalogCol { key: string; column: string; source: 'header' | 'line'; label: string; type: 'string' | 'number' | 'boolean' | 'date'; }
interface RunCol extends CatalogCol { }
interface FilterRow { field: string; op: string; value?: string; value2?: string; }
interface SortRow { field: string; desc: boolean; }

const OPERATORS: { value: string; label: string; needsValue: boolean; needsTwo?: boolean }[] = [
  { value: '=', label: 'is', needsValue: true },
  { value: '!=', label: 'is not', needsValue: true },
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

type Tab = 'criteria' | 'results';

export default function CustomReportBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isExisting = !!id && id !== 'new';

  const [recordType, setRecordType] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [sort, setSort] = useState<SortRow[]>([{ field: '', desc: false }, { field: '', desc: false }, { field: '', desc: false }]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isOwner, setIsOwner] = useState(true);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('results');

  const [runCols, setRunCols] = useState<RunCol[]>([]);
  const [runRows, setRunRows] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const { data: types } = useQuery({
    queryKey: ['custom-report-types'],
    queryFn: () => api.get('/api/reports/custom/types').then(r => r.data.data as { value: string; label: string; category: string; hasLines: boolean }[]),
  });

  const { data: fieldData, isFetching: loadingFields } = useQuery({
    queryKey: ['custom-report-fields', recordType],
    queryFn: () => api.get('/api/reports/custom/fields', { params: { type: recordType } }).then(r => r.data.data as { columns: CatalogCol[]; label: string }),
    enabled: !!recordType,
  });
  const catalog: CatalogCol[] = fieldData?.columns || [];
  const catalogByKey = useMemo(() => Object.fromEntries(catalog.map(c => [c.key, c])), [catalog]);

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
    const s: SortRow[] = (existing.sort || []).map((x: any) => ({ field: x.field, desc: !!x.desc }));
    while (s.length < 3) s.push({ field: '', desc: false });
    setSort(s);
    setName(existing.name || '');
    setDescription(existing.description || '');
    setVisibility(existing.visibility === 'public' ? 'public' : 'private');
    setIsOwner(!!existing.isOwner);
  }, [existing]);

  const changeType = (t: string) => {
    setRecordType(t); setSelectedKeys([]); setFilters([]);
    setSort([{ field: '', desc: false }, { field: '', desc: false }, { field: '', desc: false }]);
    setRunCols([]); setRunRows([]); setShowResults(false);
  };

  const addColumn = (key: string) => setSelectedKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  const removeColumn = (key: string) => setSelectedKeys(prev => prev.filter(k => k !== key));
  const removeAllColumns = () => setSelectedKeys([]);
  const moveColumn = (idx: number, dir: -1 | 1) => setSelectedKeys(prev => {
    const n = [...prev]; const j = idx + dir;
    if (j < 0 || j >= n.length) return prev;
    [n[idx], n[j]] = [n[j], n[idx]]; return n;
  });

  const addFilter = () => setFilters(prev => [...prev, { field: catalog[0]?.key || '', op: '=', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRow>) => setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i));

  const updateSort = (i: number, patch: Partial<SortRow>) => setSort(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const buildPayloadSort = () => sort.filter(s => s.field).map(s => ({ field: s.field, desc: s.desc }));

  const run = async () => {
    if (!recordType) { toast.error('Pick a record type first'); return; }
    setRunning(true);
    try {
      const body = { type: recordType, columns: selectedKeys, filters: filters.filter(f => f.field && f.op), sort: buildPayloadSort() };
      const r = await api.post('/api/reports/custom/run', body);
      setRunCols(r.data.data.columns || []);
      setRunRows(r.data.data.rows || []);
      setShowResults(true);
      if ((r.data.data.rows || []).length === 0) toast('No rows matched', { icon: 'ℹ️' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to run report');
    } finally { setRunning(false); }
  };

  // Run the SAVED definition (server-side), used by the Run button on a loaded report.
  const runSaved = async () => {
    if (!loadedId) return run();
    setRunning(true);
    try {
      const r = await api.post(`/api/reports/custom/${loadedId}/run`, {});
      setRunCols(r.data.data.columns || []);
      setRunRows(r.data.data.rows || []);
      setShowResults(true);
      if ((r.data.data.rows || []).length === 0) toast('No rows matched', { icon: 'ℹ️' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to run report');
    } finally { setRunning(false); }
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Enter a Search Title'); return; }
    if (!recordType) { toast.error('Pick a record type'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), recordType, columns: selectedKeys, filters: filters.filter(f => f.field && f.op), sort: buildPayloadSort(), visibility, description };
      if (loadedId && isOwner) {
        await api.put(`/api/reports/custom/${loadedId}`, body);
        toast.success('Search saved');
      } else {
        const r = await api.post('/api/reports/custom', body);
        toast.success('Search saved');
        navigate(`/analytics/custom-reports/${r.data.data.id}`, { replace: true });
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const buildModel = (): ReportModel | null => {
    if (!runCols.length) return null;
    return {
      title: name || 'Custom Report',
      subtitle: `${fieldData?.label || recordType} · ${runRows.length} row(s)`,
      columns: runCols.map(c => ({ label: c.label, align: c.type === 'number' ? 'right' as const : 'left' as const })),
      rows: runRows.map(row => ({ cells: runCols.map(c => fmtCell(row[c.key], c.type)) })),
    };
  };

  if (isExisting && loadingExisting) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-blue-500" /></div>;
  }

  const txnTypes = (types || []).filter(t => t.category === 'Transactions');
  const masterTypes = (types || []).filter(t => t.category === 'Master Data');
  const input = 'border border-slate-300 rounded text-sm px-2 py-1.5 bg-white';
  const readOnly = !!loadedId && !isOwner;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ═══ Page header (NetSuite "Saved Transaction Search" style) ═══ */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-5 pt-3">
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-bold text-slate-800">Saved Transaction Search</h1>
            <div className="flex items-center gap-4 text-sm text-blue-600">
              <button onClick={() => navigate('/analytics/custom-reports')} className="hover:underline">List</button>
              <span className="text-slate-300">|</span>
              <span className="text-slate-400">More</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-2">
            {!readOnly && (
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
                {saving && <Loader2 size={13} className="animate-spin" />} Save
              </button>
            )}
            <button onClick={() => navigate('/analytics/custom-reports')} className="px-4 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
            {loadedId && (
              <button onClick={runSaved} disabled={running} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-60">
                {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
              </button>
            )}
            <button onClick={run} disabled={running || !recordType} className="px-4 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 disabled:opacity-60 flex items-center gap-1.5">
              {running && <Loader2 size={13} className="animate-spin" />} Preview
            </button>
            <div className="ml-auto"><ReportExportBar build={buildModel} disabled={!runCols.length} /></div>
          </div>

          {/* Title / ID / type + checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 mt-4 pb-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Search Title <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} disabled={readOnly} className={`${input} w-full max-w-md`} placeholder="Custom Transaction Search" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Record Type <span className="text-red-500">*</span></label>
                <select value={recordType} onChange={e => changeType(e.target.value)} disabled={!!loadedId} className={`${input} w-full max-w-md`}>
                  <option value="">— Select —</option>
                  {txnTypes.length > 0 && <optgroup label="Transactions">{txnTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>}
                  {masterTypes.length > 0 && <optgroup label="Master Data">{masterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Description</label>
                <input value={description} onChange={e => setDescription(e.target.value)} disabled={readOnly} className={`${input} w-full max-w-md`} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={visibility === 'public'} disabled={readOnly}
                  onChange={e => setVisibility(e.target.checked ? 'public' : 'private')} className="w-4 h-4" />
                <span className="font-medium">Public</span>
                <span className="text-xs text-slate-400">(visible to everyone — otherwise private to you)</span>
              </label>
              {/* Visual-only options to match NetSuite layout */}
              {['Available as List View', 'Available for Reminders', 'Show in Menu'].map(l => (
                <label key={l} className="flex items-center gap-2 text-sm text-slate-400">
                  <input type="checkbox" disabled className="w-4 h-4" /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Tab bar ═══ */}
        <div className="bg-erp-subnav flex items-stretch">
          {(['criteria', 'results'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-slate-800' : 'text-white hover:bg-erp-subnav-hover'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-5 py-4 space-y-3">
        {!recordType ? (
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-10 text-center text-slate-400">
            Select a <span className="font-medium text-slate-600">Record Type</span> above to begin.
          </div>
        ) : tab === 'results' ? (
          /* ═══ RESULTS TAB ═══ */
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-slate-600">
              Choose the columns to include in the search results and their sort order.
            </div>

            {/* Sort By */}
            <div className="px-4 py-3 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
              {sort.map((s, i) => (
                <div key={i}>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{i === 0 ? 'Sort By' : 'Then By'}</label>
                  <div className="flex items-center gap-2">
                    <select value={s.field} onChange={e => updateSort(i, { field: e.target.value })} className={`${input} flex-1`}>
                      <option value="">—</option>
                      {selectedKeys.length
                        ? selectedKeys.map(k => <option key={k} value={k}>{catalogByKey[k]?.label || k}</option>)
                        : catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                      <input type="checkbox" checked={s.desc} onChange={e => updateSort(i, { desc: e.target.checked })} /> Desc
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* Columns toolbar */}
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 mr-auto">Columns</span>
              <span className="text-xs text-slate-400">{selectedKeys.length} selected · {loadingFields ? 'loading…' : `${catalog.length} available`}</span>
              <button onClick={removeAllColumns} disabled={!selectedKeys.length} className="px-3 py-1 border border-slate-300 bg-white text-xs text-slate-700 rounded hover:bg-slate-50 disabled:opacity-40">Remove all</button>
            </div>

            {/* Add-column dropdown */}
            <div className="px-4 py-2 border-b border-slate-100">
              <select value="" onChange={e => { if (e.target.value) addColumn(e.target.value); }} className={`${input} w-full max-w-md`}>
                <option value="">+ Add field…</option>
                {catalog.filter(c => !selectedKeys.includes(c.key)).map(c => (
                  <option key={c.key} value={c.key}>{c.label}  ({c.type})</option>
                ))}
              </select>
            </div>

            {/* Selected columns table (FIELD rows, reorderable) */}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left w-10"></th>
                  <th className="px-3 py-2 text-left">Field <span className="text-red-500">*</span></th>
                  <th className="px-3 py-2 text-left w-28">Source</th>
                  <th className="px-3 py-2 text-left w-24">Type</th>
                  <th className="px-3 py-2 text-right w-28">Order</th>
                </tr>
              </thead>
              <tbody>
                {selectedKeys.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 italic">No columns selected — defaults to the first fields when previewed.</td></tr>
                ) : selectedKeys.map((k, i) => {
                  const c = catalogByKey[k];
                  return (
                    <tr key={k} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-1.5 text-slate-300"><GripVertical size={14} /></td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{c?.label || k}</td>
                      <td className="px-3 py-1.5 text-slate-500 capitalize">{c?.source}</td>
                      <td className="px-3 py-1.5 text-slate-500">{c?.type}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => moveColumn(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={15} /></button>
                          <button onClick={() => moveColumn(i, 1)} disabled={i === selectedKeys.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={15} /></button>
                          <button onClick={() => removeColumn(k)} className="text-slate-400 hover:text-red-600"><X size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ═══ CRITERIA TAB ═══ */
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-slate-600 flex items-center justify-between">
              <span>Use filters to narrow which records appear in the results.</span>
              <button onClick={addFilter} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Plus size={13} /> Add Filter</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left w-48">Filter</th>
                  <th className="px-3 py-2 text-left">Value</th>
                  <th className="px-3 py-2 text-right w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filters.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">No filters — all records are returned.</td></tr>
                ) : filters.map((f, i) => {
                  const opDef = OPERATORS.find(o => o.value === f.op);
                  return (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-3 py-1.5">
                        <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })} className={`${input} w-full`}>
                          {catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value })} className={`${input} w-full`}>
                          {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {opDef?.needsValue && <input value={f.value || ''} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="value" className={`${input} w-40`} />}
                          {opDef?.needsTwo && <input value={f.value2 || ''} onChange={e => updateFilter(i, { value2: e.target.value })} placeholder="and" className={`${input} w-40`} />}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeFilter(i)} className="text-slate-400 hover:text-red-600"><X size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ Preview results ═══ */}
        {showResults && (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">Preview · {runRows.length} row(s)</div>
            {runCols.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400">No results.</div>
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
