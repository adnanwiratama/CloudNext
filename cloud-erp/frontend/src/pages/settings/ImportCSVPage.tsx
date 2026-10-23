import { useState, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, CheckCircle, XCircle, Check, ArrowRight, ArrowLeft, Database, Save } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface ImportField { key: string; label: string; required?: boolean; type?: string; line?: boolean; }
interface ImportTypeDef { value: string; label: string; category: string; fields: ImportField[]; lineTable?: string; }

// Supported CSV column delimiters.
type DelimKey = 'comma' | 'semicolon' | 'pipe' | 'space' | 'tab';
const DELIMITERS: { key: DelimKey; label: string; char: string }[] = [
  { key: 'comma', label: 'Comma', char: ',' },
  { key: 'semicolon', label: 'Semicolon', char: ';' },
  { key: 'pipe', label: 'Pipe', char: '|' },
  { key: 'space', label: 'Space', char: ' ' },
  { key: 'tab', label: 'Tab', char: '\t' },
];

// ── Minimal CSV parser that respects quoted fields + the chosen column delimiter. ──
function parseCSV(text: string, delim = ','): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); lines.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); lines.push(row); }
  const nonEmpty = lines.filter(l => l.some(v => v.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map(h => h.trim());
  const rows = nonEmpty.slice(1).map(l => Object.fromEntries(headers.map((h, i) => [h, (l[i] ?? '').trim()])));
  return { headers, rows };
}

const STEPS = ['Scan & Upload CSV File', 'Import Options', 'Field Mapping', 'Start Import'];

export default function ImportCSVPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [recordType, setRecordType] = useState('');
  const [mode, setMode] = useState<'add' | 'update' | 'addupdate'>('add');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [delimiter, setDelimiter] = useState<DelimKey>('comma');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  // Saved-import state: id of the currently-loaded/last-saved config and its name.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: types = [] } = useQuery<ImportTypeDef[]>({
    queryKey: ['import-types'],
    queryFn: () => api.get('/api/settings/import-types').then(r => r.data.data || []),
  });

  const def = useMemo(() => types.find(t => t.value === recordType), [types, recordType]);

  // When opened with ?saved=<id>, load that saved configuration into the wizard.
  useEffect(() => {
    const id = searchParams.get('saved');
    if (!id) return;
    (async () => {
      try {
        const s = await api.get(`/api/settings/saved-imports/${id}`).then(r => r.data.data);
        setSavedId(s.id);
        setSavedName(s.name || '');
        setRecordType(s.record_type);
        setMode(s.mode);
        setDelimiter(s.delimiter || 'comma');
        setMapping(s.mapping || {});
        setHeaders(s.headers || []);
        setRows(s.rows || []);
        setFileName(s.file_name || '');
        setStep(3); // jump to review/start
        toast.success(`Loaded saved import "${s.name}"`);
      } catch {
        toast.error('Failed to load saved import');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, types.length]);

  const delimChar = (k: DelimKey) => DELIMITERS.find(d => d.key === k)!.char;

  // Best-effort auto-detect of the delimiter from the first (header) line.
  const detectDelim = (text: string): DelimKey => {
    const firstLine = text.split(/\r?\n/).find(l => l.trim() !== '') || '';
    let best: DelimKey = 'comma', bestCount = 0;
    for (const d of DELIMITERS) {
      const count = firstLine.split(d.char).length - 1;
      if (count > bestCount) { bestCount = count; best = d.key; }
    }
    return best;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setFileName(f.name); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setRawText(text);
      const d = detectDelim(text);
      setDelimiter(d);
      const { headers, rows } = parseCSV(text, delimChar(d));
      setHeaders(headers); setRows(rows);
    };
    reader.readAsText(f);
  };

  // Re-parse the already-loaded file when the user changes the delimiter.
  const changeDelimiter = (k: DelimKey) => {
    setDelimiter(k);
    if (rawText) {
      const { headers, rows } = parseCSV(rawText, delimChar(k));
      setHeaders(headers); setRows(rows);
      setMapping({});
    }
  };

  // Auto-map: match CSV header to field label/key (case-insensitive, loose).
  const autoMap = () => {
    if (!def) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const m: Record<string, string> = {};
    for (const f of def.fields) {
      const cand = headers.find(h => norm(h) === norm(f.key) || norm(h) === norm(f.label) || norm(f.label).includes(norm(h)) || norm(h).includes(norm(f.key)));
      if (cand) m[f.key] = cand;
    }
    setMapping(m);
  };

  const next = () => {
    if (step === 0) {
      if (!recordType) { toast.error('Select a record type'); return; }
      if (!file || !rows.length) { toast.error('Upload a CSV file'); return; }
    }
    if (step === 1 && step + 1 === 2) autoMap();
    if (step === 2) {
      const miss = (def?.fields || []).filter(f => f.required && !mapping[f.key]).map(f => f.label);
      if (miss.length) { toast.error(`Map required fields: ${miss.join(', ')}`); return; }
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep(s => Math.max(0, s - 1));

  const runImport = async () => {
    if (!def) return;
    setImporting(true); setResult(null);
    try {
      const res = await api.post('/api/settings/import-csv', { type: recordType, mode, mapping, rows });
      setResult(res.data.data);
      const r = res.data.data;
      if (r.errors?.length) toast(`Imported ${r.success}, ${r.errors.length} error(s)`, { icon: '⚠️' });
      else toast.success(`Imported ${r.success} record(s)`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Import failed');
      if (e.response?.data?.data) setResult(e.response.data.data);
    } finally { setImporting(false); }
  };

  const reset = () => {
    setStep(0); setRecordType(''); setMode('add'); setFile(null); setFileName(''); setRawText(''); setDelimiter('comma');
    setHeaders([]); setRows([]); setMapping({}); setResult(null); setSavedId(null);
    if (searchParams.get('saved')) setSearchParams({});
  };

  // Save (or update) the current configuration + CSV data for later reuse.
  const saveImport = async () => {
    if (!def) { toast.error('Select a record type first'); return; }
    if (!rows.length) { toast.error('Upload a CSV file first'); return; }
    const suggested = savedName || `${def.label} import`;
    const name = window.prompt('Name this saved import:', suggested);
    if (!name) return;
    setSaving(true);
    const payload = { name, recordType, mode, delimiter, fileName, mapping, headers, rows };
    try {
      if (savedId) {
        await api.put(`/api/settings/saved-imports/${savedId}`, payload);
        toast.success('Saved import updated');
      } else {
        const res = await api.post('/api/settings/saved-imports', payload);
        setSavedId(res.data.data.id);
        toast.success('Import saved for reuse');
      }
      setSavedName(name);
      qc.invalidateQueries({ queryKey: ['saved-imports'] });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save import');
    } finally { setSaving(false); }
  };

  const grouped = useMemo(() => {
    const g: Record<string, ImportTypeDef[]> = {};
    for (const t of types) (g[t.category] ||= []).push(t);
    return g;
  }, [types]);

  const sel = 'border border-slate-300 rounded text-sm px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Database size={15} /></div>
          <h1 className="text-xl font-semibold text-slate-800">Import Assistant</h1>
          <span className="text-sm text-slate-500">Upload records & transactions from CSV</span>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto flex gap-4">
        {/* Steps sidebar */}
        <div className="w-60 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded shadow-sm p-2">
            <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">Steps</div>
            {STEPS.map((s, i) => (
              <div key={s} className={`flex items-center gap-2 px-2 py-2 rounded text-sm ${i === step ? 'bg-blue-50 text-blue-700 font-medium' : i < step ? 'text-emerald-700' : 'text-slate-500'}`}>
                {i < step ? <Check size={14} className="text-emerald-600" /> : <span className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs ${i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>}
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm">
          <div className="p-5 min-h-[360px]">
            {/* STEP 1 */}
            {step === 0 && (
              <div className="space-y-5 max-w-md">
                <h2 className="text-lg font-semibold text-slate-800">Scan & Upload CSV File</h2>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Record Type</label>
                  <select className={`${sel} w-full`} value={recordType} onChange={e => { setRecordType(e.target.value); setMapping({}); }}>
                    <option value="">-- Select record / transaction --</option>
                    {Object.entries(grouped).map(([cat, list]) => (
                      <optgroup key={cat} label={cat}>
                        {list.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Choose the record type of data to import.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">CSV Column Delimiter</label>
                  <select className={`${sel} w-full`} value={delimiter} onChange={e => changeDelimiter(e.target.value as DelimKey)}>
                    {DELIMITERS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Select the character that separates columns in your CSV file.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">CSV File</label>
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                    <Upload size={22} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm font-medium text-slate-600">{file ? file.name : 'Click to upload one CSV file'}</p>
                    <p className="text-xs text-slate-400 mt-1">{rows.length > 0 ? `${headers.length} columns · ${rows.length} rows detected` : 'CSV format, UTF-8 encoding'}</p>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Import Options</h2>
                <div className="text-sm font-semibold text-slate-700">Data Handling</div>
                {([
                  { v: 'add', label: 'ADD', desc: 'Add new records only' },
                  { v: 'update', label: 'UPDATE', desc: 'Update existing records only (matched by key)' },
                  { v: 'addupdate', label: 'ADD OR UPDATE', desc: 'Add new and update existing records' },
                ] as const).map(o => (
                  <label key={o.v} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="mode" checked={mode === o.v} onChange={() => setMode(o.v)} className="mt-1 accent-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{o.label}</div>
                      <div className="text-xs text-slate-500">{o.desc}</div>
                    </div>
                  </label>
                ))}
                {def && (mode !== 'add') && (
                  <p className="text-xs text-slate-400 pt-2">Existing records are matched by <span className="font-mono">{def.fields.find(f => f.required && !f.line)?.label || 'the key field'}</span>.</p>
                )}
              </div>
            )}

            {/* STEP 3 — Field Mapping */}
            {step === 2 && def && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-slate-800">Field Mapping</h2>
                  <button onClick={autoMap} className="text-xs text-blue-600 hover:underline">Auto-map by name</button>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center">
                  <div className="text-xs font-semibold text-slate-500 uppercase">{def.label} Field</div>
                  <div />
                  <div className="text-xs font-semibold text-slate-500 uppercase">Your CSV Column</div>
                  {def.fields.map(f => (
                    <div key={f.key} className="contents">
                      <div className={`text-sm ${f.line ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
                        {f.line && <span className="text-2xs text-slate-400 mr-1">line</span>}
                        {f.label}{f.required && <span className="text-red-500"> *</span>}
                      </div>
                      <ArrowRight size={13} className="text-slate-300" />
                      <select className={`${sel} w-full`} value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                        <option value="">— Not mapped —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 4 — Start Import */}
            {step === 3 && def && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Save Mapping & Start Import</h2>
                <div className="grid grid-cols-2 gap-3 max-w-lg text-sm">
                  <div className="bg-slate-50 border border-slate-200 rounded p-3"><div className="text-xs text-slate-500">Record Type</div><div className="font-medium">{def.label}</div></div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3"><div className="text-xs text-slate-500">Mode</div><div className="font-medium uppercase">{mode}</div></div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3"><div className="text-xs text-slate-500">File</div><div className="font-medium truncate">{file?.name || fileName || '—'}</div></div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3"><div className="text-xs text-slate-500">Rows</div><div className="font-medium">{rows.length}</div></div>
                </div>
                <div className="text-xs text-slate-500">Mapped fields: {Object.keys(mapping).filter(k => mapping[k]).length} / {def.fields.length}</div>
                {savedId && <div className="text-xs text-emerald-600">Loaded from saved import{savedName ? `: "${savedName}"` : ''}. Changes can be re-saved below.</div>}
                <div className="flex items-center gap-2">
                  <button onClick={runImport} disabled={importing}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Start Import
                  </button>
                  <button onClick={saveImport} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white text-slate-700 text-sm font-medium rounded hover:bg-slate-50 disabled:opacity-60">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {savedId ? 'Update Saved Import' : 'Save for Reuse'}
                  </button>
                </div>

                {result && (
                  <div className={`border rounded p-4 mt-2 ${result.errors.length === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">{result.success} record(s) imported</span>
                    </div>
                    {result.errors.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-1"><XCircle size={16} className="text-red-500" /><span className="text-sm font-medium text-red-700">{result.errors.length} error(s):</span></div>
                        <ul className="list-disc list-inside space-y-0.5 max-h-48 overflow-auto">
                          {result.errors.slice(0, 50).map((err, i) => <li key={i} className="text-xs text-red-600">{err}</li>)}
                        </ul>
                      </div>
                    )}
                    <button onClick={reset} className="mt-3 text-xs text-blue-600 hover:underline">Start another import</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
            <button onClick={reset} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
            {step > 0 && <button onClick={back} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><ArrowLeft size={13} /> Back</button>}
            {step < STEPS.length - 1 && <button onClick={next} className="flex items-center gap-1 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Next <ArrowRight size={13} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}
