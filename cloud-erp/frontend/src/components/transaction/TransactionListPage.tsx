import { useState, useEffect, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Loader2, ChevronLeft, ChevronRight, Download, Printer, FileText } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

export interface ListColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render?: (row: any) => ReactNode;
}

interface Props {
  title: string;
  iconBg?: string;                // tailwind bg class, default teal
  iconText?: string;              // text/emoji in icon box
  endpoint: string;               // GET list endpoint
  newPath: string;                // route to create form
  detailPath: (row: any) => string;   // route to detail
  editPath?: (row: any) => string;    // route to edit (optional)
  columns: ListColumn[];
  numberField: string;            // field holding the doc number (for filter + sort)
  dateField: string;              // field holding the date (for filter + sort)
  memoField?: string;             // field holding memo/party (for text filter)
  statusOptions?: string[];       // status filter options
  extraFilter?: {                 // optional extra dropdown filter (e.g. Type)
    label: string;
    field: string;                // row field to match against
    options: { value: string; label: string }[]; // value '' = all
  };
  permissionKey?: string;         // role-matrix key for gating New/Edit (e.g. 'purchase_order')
}

export default function TransactionListPage(props: Props) {
  const {
    title, iconBg = 'bg-teal-600', iconText = '✓',
    endpoint, newPath, detailPath, editPath, columns,
    numberField, dateField, memoField, statusOptions = ['- All -'], extraFilter, permissionKey,
  } = props;

  const navigate = useNavigate();
  const { canView, canCreate, canEdit } = usePermissions();
  const allowView = !permissionKey || canView(permissionKey);
  const allowNew = !permissionKey || canCreate(permissionKey);
  const allowEdit = !permissionKey || canEdit(permissionKey);
  const [rows, setRows] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const [fDocNum, setFDocNum] = useState('');
  const [fMemo, setFMemo] = useState('');
  const [fStatus, setFStatus] = useState('- All -');
  const [fExtra, setFExtra] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [sortBy, setSortBy] = useState('Recently Created');

  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  useEffect(() => { fetchRows(); }, [endpoint]);

  useEffect(() => {
    let data = [...rows];
    if (fDocNum) data = data.filter(r => String(r[numberField] || '').toLowerCase().includes(fDocNum.toLowerCase()));
    if (fMemo && memoField) data = data.filter(r => String(r[memoField] || '').toLowerCase().includes(fMemo.toLowerCase()));
    if (fStatus && fStatus !== '- All -') data = data.filter(r => r.status === fStatus);
    if (extraFilter && fExtra) data = data.filter(r => String(r[extraFilter.field] ?? '') === fExtra);
    if (fDateFrom) data = data.filter(r => new Date(r[dateField]) >= new Date(fDateFrom));
    if (fDateTo) data = data.filter(r => new Date(r[dateField]) <= new Date(fDateTo));

    if (sortBy === 'Date') data.sort((a, b) => new Date(b[dateField]).getTime() - new Date(a[dateField]).getTime());
    else if (sortBy === 'Document #') data.sort((a, b) => String(a[numberField] || '').localeCompare(String(b[numberField] || '')));
    else data.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    setFiltered(data);
    setPage(1);
  }, [rows, fDocNum, fMemo, fStatus, fExtra, fDateFrom, fDateTo, sortBy]);

  const fetchRows = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await api.get(endpoint);
      setRows(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => { setFDocNum(''); setFMemo(''); setFStatus('- All -'); setFExtra(''); setFDateFrom(''); setFDateTo(''); };

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (!allowView) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded shadow-sm p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <FileText className="text-red-400" size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Akses Ditolak</h2>
          <p className="text-sm text-slate-500">Anda tidak memiliki izin untuk melihat {title}.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded ${iconBg} flex items-center justify-center text-white font-bold text-sm`}>{iconText}</div>
            <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          </div>
          <div className="flex items-center gap-5 text-sm text-blue-600">
            <span className="hover:underline cursor-pointer">List</span>
            <span className="hover:underline cursor-pointer">Search</span>
            <span className="hover:underline cursor-pointer">Audit Trail</span>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          {allowNew && (
            <button onClick={() => navigate(newPath)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 transition-colors">
              New Transaction
            </button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setShowFilters(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
            <FileText size={14} className="text-slate-500" />
            Filters
            <span className="ml-auto text-xs text-blue-600 font-normal hover:underline" onClick={e => { e.stopPropagation(); clearFilters(); }}>Clear</span>
          </button>
          {showFilters && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-5 gap-x-6 gap-y-3 mt-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Document Number/ID</label>
                  <input type="text" value={fDocNum} onChange={e => setFDocNum(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                </div>
                {memoField && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Search</label>
                    <input type="text" value={fMemo} onChange={e => setFMemo(e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                  </div>
                )}
                {statusOptions.length > 1 && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Status</label>
                    <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      {statusOptions.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {extraFilter && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{extraFilter.label}</label>
                    <select value={fExtra} onChange={e => setFExtra(e.target.value)}
                      className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                      {extraFilter.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">From</label>
                  <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">To</label>
                  <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button title="Export CSV" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"><Download size={16} /></button>
            <button title="Print" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"><Printer size={16} /></button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">Quick Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="border border-slate-300 rounded text-sm px-2 py-1 focus:outline-none focus:border-blue-400 bg-white">
              {['Recently Created', 'Date', 'Document #'].map(s => <option key={s}>{s}</option>)}
            </select>
            <span className="text-slate-500 text-xs">|</span>
            <span className="text-slate-600 text-xs">Total: {filtered.length.toLocaleString()}</span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="text-xs text-slate-600">{page}/{Math.max(1, totalPages)}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-24">Edit | View</th>
                  {columns.map(c => (
                    <th key={c.key} className={`px-3 py-2.5 text-xs font-semibold text-slate-600 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`} style={c.width ? { width: c.width } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                      <FileText className="mx-auto mb-3 text-slate-300" size={40} />
                      <p className="text-sm text-slate-500 mb-2">No records found</p>
                      {allowNew && <button onClick={() => navigate(newPath)} className="text-blue-600 hover:underline text-sm">Create your first record</button>}
                    </td>
                  </tr>
                ) : (
                  paginated.map(row => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {allowEdit && <><Link to={editPath ? editPath(row) : detailPath(row)} className="text-blue-600 hover:underline">Edit</Link><span className="text-slate-400 mx-1">|</span></>}
                        <Link to={detailPath(row)} className="text-blue-600 hover:underline">View</Link>
                      </td>
                      {columns.map(c => (
                        <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} text-slate-700`}>
                          {c.render ? c.render(row) : (row[c.key] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-500 text-xs">Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">«</button>
                <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">‹</button>
                <span className="px-3 py-1 text-xs">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
