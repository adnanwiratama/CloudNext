import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Loader2, Download, Printer, FileText } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { usePermissions } from '../../hooks/usePermissions';

// Normal balance: asset/expense carry debit-positive, liability/equity/income carry credit-positive.
function getDisplayBalance(acct: any): number {
  const net = parseFloat(acct.net_balance || 0);
  const normalDebit = ['asset', 'cost_of_goods', 'cogs', 'expense', 'other_expense'].includes(acct.type);
  return normalDebit ? net : -net;
}

export default function AccountList() {
  const navigate = useNavigate();
  const { canView, canCreate, canEdit } = usePermissions();
  const allowView = canView('chart_of_accounts');
  const allowNew = canCreate('chart_of_accounts');
  const allowEdit = canEdit('chart_of_accounts');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [fType, setFType] = useState('');
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<{ value: string; label: string; category: string }[]>([]);

  useEffect(() => { fetchTypes(); }, []);
  useEffect(() => { fetchRows(); }, [showInactive]);

  const fetchTypes = async () => {
    try { const r = await api.get('/api/accounting/account-types'); setTypes(r.data.data || []); } catch { /* ignore */ }
  };

  const fetchRows = async () => {
    try {
      setError(''); setLoading(true);
      const r = await api.get('/api/accounting/accounts', { params: { showInactive: showInactive ? 1 : 0 } });
      setRows(r.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load accounts');
    } finally { setLoading(false); }
  };

  // An account is a "parent" if any other account references it as parent, or it is a summary account.
  const parentIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.parent_id) s.add(r.parent_id);
    return s;
  }, [rows]);
  const isParent = (r: any) => r.is_summary || parentIds.has(r.id);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (fType) data = data.filter(r => r.account_type === fType);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r => String(r.name || '').toLowerCase().includes(q) || String(r.code || '').toLowerCase().includes(q) || String(r.description || '').toLowerCase().includes(q));
    }
    return data;
  }, [rows, fType, search]);

  if (!allowView) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded shadow-sm p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4"><FileText className="text-red-400" size={24}/></div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Akses Ditolak</h2>
          <p className="text-sm text-slate-500">Anda tidak memiliki izin untuk melihat Chart of Accounts.</p>
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
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">A/C</div>
            <h1 className="text-xl font-semibold text-slate-800">Account</h1>
          </div>
          <div className="flex items-center gap-5 text-sm text-blue-600">
            <span className="hover:underline cursor-pointer">List</span>
            <span className="hover:underline cursor-pointer">Search</span>
            <span className="hover:underline cursor-pointer">Customize</span>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-3">
          <span className="text-sm text-slate-600">View</span>
          <select value={fType} onChange={e => setFType(e.target.value)}
            className="border border-slate-300 rounded text-sm px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400">
            <option value="">Basic</option>
            {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="text-slate-300">|</span>
          {allowNew && (
            <button onClick={() => navigate('/accounting/accounts/new')}
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 transition-colors">
              New
            </button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button title="Export CSV" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"><Download size={16} /></button>
            <button title="Print" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"><Printer size={16} /></button>
            <label className="flex items-center gap-1.5 ml-3 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              SHOW INACTIVES
            </label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter accounts…"
              className="ml-3 border border-slate-300 rounded text-sm px-2 py-1 w-56 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="text-sm text-slate-600">TOTAL: {filtered.length}</div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-24">EDIT | VIEW</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-20">SUMMARY</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-28">NUMBER</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">ACCOUNT</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-44">TYPE</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">DESCRIPTION</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 w-40">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <FileText className="mx-auto mb-3 text-slate-300" size={40} />
                      <p className="text-sm text-slate-500">No accounts found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(row => {
                    const bal = getDisplayBalance(row);
                    const parent = isParent(row);
                    const child = !!row.parent_id;
                    return (
                      <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${!row.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {allowEdit && <><Link to={`/accounting/accounts/${row.id}/edit`} className="text-blue-600 hover:underline">Edit</Link><span className="text-slate-400 mx-1">|</span></>}
                          <Link to={`/accounting/accounts/${row.id}/view`} className="text-blue-600 hover:underline">View</Link>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.is_summary ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 font-mono text-slate-800">{row.code}</td>
                        <td className="px-3 py-2">
                          <Link to={`/accounting/accounts/${row.id}/view`}
                            className={`hover:underline ${parent ? 'font-bold text-blue-800' : 'text-blue-600'}`}
                            style={child ? { paddingLeft: '2rem' } : undefined}>
                            {row.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.account_type_label || row.type}</td>
                        <td className="px-3 py-2 text-slate-600">{row.description || '-'}</td>
                        <td className="px-3 py-2 text-right">
                          {bal === 0
                            ? <span className="text-slate-300">—</span>
                            : <span className={`${bal < 0 ? 'text-red-600' : 'text-slate-800'} ${parent ? 'font-bold' : ''}`}>{bal < 0 ? '(' : ''}{formatCurrency(Math.abs(bal))}{bal < 0 ? ')' : ''}</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
