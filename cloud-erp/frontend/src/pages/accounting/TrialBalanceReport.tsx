import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel, ReportRow } from '../../utils/reportExport';

interface TBLine { id: string; code: string; name: string; type?: string; parent_id: string | null; net_balance: string | number; by?: Record<string, number>; }
interface Acct { id: string; code: string; name: string; parent_id: string | null; }
interface Col { id: string; label: string; }
interface TreeNode { id: string; code: string; name: string; net: number; by: Record<string, number>; children: TreeNode[]; isLeaf: boolean; }
interface Row { key: string; label: string; code?: string; net: number; by: Record<string, number>; depth: number; kind: 'parent' | 'leaf' | 'total'; }

const amt = (v: number) => `Rp${Math.abs(Number(v || 0)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amtSigned = (v: number) => `Rp${Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Total' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'period', label: 'Period' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export default function TrialBalanceReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [column, setColumn] = useState('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trial-balance', dateFrom, dateTo, column],
    queryFn: () => api.get('/api/accounting/reports/trial-balance', { params: { dateFrom, dateTo, column } }).then(r => r.data.data),
  });

  const toggle = (id: string) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/account-ledger/${accountId}?dateFrom=${dateFrom}&dateTo=${dateTo}`);

  const columns: Col[] = useMemo(() => (data?.columns?.length ? data.columns : [{ id: 'total', label: 'Total' }]), [data]);
  const multi = column !== 'none';

  const addBy = (acc: Record<string, number>, b: Record<string, number> | undefined | null) => {
    if (!b) return acc;
    for (const k of Object.keys(b)) acc[k] = (acc[k] || 0) + b[k];
    return acc;
  };

  // Build account hierarchy; each node carries a net balance (Dr-Cr) + per-column `by` map.
  const built = useMemo(() => {
    if (!data) return null;
    const chart: Acct[] = data.chart || [];
    const lines: TBLine[] = data.lines || [];
    const chartById: Record<string, Acct> = {};
    for (const a of chart) chartById[a.id] = a;

    const nodes: Record<string, TreeNode> = {};
    const ensure = (a: Acct, isLeaf: boolean): TreeNode => {
      if (!nodes[a.id]) nodes[a.id] = { id: a.id, code: a.code, name: a.name, net: 0, by: {}, children: [], isLeaf };
      else if (isLeaf) nodes[a.id].isLeaf = true;
      return nodes[a.id];
    };
    const roots: TreeNode[] = [];
    for (const l of lines) {
      const leaf = ensure(l, true);
      leaf.net = Number(l.net_balance || 0);
      leaf.by = { ...(l.by || {}) };
      let cur = chartById[l.id];
      let child = leaf;
      const seen = new Set<string>([l.id]);
      while (cur && cur.parent_id && chartById[cur.parent_id] && !seen.has(cur.parent_id)) {
        const pa = chartById[cur.parent_id];
        const pn = ensure(pa, false);
        if (!pn.children.includes(child)) pn.children.push(child);
        seen.add(pa.id); child = pn; cur = pa;
      }
      if (!roots.includes(child)) roots.push(child);
    }
    const sum = (n: TreeNode): TreeNode => {
      if (n.children.length === 0) return n;
      const acc: Record<string, number> = {};
      let net = 0;
      for (const c of n.children) { const sc = sum(c); addBy(acc, sc.by); net += sc.net; }
      n.by = acc; n.net = net;
      return n;
    };
    for (const r of roots) sum(r);
    roots.sort((a, b) => a.code.localeCompare(b.code));

    const rows: Row[] = [];
    const emit = (n: TreeNode, depth: number) => {
      if (n.children.length === 0) {
        rows.push({ key: n.id, label: n.name, code: n.code, net: n.net, by: n.by, depth, kind: 'leaf' });
        return;
      }
      rows.push({ key: n.id, label: `${n.code} - ${n.name}`, net: n.net, by: n.by, depth, kind: 'parent' });
      if (!collapsed.has(n.id)) {
        n.children.sort((a, b) => a.code.localeCompare(b.code));
        for (const c of n.children) emit(c, depth + 1);
        rows.push({ key: `${n.id}-total`, label: `Total - ${n.code} - ${n.name}`, net: n.net, by: n.by, depth, kind: 'total' });
      }
    };
    for (const r of roots) emit(r, 0);
    // Per-column grand totals (for the pivot footer).
    const totalsBy: Record<string, number> = {};
    for (const r of roots) addBy(totalsBy, r.by);
    return { rows, totalDebit: Number(data.totalDebit || 0), totalCredit: Number(data.totalCredit || 0), isBalanced: data.isBalanced, totalsBy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapsed]);

  const debitCell = (net: number, clickable?: string) => net > 0.0001
    ? (clickable ? <button onClick={() => openLedger(clickable)} className="text-blue-600 hover:underline">{amt(net)}</button> : amt(net))
    : '';
  const creditCell = (net: number, clickable?: string) => net < -0.0001
    ? (clickable ? <button onClick={() => openLedger(clickable)} className="text-blue-600 hover:underline">{amt(net)}</button> : amt(net))
    : '';

  // Pivot-mode cells: one column per dimension value (net balance, red if negative) + a Total.
  const pivotCells = (by: Record<string, number>, net: number, clickable?: string, bold?: boolean) => {
    const base = `px-3 py-1 text-right ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`;
    return (
      <>
        {columns.map(c => {
          const v = by[c.id] || 0;
          return <td key={c.id} className={`${base} ${v < 0 ? 'text-red-600' : ''}`}>{v ? amtSigned(v) : ''}</td>;
        })}
        <td className={`${base} border-l border-slate-200 font-semibold ${net < 0 ? 'text-red-600' : ''}`}>
          {clickable
            ? <button onClick={() => openLedger(clickable)} className="text-blue-600 hover:underline">{amtSigned(net)}</button>
            : amtSigned(net)}
        </td>
      </>
    );
  };

  const buildModel = (): ReportModel | null => {
    if (!data || !built) return null;
    if (multi) {
      const cells = (label: string, by: Record<string, number>, net: number) =>
        [label, ...columns.map(c => (by[c.id] ? amtSigned(by[c.id]) : '')), amtSigned(net)];
      const rows: ReportRow[] = built.rows.map(r => ({
        cells: cells(r.kind === 'leaf' && r.code ? `${r.code} - ${r.label}` : r.label, r.by, r.net),
        indent: r.depth, bold: r.kind === 'parent' || r.kind === 'total',
      }));
      const grandNet = Object.values(built.totalsBy).reduce((s, v) => s + v, 0);
      rows.push({ cells: cells('Total', built.totalsBy, grandNet), bold: true });
      return {
        title: 'Trial Balance',
        subtitle: `Period: ${dateFrom} to ${dateTo} · By ${COLUMN_OPTIONS.find(o => o.value === column)?.label}`,
        columns: [{ label: 'Account' }, ...columns.map(c => ({ label: c.label, align: 'right' as const })), { label: 'Total', align: 'right' as const }],
        rows,
      };
    }
    const rows: ReportRow[] = built.rows.map(r => ({
      cells: [r.kind === 'leaf' && r.code ? `${r.code} - ${r.label}` : r.label, r.net > 0 ? amt(r.net) : '', r.net < 0 ? amt(r.net) : ''],
      indent: r.depth, bold: r.kind === 'parent' || r.kind === 'total',
    }));
    rows.push({ cells: ['Total', `Rp${built.totalDebit.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`, `Rp${built.totalCredit.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`], bold: true });
    return {
      title: 'Trial Balance',
      subtitle: `Period: ${dateFrom} to ${dateTo}`,
      columns: [{ label: 'Account' }, { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }],
      rows,
    };
  };

  // Column span of the amount columns (for empty parent rows / placeholders).
  const amtColSpan = multi ? columns.length + 1 : 2;
  const grandNet = built ? Object.values(built.totalsBy).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Trial Balance</h1>
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">View Detail</span>
          </div>
          <ReportExportBar build={buildModel} disabled={!data} />
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : data && built ? (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-2 py-1.5 text-left">Account</th>
                  {multi ? (
                    <>
                      {columns.map(c => <th key={c.id} className="px-3 py-1.5 text-right whitespace-nowrap">{c.label}</th>)}
                      <th className="px-3 py-1.5 text-right w-52 border-l border-slate-300">Total</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-1.5 text-right w-52">Debit</th>
                      <th className="px-3 py-1.5 text-right w-52">Credit</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {built.rows.length === 0 && (
                  <tr><td colSpan={1 + amtColSpan} className="px-4 py-10 text-center text-slate-400">No transactions in this period</td></tr>
                )}
                {built.rows.map(r => {
                  const isParent = r.kind === 'parent';
                  const isTotal = r.kind === 'total';
                  const isLeaf = r.kind === 'leaf';
                  if (isParent) {
                    return (
                      <tr key={r.key} className="bg-slate-50 border-b border-slate-100">
                        <td className="px-2 py-1.5 font-semibold text-slate-800" style={{ paddingLeft: `${8 + r.depth * 18}px` }}>
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => toggle(r.key)} className="text-slate-500 hover:text-slate-700">
                              {collapsed.has(r.key) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </button>
                            {r.label}
                          </span>
                        </td>
                        <td colSpan={amtColSpan} />
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.key} className={`border-b ${isTotal ? 'border-slate-200 border-dashed font-semibold' : 'border-slate-50'}`}>
                      <td className={`px-2 py-1 text-sm ${isTotal ? 'font-semibold text-slate-800' : 'text-slate-700'}`} style={{ paddingLeft: `${8 + r.depth * 18}px` }}>
                        {isLeaf && r.code && <span className="text-slate-400 mr-1 font-mono text-xs">{r.code}</span>}
                        {r.label}
                      </td>
                      {multi ? pivotCells(r.by, r.net, isLeaf ? r.key : undefined, isTotal) : (
                        <>
                          <td className={`px-3 py-1 text-right ${isTotal ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{debitCell(r.net, isLeaf ? r.key : undefined)}</td>
                          <td className={`px-3 py-1 text-right ${isTotal ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{creditCell(r.net, isLeaf ? r.key : undefined)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                  <td className="px-2 py-2 text-slate-900 text-sm">Total</td>
                  {multi ? (
                    <>
                      {columns.map(c => <td key={c.id} className={`px-3 py-2 text-right text-slate-900 text-sm ${(built.totalsBy[c.id] || 0) < 0 ? 'text-red-600' : ''}`}>{amtSigned(built.totalsBy[c.id] || 0)}</td>)}
                      <td className="px-3 py-2 text-right text-slate-900 text-sm border-l border-slate-300">{amtSigned(grandNet)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-slate-900 text-sm">{`Rp${built.totalDebit.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`}</td>
                      <td className="px-3 py-2 text-right text-slate-900 text-sm">{`Rp${built.totalCredit.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
            <div className={`px-4 py-2 text-sm font-medium ${built.isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {built.isBalanced ? 'Balanced: Total Debit = Total Credit' : 'Out of balance'}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom filter bar */}
      <div className="sticky bottom-0 bg-slate-100 border-t border-slate-300">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 uppercase">Column</span>
            <select value={column} onChange={e => setColumn(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white">
              {COLUMN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 uppercase">From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 uppercase">To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white" />
          </div>
          <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
        </div>
      </div>
    </div>
  );
}
