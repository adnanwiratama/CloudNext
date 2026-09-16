import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  RefreshCw, Loader2, ChevronDown, TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, Package, ShoppingCart, Truck, Factory, ArrowUpRight, ArrowDownRight,
  Bell, CheckCircle, Clock, XCircle, GripHorizontal, Minus, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// PORTLET WRAPPER  (NetSuite-style collapsible, draggable header)
// ─────────────────────────────────────────────────────────────────────────────
function Portlet({
  title, action, children, className = '', defaultOpen = true,
}: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
  className?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`portlet ${className}`}>
      <div className="portlet-header">
        <div className="flex items-center gap-2">
          <GripHorizontal size={13} className="text-slate-400 cursor-grab" />
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
function RemindersPortlet({ data }: { data: any }) {
  const navigate = useNavigate();
  const items = [
    { count: data?.pendingPO || 0,    label: 'Purchase Orders Pending Approval', path: '/purchasing/orders', color: 'text-amber-600' },
    { count: data?.pendingBills || 0, label: 'Vendor Bills Pending Approval',    path: '/purchasing/bills', color: 'text-orange-600' },
    { count: data?.openSOCount || 0,  label: 'Sales Orders Pending Fulfillment', path: '/sales/orders',     color: 'text-blue-600' },
    { count: data?.openAR > 0 ? Math.round(data.openAR / 5000000) : 0,
                                      label: 'Customer Payments Pending',         path: '/sales/payments',   color: 'text-purple-600' },
    { count: data?.openWOCount || 0,  label: 'Work Orders In Progress',           path: '/manufacturing/work-orders', color: 'text-teal-600' },
  ].filter(i => i.count > 0);

  if (items.length === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <CheckCircle size={22} className="text-emerald-500 mx-auto mb-2" />
        <p className="text-base text-slate-600 font-medium">All caught up!</p>
        <p className="text-sm text-slate-400 mt-1">No pending actions at this time.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item, i) => (
        <button key={i} onClick={() => navigate(item.path)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors group">
          <span className={`text-base font-bold w-8 text-right flex-shrink-0 ${item.color}`}>{item.count}</span>
          <span className="text-base text-blue-600 group-hover:underline flex-1">{item.label}</span>
          <ExternalLink size={12} className="text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL QUEUE PORTLET
// ─────────────────────────────────────────────────────────────────────────────
function ApprovalQueuePortlet({ data }: { data: any }) {
  const navigate = useNavigate();
  const items = [
    ...(data?.pendingPOList || []).slice(0, 3).map((p: any) => ({
      number: p.po_number, desc: p.vendor_name, amount: p.total_amount,
      type: 'PO', path: `/purchasing/orders/${p.id}`, color: 'badge-yellow',
    })),
    ...(data?.pendingBillList || []).slice(0, 2).map((b: any) => ({
      number: b.bill_number, desc: b.vendor_name, amount: b.total_amount,
      type: 'Bill', path: `/purchasing/bills/${b.id}`, color: 'badge-orange',
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
          <th>Type</th><th>Number</th><th>Description</th>
          <th className="text-right">Amount</th><th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="cursor-pointer" onClick={() => navigate(item.path)}>
            <td><span className={`badge ${item.color}`}>{item.type}</span></td>
            <td className="font-mono text-sm text-blue-600 font-medium">{item.number}</td>
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState('MTD');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/reports/dashboard').then(r => r.data.data),
    refetchInterval: 300000,
  });

  const kpis  = data?.kpis  || {};
  const charts = data?.charts || {};
  const topCustomers = data?.topCustomers || [];
  const lowStock     = data?.lowStock     || [];

  const revenueData = (charts.revenueByMonth || []).map((m: any) => ({
    month: m.month?.slice(5) || m.month,
    amount: parseFloat(m.amount) / 1_000_000,
  }));

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
        /* Content with LEFT MARGIN like NetSuite */
        <div className="px-8 py-5 max-w-[1800px] mx-auto space-y-4">

          {/* ── ROW 1: Reminders + KPI Summary ──────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">

            {/* Reminders portlet */}
            <Portlet title="Reminders">
              <RemindersPortlet data={{ ...kpis, ...data }} />
            </Portlet>

            {/* KPI Summary portlet */}
            <div className="col-span-2">
              <Portlet title="Key Performance Indicators"
                action={
                  <select className="text-sm border border-slate-300 rounded px-2 py-1 text-slate-600 bg-white">
                    <option>This Month</option>
                    <option>This Quarter</option>
                    <option>This Year</option>
                  </select>
                }>
                <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100 p-0">
                  <KPICard title="Revenue (MTD)"    value={formatCurrency(kpis.revenueMTD || 0)}   sub="+8.3% vs last mo" trend="up"  color="text-blue-600"    link="/accounting/reports/profit-loss" />
                  <KPICard title="Revenue (YTD)"    value={formatCurrency(kpis.revenueYTD || 0)}   sub="Year to date"     trend="neutral" color="text-blue-700" />
                  <KPICard title="Accounts Receivable" value={formatCurrency(kpis.openAR || 0)}    sub={kpis.overdueAR > 0 ? `${formatCurrency(kpis.overdueAR)} overdue` : 'No overdue'} trend={kpis.overdueAR > 0 ? 'down' : 'up'} color="text-violet-600" link="/accounting/reports/ar-aging" />
                  <KPICard title="Accounts Payable" value={formatCurrency(kpis.openAP || 0)}       sub="Open balance"     trend="neutral" color="text-orange-600"  link="/accounting/reports/ap-aging" />
                </div>
                <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100 border-t border-slate-100">
                  <KPICard title="Inventory Value"  value={formatCurrency(kpis.inventoryValue || 0)} sub="All locations"  trend="neutral" color="text-teal-600" />
                  <KPICard title="Open Sales Orders"  value={formatNumber(kpis.openSOCount || 0)}   sub="Pending fulfillment" trend="neutral" color="text-indigo-600" link="/sales/orders" />
                  <KPICard title="Open Purchase Orders" value={formatNumber(kpis.openPOCount || 0)} sub="Pending receipt"    trend="neutral" color="text-amber-600"   link="/purchasing/orders" />
                  <KPICard title="Open Work Orders"  value={formatNumber(kpis.openWOCount || 0)}    sub="In production"     trend="neutral" color="text-rose-600"    link="/manufacturing/work-orders" />
                </div>
              </Portlet>
            </div>
          </div>

          {/* ── ROW 2: Revenue Chart + Top Customers ──────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Portlet title="Revenue Trend — Last 12 Months">
                <div className="px-4 pb-4 pt-3">
                  {revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}    />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}M`} />
                        <Tooltip
                          formatter={(v: any) => [`Rp ${(v * 1_000_000).toLocaleString('id-ID')}`, 'Revenue']}
                          contentStyle={{ fontSize: 12, borderRadius: 2, border: '1px solid #e2e8f0' }}
                        />
                        <Area type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={1.5} fill="url(#revGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-base">
                      No revenue data available
                    </div>
                  )}
                </div>
              </Portlet>
            </div>

            <Portlet title="Top Customers (YTD)">
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
          </div>

          {/* ── ROW 3: Pending Approvals + Low Stock ──────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <Portlet title="Pending Approvals"
              action={<Link to="/purchasing/orders" className="text-sm text-blue-600 hover:underline">View All</Link>}>
              <ApprovalQueuePortlet data={data} />
            </Portlet>

            <Portlet title="Low Stock Alerts"
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
          </div>

          {/* ── ROW 4: Recent Transactions ──────────────────────────────── */}
          <Portlet title="Recent GL Transactions"
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

        </div>
      )}
    </div>
  );
}
