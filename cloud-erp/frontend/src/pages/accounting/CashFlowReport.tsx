import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import ReportExportBar from '../../components/common/ReportExportBar';
import { ReportModel, ReportRow } from '../../utils/reportExport';

const amt = (v: number) => {
  const n = Number(v || 0);
  const s = `Rp${Math.abs(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${s}` : s;
};

interface Col { id: string; label: string; }

const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Total' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
  { value: 'period', label: 'Period' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export default function CashFlowReport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [column, setColumn] = useState('none');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cash-flow', dateFrom, dateTo, column],
    queryFn: () => api.get('/api/accounting/reports/cash-flow', { params: { startDate: dateFrom, endDate: dateTo, column } }).then(r => r.data.data),
  });

  const openLedger = (accountId: string | null) => {
    if (accountId) navigate(`/accounting/reports/account-ledger/${accountId}?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  };

  const op = data?.operating || {};
  const inv = data?.investing || {};
  const multi = column !== 'none';
  const columns: Col[] = useMemo(() => (data?.columns?.length ? data.columns : [{ id: 'total', label: 'Total' }]), [data]);
  const dimLabel = COLUMN_OPTIONS.find(o => o.value === column)?.label || 'Dimension';
  const amtColCount = multi ? columns.length + 1 : 1;
  const totalOf = (by: Record<string, number> | null | undefined) => (by ? Object.values(by).reduce((s, v) => s + v, 0) : 0);

  const buildModel = (): ReportModel | null => {
    if (!data) return null;
    const cells = (label: string, by: Record<string, number> | null, single?: number) => {
      if (!multi) return [label, single != null ? amt(single) : (by ? amt(totalOf(by)) : '')];
      const perCol = columns.map(c => (by ? amt(by[c.id] || 0) : ''));
      const total = by ? amt(totalOf(by)) : (single != null ? amt(single) : '');
      return [label, ...perCol, total];
    };
    const rows: ReportRow[] = [];
    rows.push({ cells: cells('Operating Activities', null), bold: true });
    rows.push({ cells: cells('Net Income', op.netIncomeBy || null, op.netIncome || 0), indent: 1 });
    rows.push({ cells: cells('Adjustments to Profit/(Loss)', null), indent: 1, bold: true });
    for (const a of (op.adjustments || [])) rows.push({ cells: cells(a.label, a.by || null, a.amount || 0), indent: 2 });
    rows.push({ cells: cells('Total Adjustments to Profit/(Loss)', op.totalAdjustmentsBy || null, op.totalAdjustments || 0), indent: 1, bold: true });
    rows.push({ cells: cells('Total Operating Activities', op.totalBy || null, op.total || 0), bold: true });
    rows.push({ cells: cells('Investing Activities', null), bold: true });
    for (const l of (inv.lines || [])) rows.push({ cells: cells(l.label, l.by || null, l.amount || 0), indent: 1 });
    rows.push({ cells: cells('Total Investing Activities', inv.totalBy || null, inv.total || 0), bold: true });
    // Cash positions are single totals (cash is not dimensionalised).
    const single = (label: string, v: number) => (multi ? [label, ...columns.map(() => ''), amt(v)] : [label, amt(v)]);
    rows.push({ cells: single('Net Change in Cash for Period', data.netChange || 0), bold: true });
    rows.push({ cells: single('Cash at Beginning of Period', data.openingCash || 0), bold: true });
    rows.push({ cells: single('Cash at End of Period', data.closingCash || 0), bold: true });
    const cols = multi
      ? [{ label: 'Financial Row' }, ...columns.map(c => ({ label: c.label, align: 'right' as const })), { label: 'Total', align: 'right' as const }]
      : [{ label: 'Financial Row' }, { label: 'Amount', align: 'right' as const }];
    return {
      title: 'Cash Flow Statement',
      subtitle: `Period: ${dateFrom} to ${dateTo}${multi ? ` · By ${dimLabel}` : ''}`,
      columns: cols,
      rows,
    };
  };

  // Per-column amount cells for a row. `by` spreads per dimension; `single` forces a
  // single Total-only value (cash positions). `accountId` makes the Total drillable.
  const AmountCells = ({ by, single, accountId, bold }: { by?: Record<string, number> | null; single?: number | null; accountId?: string | null; bold?: boolean }) => {
    const base = `px-3 py-1.5 text-right text-sm ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`;
    const total = single != null ? single : totalOf(by);
    const totalCell = (
      <td className={`${base} ${total < 0 ? 'text-red-600' : ''} ${multi ? 'border-l border-slate-200 font-semibold' : ''}`}>
        {accountId
          ? <button onClick={() => openLedger(accountId)} className="text-blue-600 hover:underline" title="View account transactions">{amt(total)}</button>
          : amt(total)}
      </td>
    );
    if (!multi) return totalCell;
    return (
      <>
        {columns.map(c => {
          const v = single != null ? (c.id === 'total' ? single : 0) : (by ? by[c.id] || 0 : 0);
          return <td key={c.id} className={`${base} ${v < 0 ? 'text-red-600' : ''}`}>{single != null ? '' : amt(v)}</td>;
        })}
        {totalCell}
      </>
    );
  };

  // One rendered row.
  const Row = ({ label, by, single, depth = 0, bold = false, section = false, accountId }: { label: string; by?: Record<string, number> | null; single?: number | null; depth?: number; bold?: boolean; section?: boolean; accountId?: string | null }) => (
    <tr className={`border-b border-slate-100 ${section ? 'bg-slate-50' : ''}`}>
      <td className={`px-2 py-1.5 text-sm ${bold || section ? 'font-semibold text-slate-800' : 'text-slate-700'}`} style={{ paddingLeft: `${8 + depth * 20}px` }}>
        {section ? <span className="inline-flex items-center gap-1"><ChevronDown size={13} className="text-slate-500" />{label}</span> : label}
      </td>
      {section ? <td colSpan={amtColCount} /> : <AmountCells by={by} single={single} accountId={accountId} bold={bold} />}
    </tr>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Cash Flow Statement</h1>
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">View Detail</span>
          </div>
          <ReportExportBar build={buildModel} disabled={!data} />
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : data ? (
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
                {/* Operating Activities */}
                <Row label="Operating Activities" section />
                <Row label="Net Income" by={op.netIncomeBy} single={op.netIncome || 0} depth={1} />
                <Row label="Adjustments to Profit/(Loss)" depth={1} bold section={false} />
                {(op.adjustments || []).map((a: any) => (
                  <Row key={a.key} label={a.label} by={a.by} single={a.amount || 0} depth={2} accountId={a.accountId} />
                ))}
                <Row label="Total Adjustments to Profit/(Loss)" by={op.totalAdjustmentsBy} single={op.totalAdjustments || 0} depth={1} bold />
                <Row label="Total Operating Activities" by={op.totalBy} single={op.total || 0} bold />

                {/* Investing Activities */}
                <Row label="Investing Activities" section />
                {(inv.lines || []).map((l: any) => (
                  <Row key={l.key} label={l.label} by={l.by} single={l.amount || 0} depth={1} accountId={l.accountId} />
                ))}
                <Row label="Total Investing Activities" by={inv.totalBy} single={inv.total || 0} bold />

                {/* Net change + cash positions (single totals — cash is not dimensionalised) */}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="px-2 py-2 font-bold text-slate-900 text-sm">Net Change in Cash for Period</td>
                  <AmountCells single={data.netChange || 0} bold />
                </tr>
                <Row label="Cash at Beginning of Period" single={data.openingCash || 0} bold />
                <tr className="border-t border-slate-200 bg-emerald-50">
                  <td className="px-2 py-2 font-bold text-emerald-800 text-sm">Cash at End of Period</td>
                  <AmountCells single={data.closingCash || 0} bold />
                </tr>
              </tbody>
            </table>
            {multi && (
              <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
                Cash position rows (Net Change / Beginning / End) are shown as a single total — cash is a single pool and is not split by {dimLabel.toLowerCase()}.
              </div>
            )}
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
