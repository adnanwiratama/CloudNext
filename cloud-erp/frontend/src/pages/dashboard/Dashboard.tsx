import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  RefreshCw, Loader2, ChevronDown, TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, Package, ShoppingCart, Truck, Factory, ArrowUpRight, ArrowDownRight,
  Bell, CheckCircle, Clock, XCircle, GripHorizontal, Minus, ExternalLink, Settings, RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// PORTLET WRAPPER  (NetSuite-style collapsible, draggable header)
// ─────────────────────────────────────────────────────────────────────────────
function Portlet({
  title, action, children, className = '', defaultOpen = true, drag,
}: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
  className?: string; defaultOpen?: boolean;
  // Drag wiring supplied by the dashboard grid (native HTML5 DnD).
  drag?: {
    draggable: boolean;
    isDragging: boolean;
    isOver: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
  };
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`portlet ${className} ${drag?.isDragging ? 'opacity-40' : ''} ${drag?.isOver ? 'ring-2 ring-blue-400' : ''} transition-shadow`}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragLeave={drag?.onDragLeave}
    >
      <div className="portlet-header">
        <div className="flex items-center gap-2">
          <span
            draggable={drag?.draggable}
            onDragStart={drag?.onDragStart}
            onDragEnd={drag?.onDragEnd}
            className={drag ? 'cursor-grab active:cursor-grabbing' : ''}
            title={drag ? 'Drag to reorder' : undefined}
          >
            <GripHorizontal size={13} className="text-slate-400" />
          </span>
          <span className="portlet-title">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {action}
          <button onClick={() => setOpen(!open)}
            className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
            {open ? <Minus size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
      {open && <div className="portlet-body">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD  (compact, NetSuite-style)
// ─────────────────────────────────────────────────────────────────────────────
function KPICard({ title, value, sub, trend, color, link }: {
  title: string; value: string; sub?: string;
  trend?: 'up' | 'down' | 'neutral'; color?: string; link?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => link && navigate(link)}
      className={`bg-white border border-slate-200 px-4 py-3 ${link ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/30' : ''} transition-colors`}
      style={{ borderRadius: '2px' }}
    >
      <div className={`text-sm font-medium mb-1.5 ${color || 'text-slate-500'}`}>{title}</div>
      <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 flex items-center gap-0.5
          ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'}`}>
          {trend === 'up' && <TrendingUp size={10} />}
          {trend === 'down' && <TrendingDown size={10} />}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDERS PORTLET CONTENT
// ─────────────────────────────────────────────────────────────────────────────
interface ReminderItem { key: string; count: number; label: string; path: string; overdue?: number; }

function RemindersPortlet({ reminders, hiddenKeys }: {
  reminders: { pendingApproval?: ReminderItem[]; notCompleted?: ReminderItem[] };
  hiddenKeys: Set<string>;
}) {
  const navigate = useNavigate();
  const pendingApproval = (reminders?.pendingApproval || []).filter(r => !hiddenKeys.has(r.key));
  const notCompleted = (reminders?.notCompleted || []).filter(r => !hiddenKeys.has(r.key));
  const total = pendingApproval.length + notCompleted.length;

  if (total === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <CheckCircle size={22} className="text-emerald-500 mx-auto mb-2" />
        <p className="text-base text-slate-600 font-medium">All caught up!</p>
        <p className="text-sm text-slate-400 mt-1">No pending or unfinished transactions{hiddenKeys.size > 0 ? ' in your selected list' : ''}.</p>
      </div>
    );
  }

  const Row = ({ item, color }: { item: ReminderItem; color: string }) => (
    <button onClick={() => navigate(item.path)}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors group">
      <span className={`text-base font-bold w-8 text-right flex-shrink-0 ${color}`}>{item.count}</span>
      <span className="text-base text-blue-600 group-hover:underline flex-1">
        {item.label}
        {item.overdue ? <span className="ml-2 badge badge-red text-2xs">{item.overdue} overdue</span> : null}
      </span>
      <ExternalLink size={12} className="text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
    </button>
  );

  return (
    <div>
      {pendingApproval.length > 0 && (
        <div>
          <div className="px-4 pt-2.5 pb-1 text-2xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={11} className="text-amber-500" /> Pending Approval
          </div>
          <div className="divide-y divide-slate-100">
            {pendingApproval.map(item => <Row key={item.key} item={item} color="text-amber-600" />)}
          </div>
        </div>
      )}
      {notCompleted.length > 0 && (
        <div className={pendingApproval.length > 0 ? 'border-t border-slate-200' : ''}>
          <div className="px-4 pt-2.5 pb-1 text-2xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-blue-500" /> Not Completed
          </div>
          <div className="divide-y divide-slate-100">
            {notCompleted.map(item => <Row key={item.key} item={item} color="text-blue-600" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL QUEUE PORTLET
// ─────────────────────────────────────────────────────────────────────────────
function ApprovalQueuePortlet({ data }: { data: any }) {
  const navigate = useNavigate();
  const items = [
    ...(data?.pendingSOList || []).slice(0, 3).map((s: any) => ({
      number: s.so_number, desc: s.customer_name, amount: s.total_amount,
      type: 'SO', path: `/sales/orders/${s.id}`, color: 'badge-blue',
    })),
    ...(data?.pendingPOList || []).slice(0, 3).map((p: any) => ({
      number: p.po_number, desc: p.vendor_name, amount: p.total_amount,
      type: 'PO', path: `/purchasing/orders/${p.id}`, color: 'badge-yellow',
    })),
  ];

  if (items.length === 0) {
    return (
      <div className="px-4 py-4 text-center text-base text-slate-400">
        No pending approvals
      </div>
    );
  }

  return (
    <table className="erp-table">
      <thead>
        <tr>
          <th>Type</th><th className="whitespace-nowrap">Number</th><th>Description</th>
          <th className="text-right">Amount</th><th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="cursor-pointer" onClick={() => navigate(item.path)}>
            <td><span className={`badge ${item.color}`}>{item.type}</span></td>
            <td className="font-mono text-sm text-blue-600 font-medium whitespace-nowrap">{item.number}</td>
            <td className="text-slate-600 max-w-xs truncate">{item.desc}</td>
            <td className="text-right font-medium">{formatCurrency(item.amount)}</td>
            <td>
              <button className="text-sm text-blue-600 hover:underline whitespace-nowrap">
                Approve
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// All reminder records the user can choose to show/hide, grouped for the settings panel.
const REMINDER_OPTIONS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Pending Approval',
    items: [
      { key: 'so_approval', label: 'Sales Orders pending approval' },
      { key: 'po_approval', label: 'Purchase Orders pending approval' },
      { key: 'pr_approval', label: 'Purchase Requisitions pending approval' },
      { key: 'quote_approval', label: 'Quotations pending approval' },
    ],
  },
  {
    group: 'Not Completed',
    items: [
      { key: 'so_fulfill', label: 'Sales Orders awaiting fulfillment' },
      { key: 'so_bill', label: 'Sales Orders awaiting billing' },
      { key: 'po_receive', label: 'Purchase Orders awaiting receipt' },
      { key: 'po_bill', label: 'Purchase Orders awaiting billing' },
      { key: 'inv_unpaid', label: 'Invoices awaiting payment' },
      { key: 'bill_unpaid', label: 'Vendor Bills awaiting payment' },
      { key: 'wo_open', label: 'Work Orders not completed' },
    ],
  },
];
const ALL_REMINDER_KEYS = REMINDER_OPTIONS.flatMap(g => g.items.map(i => i.key));

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER SETTINGS POPOVER — choose which records appear in the Reminders portlet
// ─────────────────────────────────────────────────────────────────────────────
function ReminderSettings({ hiddenKeys, setHiddenKeys }: {
  hiddenKeys: Set<string>; setHiddenKeys: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = (key: string) => {
    const next = new Set(hiddenKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHiddenKeys(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Choose which records to show"
        className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
        <Settings size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-64 bg-white border border-slate-200 rounded shadow-lg p-2 text-left">
          <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-600">Show records</span>
            <button onClick={() => setHiddenKeys(new Set())} className="text-2xs text-blue-600 hover:underline">Show all</button>
          </div>
          <div className="max-h-72 overflow-auto">
            {REMINDER_OPTIONS.map(g => (
              <div key={g.group} className="mb-1.5">
                <div className="text-2xs font-semibold text-slate-400 uppercase px-1 py-0.5">{g.group}</div>
                {g.items.map(it => (
                  <label key={it.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" className="accent-blue-600" checked={!hiddenKeys.has(it.key)} onChange={() => toggle(it.key)} />
                    <span className="text-xs text-slate-600">{it.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const LAYOUT_KEY = 'dashboard.widgetOrder.v1';
const REMINDER_HIDDEN_KEY = 'dashboard.reminderHidden.v1';
const DEFAULT_ORDER = ['reminders', 'kpis', 'revenue', 'topCustomers', 'approvals', 'lowStock', 'recentGL'];

export default function Dashboard() {
  const [period, setPeriod] = useState('MTD');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api.get('/api/reports/dashboard', { params: { period } }).then(r => r.data.data),
    refetchInterval: 300000,
  });

  const kpis  = data?.kpis  || {};
  const charts = data?.charts || {};
  const topCustomers = data?.topCustomers || [];
  const lowStock     = data?.lowStock     || [];

  const PERIOD_LABELS: Record<string, string> = { Today: 'Today', WTD: 'Week to date', MTD: 'Month to date', QTD: 'Quarter to date', YTD: 'Year to date' };
  const periodLabel = PERIOD_LABELS[period] || 'Month to date';

  const revenueData = (charts.revenueByMonth || []).map((m: any) => ({
    month: m.month?.slice(5) || m.month,
    amount: parseFloat(m.amount) / 1_000_000,
  }));

  // ── Persisted widget order (drag to reorder) ──
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) {
        // Merge in any new widgets that didn't exist when the layout was saved.
        return [...saved.filter((k: string) => DEFAULT_ORDER.includes(k)), ...DEFAULT_ORDER.filter(k => !saved.includes(k))];
      }
    } catch { /* ignore */ }
    return DEFAULT_ORDER;
  });
  useEffect(() => { localStorage.setItem(LAYOUT_KEY, JSON.stringify(order)); }, [order]);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const moveWidget = (from: string, to: string) => {
    if (from === to) return;
    setOrder(prev => {
      const next = [...prev];
      if (next.indexOf(from) < 0 || next.indexOf(to) < 0) return prev;
      next.splice(next.indexOf(from), 1);
      next.splice(next.indexOf(to), 0, from);
      return next;
    });
  };

  const dragProps = (key: string) => ({
    draggable: true,
    isDragging: dragKey === key,
    isOver: overKey === key && dragKey !== key,
    onDragStart: (e: React.DragEvent) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', key); } catch { /* */ } },
    onDragEnd: () => { setDragKey(null); setOverKey(null); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overKey !== key) setOverKey(key); },
    onDragLeave: () => { if (overKey === key) setOverKey(null); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragKey) moveWidget(dragKey, key); setDragKey(null); setOverKey(null); },
  });

  // ── Persisted reminder record visibility ──
  const [hiddenKeys, setHiddenKeysState] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMINDER_HIDDEN_KEY) || 'null');
      if (Array.isArray(saved)) return new Set(saved.filter((k: string) => ALL_REMINDER_KEYS.includes(k)));
    } catch { /* ignore */ }
    return new Set();
  });
  const setHiddenKeys = (s: Set<string>) => {
    setHiddenKeysState(s);
    localStorage.setItem(REMINDER_HIDDEN_KEY, JSON.stringify([...s]));
  };

  const resetLayout = () => { setOrder(DEFAULT_ORDER); };

  // Column span per widget in the 3-column grid.
  const SPAN: Record<string, string> = {
    reminders: 'col-span-1', kpis: 'col-span-2', revenue: 'col-span-2', topCustomers: 'col-span-1',
    approvals: 'col-span-1', lowStock: 'col-span-1', recentGL: 'col-span-3',
  };

  return (
    <div className="min-h-full">
      {/* ── Page sub-header (NetSuite-style - buttons on LEFT) ────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-8 py-3 flex items-center gap-4">
        {/* Icon + Title */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <h1 className="text-lg font-semibold text-slate-900">Home</h1>
        </div>
        
        {/* Action buttons LEFT SIDE (NetSuite style) */}
        <div className="flex items-center gap-2">
          {/* Period selector dengan warna biru NetSuite */}
          <div className="flex items-center border border-slate-300 rounded overflow-hidden shadow-sm">
            {['Today', 'WTD', 'MTD', 'QTD', 'YTD'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{ backgroundColor: period === p ? '#2e729f' : 'white' }}
                className={`px-3 py-2 text-sm font-medium transition-colors
                  ${period === p ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} className="btn-primary">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={resetLayout} title="Reset portlet layout"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded bg-white hover:bg-slate-50 transition-colors">
            <RotateCcw size={13} /> Reset Layout
          </button>
        </div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Right side actions if any */}
        <div className="flex items-center gap-2">
          {/* Could add more actions here */}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      ) : (
        /* Content: single draggable 3-column grid. Each portlet can be dragged by its grip to reorder. */
        (() => {
          const widgets: Record<string, React.ReactNode> = {
            reminders: (
              <Portlet title="Reminders" drag={dragProps('reminders')}
                action={<ReminderSettings hiddenKeys={hiddenKeys} setHiddenKeys={setHiddenKeys} />}>
                <RemindersPortlet reminders={data?.reminders || {}} hiddenKeys={hiddenKeys} />
              </Portlet>
            ),
            kpis: (
              <Portlet title="Key Performance Indicators" drag={dragProps('kpis')}
                action={<span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">{periodLabel}</span>}>
                {/* Row 1 — activity within the selected period (Today / WTD / MTD / QTD / YTD) */}
                <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100 p-0">
                  <KPICard title="Revenue"        value={formatCurrency(kpis.revenuePeriod || 0)} sub={periodLabel} trend="up"  color="text-blue-600"    link="/accounting/reports/profit-loss" />
                  <KPICard title="Sales Orders"   value={formatCurrency(kpis.soPeriodTotal || 0)} sub={`${formatNumber(kpis.soPeriodCount || 0)} order(s) ${periodLabel.toLowerCase()}`}  trend="neutral" color="text-indigo-600" link="/sales/orders" />
                  <KPICard title="Invoiced (AR)"  value={formatCurrency(kpis.invPeriodTotal || 0)} sub={`${formatNumber(kpis.invPeriodCount || 0)} invoice(s) ${periodLabel.toLowerCase()}`} trend="neutral" color="text-violet-600" link="/sales/invoices" />
                  <KPICard title="Billed (AP)"    value={formatCurrency(kpis.billPeriodTotal || 0)} sub={`${formatNumber(kpis.billPeriodCount || 0)} bill(s) ${periodLabel.toLowerCase()}`}    trend="neutral" color="text-orange-600" link="/purchasing/bills" />
                </div>
                {/* Row 2 — point-in-time balances (not period-bounded) */}
                <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100 border-t border-slate-100">
                  <KPICard title="Open AR Balance"  value={formatCurrency(kpis.openAR || 0)}    sub={kpis.overdueAR > 0 ? `${formatCurrency(kpis.overdueAR)} overdue` : 'No overdue'} trend={kpis.overdueAR > 0 ? 'down' : 'up'} color="text-violet-700" link="/accounting/reports/ar-aging" />
                  <KPICard title="Open AP Balance"  value={formatCurrency(kpis.openAP || 0)}    sub="Current balance" trend="neutral" color="text-orange-700" link="/accounting/reports/ap-aging" />
                  <KPICard title="Inventory Value"  value={formatCurrency(kpis.inventoryValue || 0)} sub="All locations" trend="neutral" color="text-teal-600" />
                  <KPICard title="Open Orders"      value={`${formatNumber(kpis.openSOCount || 0)} SO · ${formatNumber(kpis.openPOCount || 0)} PO`} sub={`${formatNumber(kpis.openWOCount || 0)} work order(s)`} trend="neutral" color="text-rose-600" link="/sales/orders" />
                </div>
              </Portlet>
            ),
            revenue: (
              <Portlet title="Revenue Trend — Last 12 Months" drag={dragProps('revenue')}>
                <div className="px-4 pb-4 pt-3">
                  {revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}M`} />
                        <Tooltip
                          cursor={{ fill: '#f1f5f9' }}
                          formatter={(v: any) => [`Rp ${(v * 1_000_000).toLocaleString('id-ID')}`, 'Revenue']}
                          contentStyle={{ fontSize: 12, borderRadius: 2, border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="amount" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={42} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-base">
                      No revenue data available
                    </div>
                  )}
                </div>
              </Portlet>
            ),
            topCustomers: (
              <Portlet title="Top Customers (YTD)" drag={dragProps('topCustomers')}>
                {topCustomers.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {topCustomers.map((c: any, idx: number) => (
                      <div key={c.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
                        <span className="text-sm font-bold text-slate-300 w-5 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <Link to={`/customers/${c.id}`} className="text-sm font-medium text-blue-600 hover:underline truncate block">{c.name}</Link>
                          <p className="text-sm text-slate-500">{formatCurrency(c.total_amount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center text-base text-slate-400">No data yet</div>
                )}
              </Portlet>
            ),
            approvals: (
              <Portlet title="Pending Approvals" drag={dragProps('approvals')}
                action={<Link to="/purchasing/orders" className="text-sm text-blue-600 hover:underline">View All</Link>}>
                <ApprovalQueuePortlet data={data} />
              </Portlet>
            ),
            lowStock: (
              <Portlet title="Low Stock Alerts" drag={dragProps('lowStock')}
                action={
                  lowStock.length > 0
                    ? <span className="badge badge-yellow">{lowStock.length} items</span>
                    : <span className="badge badge-green">All OK</span>
                }>
                {lowStock.length > 0 ? (
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Item Code</th><th>Item Name</th>
                        <th className="text-right">On Hand</th>
                        <th className="text-right">Reorder Pt.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.slice(0, 6).map((item: any) => (
                        <tr key={item.item_code}>
                          <td className="font-mono text-sm text-blue-600">{item.item_code}</td>
                          <td className="text-slate-600 max-w-xs truncate">{item.name}</td>
                          <td className="text-right text-red-600 font-semibold">{formatNumber(item.qty_on_hand)}</td>
                          <td className="text-right text-slate-500">{formatNumber(item.reorder_point)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-5 text-center">
                    <CheckCircle size={20} className="text-emerald-500 mx-auto mb-1" />
                    <p className="text-base text-slate-500">All items are well-stocked</p>
                  </div>
                )}
              </Portlet>
            ),
            recentGL: (
              <Portlet title="Recent GL Transactions" drag={dragProps('recentGL')}
                action={<Link to="/accounting/journals" className="text-sm text-blue-600 hover:underline">View All</Link>}>
                {data?.recentTransactions?.length > 0 ? (
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Journal #</th><th>Date</th><th>Memo</th>
                        <th className="text-right">Debit</th><th className="text-right">Credit</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTransactions.slice(0, 8).map((txn: any, idx: number) => (
                        <tr key={idx}>
                          <td className="font-mono text-sm text-blue-600 font-medium">{txn.journal_number}</td>
                          <td className="text-sm text-slate-500">{txn.entry_date?.slice(0, 10)}</td>
                          <td className="text-slate-600 max-w-xs truncate">{txn.memo}</td>
                          <td className="text-right font-medium">{formatCurrency(txn.total_debit)}</td>
                          <td className="text-right font-medium">{formatCurrency(txn.total_credit)}</td>
                          <td><span className="badge badge-green">{txn.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-5 text-center text-base text-slate-400">No recent transactions</div>
                )}
              </Portlet>
            ),
          };
          return (
            <div className="px-8 py-5 max-w-[1800px] mx-auto">
              <div className="grid grid-cols-3 gap-4 items-start">
                {order.map(key => (
                  <div key={key} className={SPAN[key] || 'col-span-1'}>
                    {widgets[key]}
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
