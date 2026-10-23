import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel, ReportRow } from '../../utils/reportExport';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Acct { id: string; code: string; name: string; parent_id: string | null; type?: string; amount?: string | number; by?: Record<string, number>; }
interface Col { id: string; label: string; }
interface TreeNode { id: string; code: string; name: string; by: Record<string, number>; children: TreeNode[]; isLeaf: boolean; }

// Row emitted for rendering (flat list with depth + kind). `by` holds per-column amounts.
interface Row { key: string; label: string; code?: string; by: Record<string, number> | null; depth: number; kind: 'section' | 'parent' | 'leaf' | 'total' | 'result'; }

// Column dropdown options → backend `column` param.
const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Total' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'period', label: 'Period' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export default function ProfitLossReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [column, setColumn] = useState('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Drill-down: clicking a leaf account's amount opens its transaction ledger.
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/account-ledger/${accountId}?dateFrom=${dateFrom}&dateTo=${dateTo}`);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pl-report', dateFrom, dateTo, column],
    queryFn: () => api.get('/api/accounting/reports/profit-loss', { params: { dateFrom, dateTo, column } }).then(r => r.data.data),
  });

  const toggle = (id: string) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // The authoritative ordered column list from the backend (falls back to a single Total column).
  const columns: Col[] = useMemo(() => (data?.columns?.length ? data.columns : [{ id: 'total', label: 'Total' }]), [data]);

  // Sum two per-column maps into the accumulator.
  const addBy = (acc: Record<string, number>, b: Record<string, number> | undefined | null) => {
    if (!b) return acc;
    for (const k of Object.keys(b)) acc[k] = (acc[k] || 0) + b[k];
    return acc;
  };
  const totalOf = (by: Record<string, number> | null | undefined) => (by ? Object.values(by).reduce((s, v) => s + v, 0) : 0);

  // Build the account hierarchy for a set of posting rows, resolving parents via the chart.
  const buildRows = (postings: Acct[], chart: Acct[]): { rows: Row[]; totalBy: Record<string, number> } => {
    const chartById: Record<string, Acct> = {};
    for (const a of chart) chartById[a.id] = a;

    // Map of nodes we actually need (posting accounts + all their ancestors).
    const nodes: Record<string, TreeNode> = {};
    const ensureNode = (a: Acct, isLeaf: boolean): TreeNode => {
      if (!nodes[a.id]) nodes[a.id] = { id: a.id, code: a.code, name: a.name, by: {}, children: [], isLeaf };
      else if (isLeaf) nodes[a.id].isLeaf = true;
      return nodes[a.id];
    };

    const roots: TreeNode[] = [];
    for (const p of postings) {
      const leaf = ensureNode(p, true);
      leaf.by = { ...(p.by || {}) };
      // Walk up the ancestor chain, linking children.
      let cur = chartById[p.id];
      let childNode = leaf;
      const seen = new Set<string>([p.id]);
      while (cur && cur.parent_id && chartById[cur.parent_id] && !seen.has(cur.parent_id)) {
        const pa = chartById[cur.parent_id];
        const parentNode = ensureNode(pa, false);
        if (!parentNode.children.includes(childNode)) parentNode.children.push(childNode);
        seen.add(pa.id);
        childNode = parentNode;
        cur = pa;
      }
      if (!roots.includes(childNode)) roots.push(childNode);
    }

    // Sum per-column amounts up the tree.
    const sum = (n: TreeNode): Record<string, number> => {
      if (n.children.length === 0) return n.by;
      const acc: Record<string, number> = {};
      for (const c of n.children) addBy(acc, sum(c));
      n.by = acc;
      return n.by;
    };
    for (const r of roots) sum(r);
    roots.sort((a, b) => a.code.localeCompare(b.code));

    // Flatten to render rows (parent header → children → "Total - parent").
    const rows: Row[] = [];
    const emit = (n: TreeNode, depth: number) => {
      if (n.children.length === 0) {
        rows.push({ key: n.id, label: n.name, code: n.code, by: n.by, depth, kind: 'leaf' });
        return;
      }
      rows.push({ key: n.id, label: `${n.code} - ${n.name}`, by: null, depth, kind: 'parent' });
      if (!collapsed.has(n.id)) {
        n.children.sort((a, b) => a.code.localeCompare(b.code));
        for (const c of n.children) emit(c, depth + 1);
        rows.push({ key: `${n.id}-total`, label: `Total - ${n.code} ${n.name}`, by: n.by, depth, kind: 'total' });
      }
    };
    for (const r of roots) emit(r, 1);
    const totalBy: Record<string, number> = {};
    for (const r of roots) addBy(totalBy, r.by);
    return { rows, totalBy };
  };

  const sections = useMemo(() => {
    if (!data) return null;
    const chart: Acct[] = data.chart || [];
    const revenue: Acct[] = data.revenue || [];
    const expenses: Acct[] = data.expenses || [];
    const cogs = expenses.filter((e: any) => ['cogs', 'cost_of_goods'].includes(e.type));
    const opex = expenses.filter((e: any) => ['expense', 'other_expense'].includes(e.type));
    const sales = { ...buildRows(revenue, chart), title: 'Sales' };
    const purchases = { ...buildRows(cogs, chart), title: 'Purchases' };
    const overheads = { ...buildRows(opex, chart), title: 'Overheads' };
    // Gross Profit per column = Sales - Purchases; Net Income per column = GP - Overheads.
    const grossProfitBy: Record<string, number> = {};
    const netIncomeBy: Record<string, number> = {};
    for (const c of (data.columns?.length ? data.columns : [{ id: 'total' }])) {
      const gp = (sales.totalBy[c.id] || 0) - (purchases.totalBy[c.id] || 0);
      grossProfitBy[c.id] = gp;
      netIncomeBy[c.id] = gp - (overheads.totalBy[c.id] || 0);
    }
    return { sales, purchases, overheads, grossProfitBy, netIncomeBy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapsed]);

  const amt = (v: number) => `Rp${Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Flatten the report into a model for Export/Print (one column per dimension value + Total).
  const buildModel = (): ReportModel | null => {
    if (!data || !sections) return null;
    const multi = column !== 'none';
    const cells = (label: string, by: Record<string, number> | null) => {
      const perCol = columns.map(c => (by ? amt(by[c.id] || 0) : ''));
      const total = by ? amt(totalOf(by)) : '';
      return multi ? [label, ...perCol, total] : [label, total];
    };
    const rows: ReportRow[] = [];
    const pushSection = (title: string, s: { rows: Row[]; totalBy: Record<string, number> }) => {
      rows.push({ cells: cells(title, null), bold: true });
      for (const r of s.rows) rows.push({ cells: cells(r.label, r.by), indent: r.depth, bold: r.kind === 'total' || r.kind === 'parent' });
      rows.push({ cells: cells(`Total - ${title}`, s.totalBy), bold: true });
    };
    pushSection('Sales', sections.sales);
    pushSection('Purchases', sections.purchases);
    rows.push({ cells: cells('Gross Profit', sections.grossProfitBy), bold: true });
    pushSection('Overheads', sections.overheads);
    rows.push({ cells: cells('Net Income', sections.netIncomeBy), bold: true });
    const cols = multi
      ? [{ label: 'Financial Row' }, ...columns.map(c => ({ label: c.label, align: 'right' as const })), { label: 'Total', align: 'right' as const }]
      : [{ label: 'Financial Row' }, { label: 'Amount', align: 'right' as const }];
    return {
      title: 'Income Statement',
      subtitle: `Period: ${dateFrom} to ${dateTo}${multi ? ` · By ${COLUMN_OPTIONS.find(o => o.value === column)?.label}` : ''}`,
      columns: cols,
      rows,
    };
  };

  const multi = column !== 'none';
  // Number of amount columns rendered: per-dimension columns + a Total column (or just one when none).
  const amtColCount = multi ? columns.length + 1 : 1;

  // Render the per-column amount cells for a row. Leaf rows drill down on the Total cell.
  const AmountCells = ({ by, leafId, bold }: { by: Record<string, number> | null; leafId?: string; bold?: boolean }) => {
    if (by == null) return <>{Array.from({ length: amtColCount }).map((_, i) => <td key={i} className="px-3 py-1" />)}</>;
    const tdCls = `px-3 py-1 text-right text-sm ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`;
    return (
      <>
        {multi && columns.map(c => <td key={c.id} className={tdCls}>{amt(by[c.id] || 0)}</td>)}
        <td className={`${tdCls} ${multi ? 'border-l border-slate-200 font-semibold' : ''}`}>
          {leafId
            ? <button onClick={() => openLedger(leafId)} className="text-blue-600 hover:underline" title="View account transactions">{amt(totalOf(by))}</button>
            : amt(totalOf(by))}
        </td>
      </>
    );
  };

  const SectionBlock = ({ title, built }: { title: string; built: { rows: Row[]; totalBy: Record<string, number> } }) => (
    <>
      <tr className="bg-slate-50">
        <td className="px-2 py-1.5 font-bold text-slate-800 text-sm">
          <span className="inline-flex items-center gap-1"><ChevronDown size={13} className="text-slate-500" />{title}</span>
        </td>
        <td className="px-3 py-1.5" colSpan={amtColCount} />
      </tr>
      {built.rows.map(r => {
        const isParent = r.kind === 'parent';
        const isTotal = r.kind === 'total';
        const isLeaf = r.kind === 'leaf';
        return (
          <tr key={r.key} className={`border-b border-slate-100 ${isTotal ? 'font-semibold' : ''}`}>
            <td className="px-2 py-1 text-sm text-slate-700" style={{ paddingLeft: `${8 + r.depth * 20}px` }}>
              <span className="inline-flex items-center gap-1">
                {isParent && (
                  <button onClick={() => toggle(r.key)} className="text-slate-500 hover:text-slate-700">
                    {collapsed.has(r.key) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
                <span className={isParent || isTotal ? 'font-semibold text-slate-800' : ''}>
                  {r.code && isLeaf && <span className="text-slate-400 mr-1 font-mono text-xs">{r.code}</span>}
                  {r.label}
                </span>
              </span>
            </td>
            <AmountCells by={r.by} leafId={isLeaf ? r.key : undefined} bold={isTotal} />
          </tr>
        );
      })}
      <tr className="border-b border-slate-200">
        <td className="px-2 py-1.5 font-bold text-slate-800 text-sm">Total - {title}</td>
        <AmountCells by={built.totalBy} bold />
      </tr>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Income Statement</h1>
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">View Detail</span>
          </div>
          <ReportExportBar build={buildModel} disabled={!data} />
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : data && sections ? (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300">
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Financial Row</th>
                  {multi && columns.map(c => (
                    <th key={c.id} className="px-3 py-1.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className={`px-3 py-1.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide w-64 whitespace-nowrap ${multi ? 'border-l border-slate-300' : ''}`}>{multi ? 'Total' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                <SectionBlock title="Sales" built={sections.sales} />
                <SectionBlock title="Purchases" built={sections.purchases} />

                {/* Gross Profit = Sales - Purchases */}
                <tr className="border-b-2 border-slate-300 bg-slate-50">
                  <td className="px-2 py-2 font-bold text-slate-900 text-sm">Gross Profit</td>
                  <AmountCells by={sections.grossProfitBy} bold />
                </tr>

                <SectionBlock title="Overheads" built={sections.overheads} />

                {/* Net Income */}
                <tr className="border-t-2 border-slate-400 bg-slate-100">
                  <td className="px-2 py-2.5 font-bold text-slate-900 text-sm">Net Income</td>
                  <AmountCells by={sections.netIncomeBy} bold />
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Bottom filter bar (NetSuite style) */}
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
