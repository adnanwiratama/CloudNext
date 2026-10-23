import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel, ReportRow } from '../../utils/reportExport';

interface GLLine { id: string; journal_id: string; journal_number: string; entry_date: string; source_type: string | null; source_id: string | null; memo: string; debit: number; credit: number; running_balance: number; dim_value?: string; }
interface GLAccount { account_id: string; account_code: string; account_name: string; account_type: string; parent_id: string | null; opening_balance: number; closing_balance: number; total_debit: number; total_credit: number; lines: GLLine[]; }
interface Acct { id: string; code: string; name: string; parent_id: string | null; }

const amt = (v: number) => `Rp${Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sourceLabel = (s: string | null) => (s || 'Journal').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Total' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'period', label: 'Period' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export default function GeneralLedgerReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [column, setColumn] = useState('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gl-report', dateFrom, dateTo, column],
    queryFn: () => api.get('/api/accounting/reports/general-ledger', { params: { dateFrom, dateTo, column } }).then(r => r.data.data),
  });

  const multi = column !== 'none';
  const dimLabel = COLUMN_OPTIONS.find(o => o.value === column)?.label || 'Dimension';

  const toggle = (id: string) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/account-ledger/${accountId}?dateFrom=${dateFrom}&dateTo=${dateTo}`);

  // Build the account hierarchy: group posting-accounts under their ancestors.
  type Node = { id: string; code: string; name: string; account?: GLAccount; children: Node[] };
  const tree = useMemo(() => {
    if (!data) return [] as Node[];
    const chart: Acct[] = data.chart || [];
    const accounts: GLAccount[] = data.accounts || [];
    const chartById: Record<string, Acct> = {};
    for (const a of chart) chartById[a.id] = a;

    const nodes: Record<string, Node> = {};
    const ensure = (a: Acct): Node => (nodes[a.id] ||= { id: a.id, code: a.code, name: a.name, children: [] });
    const roots: Node[] = [];

    for (const acc of accounts) {
      const leaf = ensure({ id: acc.account_id, code: acc.account_code, name: acc.account_name, parent_id: acc.parent_id });
      leaf.account = acc;
      let cur = chartById[acc.account_id];
      let child = leaf;
      const seen = new Set<string>([acc.account_id]);
      while (cur && cur.parent_id && chartById[cur.parent_id] && !seen.has(cur.parent_id)) {
        const pa = chartById[cur.parent_id];
        const pn = ensure(pa);
        if (!pn.children.includes(child)) pn.children.push(child);
        seen.add(pa.id); child = pn; cur = pa;
      }
      if (!roots.includes(child)) roots.push(child);
    }
    const sortRec = (n: Node) => { n.children.sort((a, b) => a.code.localeCompare(b.code)); n.children.forEach(sortRec); };
    roots.sort((a, b) => a.code.localeCompare(b.code));
    roots.forEach(sortRec);
    return roots;
  }, [data]);

  // Flatten the tree into render rows.
  type RenderRow =
    | { kind: 'acct-header'; depth: number; node: Node }
    | { kind: 'line'; depth: number; line: GLLine }
    | { kind: 'acct-total'; depth: number; node: Node; account: GLAccount }
    | { kind: 'group-total'; depth: number; node: Node; debit: number; credit: number; balance: number };

  const subtotal = (n: Node): { debit: number; credit: number; balance: number } => {
    if (n.account) return { debit: n.account.total_debit, credit: n.account.total_credit, balance: n.account.closing_balance };
    return n.children.reduce((s, c) => { const t = subtotal(c); return { debit: s.debit + t.debit, credit: s.credit + t.credit, balance: s.balance + t.balance }; }, { debit: 0, credit: 0, balance: 0 });
  };

  const rows: RenderRow[] = useMemo(() => {
    const out: RenderRow[] = [];
    const walk = (n: Node, depth: number) => {
      out.push({ kind: 'acct-header', depth, node: n });
      if (collapsed.has(n.id)) return;
      if (n.account) {
        for (const l of n.account.lines) out.push({ kind: 'line', depth: depth + 1, line: l });
        out.push({ kind: 'acct-total', depth, node: n, account: n.account });
      } else {
        for (const c of n.children) walk(c, depth + 1);
        const t = subtotal(n);
        out.push({ kind: 'group-total', depth, node: n, ...t });
      }
    };
    for (const r of tree) walk(r, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, collapsed]);

  const buildModel = (): ReportModel | null => {
    if (!data) return null;
    // When a dimension is selected, insert its value as an extra column after "Name".
    const pad = (cells: (string | number)[]) => {
      if (!multi) return cells;
      const c = [...cells];
      c.splice(5, 0, ''); // dimension column placeholder (empty for headers/totals)
      return c;
    };
    const out: ReportRow[] = [];
    for (const r of rows) {
      if (r.kind === 'acct-header') {
        const isLeaf = !!r.node.account;
        out.push({ cells: pad([`${r.node.code} - ${r.node.name}`, '', '', '', '', '', '', isLeaf ? amt(r.node.account!.opening_balance) : '']), indent: r.depth, bold: true });
      } else if (r.kind === 'line') {
        const l = r.line;
        const base: (string | number)[] = ['', sourceLabel(l.source_type), formatDate(l.entry_date), l.journal_number, l.memo || '', l.debit > 0 ? amt(l.debit) : '', l.credit > 0 ? amt(l.credit) : '', amt(l.running_balance)];
        if (multi) base.splice(5, 0, l.dim_value || '');
        out.push({ cells: base, indent: r.depth });
      } else if (r.kind === 'acct-total') {
        const a = r.account;
        out.push({ cells: pad([`Total - ${a.account_code} - ${a.account_name}`, '', '', '', '', amt(a.total_debit), amt(a.total_credit), amt(a.closing_balance)]), indent: r.depth, bold: true });
      } else {
        out.push({ cells: pad([`Total - ${r.node.code} - ${r.node.name}`, '', '', '', '', amt(r.debit), amt(r.credit), amt(r.balance)]), indent: r.depth, bold: true });
      }
    }
    const cols = [
      { label: 'Account' }, { label: 'Type' }, { label: 'Date' }, { label: 'Document Number' }, { label: 'Name' },
      ...(multi ? [{ label: dimLabel }] : []),
      { label: 'Debit', align: 'right' as const }, { label: 'Credit', align: 'right' as const }, { label: 'Balance', align: 'right' as const },
    ];
    return {
      title: 'General Ledger',
      subtitle: `Period: ${dateFrom} to ${dateTo}${multi ? ` · By ${dimLabel}` : ''}`,
      columns: cols,
      rows: out,
    };
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">General Ledger</h1>
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">View Detail</span>
          </div>
          <ReportExportBar build={buildModel} disabled={!data} />
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : data ? (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-2 py-1.5 text-left w-72">Account</th>
                  <th className="px-2 py-1.5 text-left w-28">Type</th>
                  <th className="px-2 py-1.5 text-left w-24">Date</th>
                  <th className="px-2 py-1.5 text-left w-40">Document Number</th>
                  <th className="px-2 py-1.5 text-left">Name</th>
                  {multi && <th className="px-2 py-1.5 text-left w-44">{dimLabel}</th>}
                  <th className="px-3 py-1.5 text-right w-40">Debit</th>
                  <th className="px-3 py-1.5 text-right w-40">Credit</th>
                  <th className="px-3 py-1.5 text-right w-44">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={multi ? 9 : 8} className="px-4 py-10 text-center text-slate-400">No transactions in this period</td></tr>
                )}
                {rows.map((r, i) => {
                  if (r.kind === 'acct-header') {
                    const isLeaf = !!r.node.account;
                    return (
                      <tr key={`h-${r.node.id}-${i}`} className="bg-slate-50 border-b border-slate-100">
                        <td className="px-2 py-1.5 font-semibold text-slate-800" style={{ paddingLeft: `${8 + r.depth * 18}px` }}>
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => toggle(r.node.id)} className="text-slate-500 hover:text-slate-700">
                              {collapsed.has(r.node.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </button>
                            {r.node.code} - {r.node.name}
                          </span>
                        </td>
                        <td colSpan={multi ? 5 : 4} />
                        <td /><td /><td className="px-3 py-1.5 text-right text-slate-500">{isLeaf ? amt(r.node.account!.opening_balance) : ''}</td>
                      </tr>
                    );
                  }
                  if (r.kind === 'line') {
                    const l = r.line;
                    return (
                      <tr key={l.id} className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer" onClick={() => navigate(`/accounting/journals/${l.journal_id}`)}>
                        <td style={{ paddingLeft: `${8 + r.depth * 18}px` }} />
                        <td className="px-2 py-1 text-slate-600 text-xs">{sourceLabel(l.source_type)}</td>
                        <td className="px-2 py-1 text-slate-600 text-xs">{formatDate(l.entry_date)}</td>
                        <td className="px-2 py-1 font-mono text-blue-600 text-xs">{l.journal_number}</td>
                        <td className="px-2 py-1 text-slate-600 truncate max-w-xs">{l.memo || '-'}</td>
                        {multi && <td className="px-2 py-1 text-slate-600 text-xs">{l.dim_value || ''}</td>}
                        <td className="px-3 py-1 text-right text-blue-700">{l.debit > 0 ? amt(l.debit) : ''}</td>
                        <td className="px-3 py-1 text-right text-emerald-700">{l.credit > 0 ? amt(l.credit) : ''}</td>
                        <td className={`px-3 py-1 text-right font-medium ${l.running_balance < 0 ? 'text-red-600' : 'text-slate-800'}`}>{amt(l.running_balance)}</td>
                      </tr>
                    );
                  }
                  if (r.kind === 'acct-total') {
                    const a = r.account;
                    return (
                      <tr key={`t-${a.account_id}-${i}`} className="border-b border-slate-200 border-dashed font-semibold">
                        <td className="px-2 py-1.5 text-slate-800" style={{ paddingLeft: `${8 + r.depth * 18}px` }}>
                          Total - {a.account_code} - {a.account_name}
                        </td>
                        <td colSpan={multi ? 5 : 4} />
                        <td className="px-3 py-1.5 text-right text-blue-700">
                          <button onClick={() => openLedger(a.account_id)} className="hover:underline" title="View account transactions">{amt(a.total_debit)}</button>
                        </td>
                        <td className="px-3 py-1.5 text-right text-emerald-700">
                          <button onClick={() => openLedger(a.account_id)} className="hover:underline" title="View account transactions">{amt(a.total_credit)}</button>
                        </td>
                        <td className={`px-3 py-1.5 text-right ${a.closing_balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{amt(a.closing_balance)}</td>
                      </tr>
                    );
                  }
                  // group-total
                  return (
                    <tr key={`gt-${r.node.id}-${i}`} className="border-b-2 border-slate-300 bg-slate-100 font-bold">
                      <td className="px-2 py-1.5 text-slate-900" style={{ paddingLeft: `${8 + r.depth * 18}px` }}>Total - {r.node.code} - {r.node.name}</td>
                      <td colSpan={multi ? 5 : 4} />
                      <td className="px-3 py-1.5 text-right text-blue-700">{amt(r.debit)}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-700">{amt(r.credit)}</td>
                      <td className={`px-3 py-1.5 text-right ${r.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{amt(r.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Bottom filter bar */}
      <div className="sticky bottom-0 bg-slate-100 border-t border-slate-300">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
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
