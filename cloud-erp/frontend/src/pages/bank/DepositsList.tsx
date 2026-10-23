import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Loader2, ChevronLeft, ChevronRight, Download, Printer, FileText } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

interface Deposit {
  id: string;
  deposit_number: string;
  deposit_date: string;
  created_at: string;
  bank_account_name?: string;
  reference?: string;
  total_amount: number;
  status: string;
  memo?: string;
}

const STATUS_OPTIONS = ['- All -', 'posted', 'cleared', 'voided'];
const SORT_OPTIONS   = ['Recently Created', 'Date', 'Amount', 'Deposit #'];

export default function DepositsList() {
  const navigate = useNavigate();
  const { canView, canCreate } = usePermissions();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filtered, setFiltered] = useState<Deposit[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const [fDocNum,   setFDocNum]   = useState('');
  const [fMemo,     setFMemo]     = useState('');
  const [fStatus,   setFStatus]   = useState('- All -');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo,   setFDateTo]   = useState('');
  const [sortBy,    setSortBy]    = useState('Recently Created');

  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  useEffect(() => { fetchDeposits(); }, []);

  useEffect(() => {
    let data = [...deposits];

    if (fDocNum)   data = data.filter(d => d.deposit_number?.toLowerCase().includes(fDocNum.toLowerCase()));
    if (fMemo)     data = data.filter(d => d.memo?.toLowerCase().includes(fMemo.toLowerCase()) || d.reference?.toLowerCase().includes(fMemo.toLowerCase()));
    if (fStatus && fStatus !== '- All -') data = data.filter(d => d.status === fStatus);
    if (fDateFrom) data = data.filter(d => new Date(d.deposit_date) >= new Date(fDateFrom));
    if (fDateTo)   data = data.filter(d => new Date(d.deposit_date) <= new Date(fDateTo));

    if (sortBy === 'Date')             data.sort((a,b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime());
    else if (sortBy === 'Amount')      data.sort((a,b) => Number(b.total_amount) - Number(a.total_amount));
    else if (sortBy === 'Deposit #')   data.sort((a,b) => (a.deposit_number||'').localeCompare(b.deposit_number||''));
    else /* Recently Created */        data.sort((a,b) => new Date(b.created_at||0).getTime() - new Date(a.created_at||0).getTime());

    setFiltered(data);
    setPage(1);
  }, [deposits, fDocNum, fMemo, fStatus, fDateFrom, fDateTo, sortBy]);

  const fetchDeposits = async () => {
    try {
      setError('');
      const res = await api.get('/api/bank/deposits');
      setDeposits(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFDocNum(''); setFMemo(''); setFStatus('- All -');
    setFDateFrom(''); setFDateTo('');
  };

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  if (!canView('deposit')) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded shadow-sm p-8 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4"><FileText className="text-red-400" size={24}/></div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Akses Ditolak</h2>
        <p className="text-sm text-slate-500">Anda tidak memiliki izin untuk melihat Make Deposits.</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-500" size={32}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-sm">$</div>
            <h1 className="text-xl font-semibold text-slate-800">Make Deposits</h1>
          </div>
          <div className="flex items-center gap-5 text-sm text-blue-600">
            <span className="hover:underline cursor-pointer">List</span>
            <span className="hover:underline cursor-pointer">Search</span>
            <span className="hover:underline cursor-pointer">Audit Trail</span>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          {canCreate('deposit') && (
          <button onClick={() => navigate('/bank/make-deposit')}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 transition-colors">
            New Transaction
          </button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        {/* ── Filters ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setShowFilters(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
            <FileText size={14} className="text-slate-500"/>
            Filters
            <span className="ml-auto text-xs text-blue-600 font-normal hover:underline" onClick={e => { e.stopPropagation(); clearFilters(); }}>
              Clear
            </span>
          </button>

          {showFilters && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-5 gap-x-6 gap-y-3 mt-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type</label>
                  <select disabled className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700">
                    <option>Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Document Number/ID</label>
                  <input type="text" value={fDocNum} onChange={e => setFDocNum(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Memo / Reference</label>
                  <input type="text" value={fMemo} onChange={e => setFMemo(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                    className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date</label>
                  <select className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white">
                    <option>All</option>
                    <option>Today</option>
                    <option>This Week</option>
                    <option>This Month</option>
                    <option>Custom</option>
                  </select>
                </div>
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

        {/* ── Toolbar ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button title="Export CSV" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded">
              <Download size={16}/>
            </button>
            <button title="Print" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded">
              <Printer size={16}/>
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">Quick Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="border border-slate-300 rounded text-sm px-2 py-1 focus:outline-none focus:border-blue-400 bg-white">
              {SORT_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <span className="text-slate-500 text-xs">|</span>
            <span className="text-slate-600 text-xs">Total: {filtered.length.toLocaleString()}</span>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
              className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-30">
              <ChevronLeft size={16}/>
            </button>
            <span className="text-xs text-slate-600">{page}/{Math.max(1,totalPages)}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
              className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-30">
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-24">Edit | View</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Document Number</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Bank Account</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Reference</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Amount</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Memo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <FileText className="mx-auto mb-3 text-slate-300" size={40}/>
                      <p className="text-sm text-slate-500 mb-2">No deposits found</p>
                      <button onClick={() => navigate('/bank/make-deposit')}
                        className="text-blue-600 hover:underline text-sm">
                        Create your first deposit
                      </button>
                    </td>
                  </tr>
                ) : (
                  paginated.map(d => (
                    <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <Link to={`/bank/deposits/${d.id}/edit`} className="text-blue-600 hover:underline">Edit</Link>
                        <span className="text-slate-400 mx-1">|</span>
                        <Link to={`/bank/deposits/${d.id}`} className="text-blue-600 hover:underline">View</Link>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        <Link to={`/bank/deposits/${d.id}`} className="hover:text-blue-600 hover:underline">
                          {d.deposit_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {new Date(d.deposit_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{d.bank_account_name || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{d.reference || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                        {Number(d.total_amount).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{d.memo || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full
                          ${d.status === 'cleared' ? 'bg-green-100 text-green-700' : ''}
                          ${d.status === 'posted'  ? 'bg-blue-100 text-blue-700' : ''}
                          ${d.status === 'voided'  ? 'bg-red-100 text-red-700' : ''}
                          ${!['cleared','posted','voided'].includes(d.status) ? 'bg-slate-100 text-slate-600' : ''}`}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-500 text-xs">
                Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page <= 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">«</button>
                <button onClick={() => setPage(p => p-1)} disabled={page <= 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">‹</button>
                <span className="px-3 py-1 text-xs">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => p+1)} disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-slate-50">»</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
