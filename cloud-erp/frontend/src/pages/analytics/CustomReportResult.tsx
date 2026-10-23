import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel } from '../../utils/reportExport';

interface RunCol { key: string; column: string; source: 'header' | 'line'; label: string; type: 'string' | 'number' | 'boolean' | 'date'; }

const fmtCell = (v: any, type: string) => {
  if (v == null || v === '') return '';
  if (type === 'number') { const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString('id-ID', { maximumFractionDigits: 4 }); }
  if (type === 'date') { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  if (type === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

// Separate results page. Opened by the builder's Preview (ad-hoc config stashed in
// sessionStorage) or by Run on a saved report (route /:id/result).
export default function CustomReportResult() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cols, setCols] = useState<RunCol[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('Custom Report');
  const [subtitle, setSubtitle] = useState('');
  const [backTo, setBackTo] = useState('/analytics/custom-reports');

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        if (id) {
          // Saved report run.
          const r = await api.post(`/api/reports/custom/${id}/run`, {});
          const d = r.data.data;
          setCols(d.columns || []); setRows(d.rows || []);
          setTitle(d.name || 'Custom Report');
          setSubtitle(`${(d.recordType || '').replace(/_/g, ' ')} · ${(d.rows || []).length} row(s)`);
          setBackTo(`/analytics/custom-reports/${id}`);
        } else {
          // Ad-hoc preview: read the config the builder stashed.
          const raw = sessionStorage.getItem('customReportPreview');
          if (!raw) { setError('No report configuration found. Go back and run again.'); setLoading(false); return; }
          const cfg = JSON.parse(raw);
          setTitle(cfg.name || 'Custom Report (Preview)');
          const r = await api.post('/api/reports/custom/run', { type: cfg.type, columns: cfg.columns, filters: cfg.filters, sort: cfg.sort });
          const d = r.data.data;
          setCols(d.columns || []); setRows(d.rows || []);
          setSubtitle(`${(cfg.typeLabel || cfg.type || '').replace(/_/g, ' ')} · ${(d.rows || []).length} row(s)`);
          setBackTo(cfg.backTo || '/analytics/custom-reports/new');
        }
      } catch (e: any) {
        setError(e.response?.data?.error || 'Failed to run report');
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const buildModel = useMemo((): (() => ReportModel | null) => () => {
    if (!cols.length) return null;
    return {
      title,
      subtitle,
      columns: cols.map(c => ({ label: c.label, align: c.type === 'number' ? 'right' as const : 'left' as const })),
      rows: rows.map(row => ({ cells: cols.map(c => fmtCell(row[c.key], c.type)) })),
    };
  }, [cols, rows, title, subtitle]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(backTo)} className="text-slate-500 hover:text-slate-700 flex-shrink-0"><ArrowLeft size={18} /></button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-800 truncate">{title}</h1>
              {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
            </div>
          </div>
          <ReportExportBar build={buildModel} disabled={!cols.length} />
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-blue-500" /></div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded shadow-sm px-4 py-8 text-center text-red-600">{error}</div>
        ) : cols.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-10 text-center text-slate-400">No results.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">{rows.length} row(s)</div>
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {cols.map(c => <th key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/40">
                    {cols.map(c => <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'} text-slate-700`}>{fmtCell(row[c.key], c.type)}</td>)}
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
