import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel, ReportRow } from '../../utils/reportExport';

interface Acct { id: string; code: string; name: string; parent_id: string | null; type?: string; balance?: string | number; subtype?: string; by?: Record<string, number>; }
interface Col { id: string; label: string; }
interface TreeNode { id: string; code: string; name: string; by: Record<string, number>; children: TreeNode[]; isLeaf: boolean; }
interface Row { key: string; label: string; code?: string; by: Record<string, number> | null; depth: number; kind: 'parent' | 'leaf' | 'total'; }

const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Total' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'period', label: 'Period' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export default function BalanceSheetReport() {
  const navigate = useNavigate();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [column, setColumn] = useState('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balance-sheet', asOfDate, column],
    queryFn: () => api.get('/api/accounting/reports/balance-sheet', { params: { asOfDate, column } }).then(r => r.data.data),
  });

  const toggle = (id: string) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/account-ledger/${accountId}?dateFrom=2000-01-01&dateTo=${asOfDate}`);

  const columns: Col[] = useMemo(() => (data?.columns?.length ? data.columns : [{ id: 'total', label: 'Total' }]), [data]);
  const multi = column !== 'none';
  const amtColCount = multi ? columns.length + 1 : 1;

  const addBy = (acc: Record<string, number>, b: Record<string, number> | undefined | null, sign = 1) => {
    if (!b) return acc;
    for (const k of Object.keys(b)) acc[k] = (acc[k] || 0) + b[k] * sign;
    return acc;
  };
  const totalOf = (by: Record<string, number> | null | undefined) => (by ? Object.values(by).reduce((s, v) => s + v, 0) : 0);

  // Build account hierarchy. `sign` normalises the stored (Dr-Cr) balance to a positive
  // display value for the section (assets: +, liabilities/equity: -(Dr-Cr)=Cr-Dr).
  const buildRows = (postings: Acct[], chart: Acct[], sign: 1 | -1): { rows: Row[]; totalBy: Record<string, number> } => {
    const chartById: Record<string, Acct> = {};
    for (const a of chart) chartById[a.id] = a;

    const nodes: Record<string, TreeNode> = {};
    const ensureNode = (a: Acct, isLeaf: boolean): TreeNode => {
      if (!nodes[a.id]) nodes[a.id] = { id: a.id, code: a.code, name: a.name, by: {}, children: [], isLeaf };
      else if (isLeaf) nodes[a.id].isLeaf = true;
      return nodes[a.id];
    };

    const roots: TreeNode[] = [];
    for (const p of postings) {
      const leaf = ensureNode(p, true);
      // Apply the section sign to each per-column value.
      const signed: Record<string, number> = {};
      addBy(signed, p.by, sign);
      leaf.by = signed;
      let cur = chartById[p.id];
      let childNode = leaf;
      const seen = new Set<string>([p.id]);
      while (cur && cur.parent_id && chartById[cur.parent_id] && !seen.has(cur.parent_id)) {
        const pa = chartById[cur.parent_id];
        const parentNode = ensureNode(pa, false);
        if (!parentNode.children.includes(childNode)) parentNode.children.push(childNode);
        seen.add(pa.id); childNode = parentNode; cur = pa;
      }
      if (!roots.includes(childNode)) roots.push(childNode);
    }

    const sum = (n: TreeNode): Record<string, number> => {
      if (n.children.length === 0) return n.by;
      const acc: Record<string, number> = {};
      for (const c of n.children) addBy(acc, sum(c));
      n.by = acc;
      return n.by;
    };
    for (const r of roots) sum(r);
    roots.sort((a, b) => a.code.localeCompare(b.code));

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

  const built = useMemo(() => {
    if (!data) return null;
    const chart: Acct[] = data.chart || [];
    const assets = (data.assets || []);
    const liabilities = (data.liabilities || []);
    // Equity excludes the computed retained-earnings pseudo-row (no real account id).
    const equity = (data.equity || []).filter((e: any) => e.id && e.subtype !== 'retained_earnings');
    const retained = (data.equity || []).find((e: any) => e.subtype === 'retained_earnings');
    // Retained earnings per column (equity sign = -1).
    const retainedBy: Record<string, number> = {};
    addBy(retainedBy, retained?.by, -1);
    return {
      assets: buildRows(assets, chart, 1),
      liabilities: buildRows(liabilities, chart, -1),
      equity: buildRows(equity, chart, -1),
      retainedBy,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapsed]);

  const amt = (v: number) => `Rp${Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Total equity per column = equity section + retained earnings.
  const totalEquityBy = useMemo(() => {
    const acc: Record<string, number> = {};
    if (built) { addBy(acc, built.equity.totalBy); addBy(acc, built.retainedBy); }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // Assets − Liabilities per column.
  const alLessBy = useMemo(() => {
    const acc: Record<string, number> = {};
    if (built) { addBy(acc, built.assets.totalBy); addBy(acc, built.liabilities.totalBy, -1); }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // Render the per-column amount cells for a row. Leaf rows drill down on the Total cell.
  const AmountCells = ({ by, leafId, bold }: { by: Record<string, number> | null; leafId?: string; bold?: boolean }) => {
    if (by == null) return <>{Array.from({ length: amtColCount }).map((_, i) => <td key={i} className="px-3 py-1" />)}</>;
    const neg = (v: number) => (v < 0 ? 'text-red-600' : '');
    const base = `px-3 py-1 text-right text-sm ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`;
    const total = totalOf(by);
    return (
      <>
        {multi && columns.map(c => <td key={c.id} className={`${base} ${neg(by[c.id] || 0)}`}>{amt(by[c.id] || 0)}</td>)}
        <td className={`${base} ${neg(total)} ${multi ? 'border-l border-slate-200 font-semibold' : ''}`}>
          {leafId
            ? <button onClick={() => openLedger(leafId)} className="text-blue-600 hover:underline" title="View account transactions">{amt(total)}</button>
            : amt(total)}
        </td>
      </>
    );
  };

  const renderRows = (rows: Row[]) => rows.map(r => {
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
              {r.code && isLeaf && <span className="text-slate-400 mr-1 font-mono text-xs">{r.code}</span>}{r.label}
            </span>
          </span>
        </td>
        <AmountCells by={r.by} leafId={isLeaf ? r.key : undefined} bold={isTotal} />
      </tr>
    );
  });

  const SectionHeader = ({ title }: { title: string }) => (
    <tr className="bg-slate-50"><td className="px-2 py-1.5 font-bold text-slate-800 text-sm"><span className="inline-flex items-center gap-1"><ChevronDown size={13} className="text-slate-500" />{title}</span></td><td colSpan={amtColCount} /></tr>
  );
  const TotalRow = ({ title, by, strong }: { title: string; by: Record<string, number>; strong?: boolean }) => (
    <tr className={`border-b border-slate-200 ${strong ? 'border-t-2 border-slate-300 bg-slate-50' : ''}`}>
      <td className={`px-2 py-1.5 ${strong ? 'font-bold' : 'font-semibold'} text-slate-800 text-sm`}>{title}</td>
      <AmountCells by={by} bold />
    </tr>
  );

  const buildModel = (): ReportModel | null => {
    if (!data || !built) return null;
    const cells = (label: string, by: Record<string, number> | null) => {
      const perCol = columns.map(c => (by ? amt(by[c.id] || 0) : ''));
      const total = by ? amt(totalOf(by)) : '';
      return multi ? [label, ...perCol, total] : [label, total];
    };
    const rows: ReportRow[] = [];
    const pushSection = (title: string, sec: { rows: Row[]; totalBy: Record<string, number> }, totalLabel: string) => {
      rows.push({ cells: cells(title, null), bold: true });
      for (const r of sec.rows) rows.push({ cells: cells(r.label, r.by), indent: r.depth, bold: r.kind === 'total' || r.kind === 'parent' });
      rows.push({ cells: cells(totalLabel, sec.totalBy), bold: true });
    };
    pushSection('Assets', built.assets, 'Total Assets');
    pushSection('Liabilities', built.liabilities, 'Total Liabilities');
    rows.push({ cells: cells('Total Assets Less Total Liabilities', alLessBy), bold: true });
    rows.push({ cells: cells('Capital and Reserves', null), bold: true });
    for (const r of built.equity.rows) rows.push({ cells: cells(r.label, r.by), indent: r.depth, bold: r.kind === 'total' || r.kind === 'parent' });
    rows.push({ cells: cells('Retained Earnings', built.retainedBy), indent: 1 });
    rows.push({ cells: cells('Total Capital and Reserves', totalEquityBy), bold: true });
    const cols = multi
      ? [{ label: 'Financial Row' }, ...columns.map(c => ({ label: c.label, align: 'right' as const })), { label: 'Total', align: 'right' as const }]
      : [{ label: 'Financial Row' }, { label: 'Amount', align: 'right' as const }];
    return {
      title: 'Balance Sheet',
      subtitle: `As of ${asOfDate}${multi ? ` · By ${COLUMN_OPTIONS.find(o => o.value === column)?.label}` : ''}`,
      columns: cols,
      rows,
    };
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Balance Sheet</h1>
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
                {/* Assets */}
                <SectionHeader title="Assets" />
                {renderRows(built.assets.rows)}
                <TotalRow title="Total Assets" by={built.assets.totalBy} strong />

                {/* Liabilities */}
                <SectionHeader title="Liabilities" />
                {renderRows(built.liabilities.rows)}
                <TotalRow title="Total Liabilities" by={built.liabilities.totalBy} />

                <TotalRow title="Total Assets Less Total Liabilities" by={alLessBy} strong />

                {/* Capital and Reserves (Equity) */}
                <SectionHeader title="Capital and Reserves" />
                {renderRows(built.equity.rows)}
                <tr className="border-b border-slate-100">
                  <td className="px-2 py-1 text-sm text-slate-700" style={{ paddingLeft: '28px' }}>Retained Earnings</td>
                  <AmountCells by={built.retainedBy} />
                </tr>
                <TotalRow title="Total Capital and Reserves" by={totalEquityBy} strong />
              </tbody>
            </table>

            <div className={`px-4 py-2 text-sm font-medium flex items-center justify-between ${data.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <span>{data.balanced ? 'Balanced: Assets = Liabilities + Equity' : 'Out of balance'}</span>
              <span className="text-xs">Net Income (current period): {amt(data.netIncome || 0)}</span>
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
            <span className="text-xs font-medium text-slate-600 uppercase">As Of</span>
            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white" />
          </div>
          <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
        </div>
      </div>
    </div>
  );
}
