import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

const IMPORT_TYPES = [
  { value: 'customers', label: 'Customers', description: 'Import customer master data' },
  { value: 'vendors', label: 'Vendors', description: 'Import vendor master data' },
  { value: 'items', label: 'Items', description: 'Import item / product master data' },
  { value: 'accounts', label: 'Chart of Accounts', description: 'Import account master data' },
  { value: 'inventory', label: 'Inventory Opening Balance', description: 'Import opening stock quantities' },
  { value: 'journal_entries', label: 'Journal Entries', description: 'Import manual journal entries' },
];

export default function ImportCSVPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length === 0) return;
      const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
      setHeaders(hdrs);
      const rows = lines.slice(1, 6).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"/, '').replace(/"$/, ''));
        return Object.fromEntries(hdrs.map((h, i) => [h, vals[i] || '']));
      });
      setPreview(rows);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file || !importType) { toast.error('Select import type and file'); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', importType);
      const res = await api.post('/api/settings/import-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data.data);
      toast.success(`Import complete: ${res.data.data.success} records imported`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Setup', path: '/settings' }, { label: 'Import CSV' }]}
        title="Import CSV Record"
        subtitle="Import master data and transactions from CSV files"
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Step 1 — Select Import Type</div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {IMPORT_TYPES.map(t => (
            <button key={t.value} onClick={() => setImportType(t.value)}
              className={`text-left p-3 border rounded transition-colors ${importType === t.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
              <FileText size={16} className={importType === t.value ? 'text-blue-600' : 'text-slate-400'} />
              <div className="text-sm font-medium mt-1.5">{t.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {importType && (
        <div className="erp-card mb-4">
          <div className="form-section-title">Step 2 — Upload CSV File</div>
          <div className="p-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <Upload size={24} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-600">{file ? file.name : 'Click to upload CSV file'}</p>
              <p className="text-xs text-slate-400 mt-1">CSV format, UTF-8 encoding</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="erp-card mb-4">
          <div className="form-section-title">Step 3 — Preview (first 5 rows)</div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{headers.map(h => <td key={h} className="text-xs">{row[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t flex items-center gap-3">
            <button className="btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Upload size={14} /> Import {file?.name}</>}
            </button>
            <span className="text-xs text-slate-400">All records will be validated before import</span>
          </div>
        </div>
      )}

      {result && (
        <div className={`erp-card ${result.errors.length === 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">{result.success} records imported successfully</span>
            </div>
            {result.errors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle size={16} className="text-red-500" />
                  <span className="text-sm font-medium text-red-700">{result.errors.length} errors:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {result.errors.map((err, i) => <li key={i} className="text-xs text-red-600">{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
