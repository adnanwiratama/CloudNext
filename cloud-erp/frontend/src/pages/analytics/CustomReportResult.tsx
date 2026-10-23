import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, FileText } from 'lucide-react';
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

// Results page — matches the standard transaction-list layout (sticky header,
// max-w-screen-xl container, toolbar with total, and the standard table styling
// using w-full text-sm so columns size to the container like list pages).
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
          const r = await api.post(`/api/reports/custom/${id}/run`, {});
          const d = r.data.data;
          setCols(d.columns || []); setRows(d.rows || []);
          setTitle(d.name || 'Custom Report');
          setSubtitle((d.recordType || '').replace(/_/g, ' '));
          setBackTo(`/analytics/custom-reports/${id}`);
        } else {
          const raw = sessionStorage.getItem('customReportPreview');
          if (!raw) { setError('No report configuration found. Go back and run again.'); setLoading(false); return; }
          const cfg = JSON.parse(raw);
          setTitle(cfg.name || 'Custom Report (Preview)');
          const r = await api.post('/api/reports/custom/run', { type: cfg.type, columns: cfg.columns, filters: cfg.filters, sort: cfg.sort });
          const d = r.data.data;
          setCols(d.columns || []); setRows(d.rows || []);
          setSubtitle((cfg.typeLabel || cfg.type || '').replace(/_/g, ' '));
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
      subtitle: `${subtitle} · ${rows.length} row(s)`,
      columns: cols.map(c => ({ label: c.label, align: c.type === 'number' ? 'right' as const : 'left' as const })),
      rows: rows.map(row => ({ cells: cols.map(c => fmtCell(row[c.key], c.type)) })),
    };
  }, [cols, rows, title, subtitle]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Standard sticky header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(backTo)} className="text-slate-500 hover:text-slate-700 flex-shrink-0"><ArrowLeft size={18} /></button>
            <div className="w-8 h-8 rounded bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">CR</div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-800 truncate">{title}</h1>
              {subtitle && <div className="text-xs text-slate-500 capitalize">{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-5 text-sm text-blue-600">
            <span onClick={() => navigate('/analytics/custom-reports')} className="hover:underline cursor-pointer">List</span>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {/* Toolbar (export + total) — same shape as list-page toolbar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2 flex items-center justify-between">
          <ReportExportBar build={buildModel} disabled={!cols.length} />
          <span className="text-slate-600 text-xs">Total: {rows.length.toLocaleString('id-ID')}</span>
        </div>

        {/* Table — standard list styling */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {cols.map(c => (
                    <th key={c.key} className={`px-3 py-2.5 text-xs font-semibold text-slate-600 ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={Math.max(cols.length, 1)} className="px-4 py-16 text-center"><Loader2 size={26} className="animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : error ? (
                  <tr><td colSpan={Math.max(cols.length, 1)} className="px-4 py-12 text-center text-red-600">{error}</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={Math.max(cols.length, 1)} className="px-4 py-16 text-center">
                    <FileText className="mx-auto mb-3 text-slate-300" size={40} />
                    <p className="text-sm text-slate-500">No records found</p>
                  </td></tr>
                ) : rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    {cols.map(c => (
                      <td key={c.key} className={`px-3 py-2 ${c.type === 'number' ? 'text-right' : 'text-left'} text-slate-700`}>{fmtCell(row[c.key], c.type) || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
