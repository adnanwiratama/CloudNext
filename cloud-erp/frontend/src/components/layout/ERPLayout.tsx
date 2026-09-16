import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Bell, HelpCircle, ChevronDown, ChevronRight, LogOut,
  Settings, User, Plus, X, Home, Star, RefreshCw, MessageSquare, Grid,
  List,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// MENU DATA
// Issue #1: Click item → go to NEW form directly
//           Hover → show submenu with [New + List] links
// Issue #2: "Purchase Request" → "Purchase Requisitions"
// ─────────────────────────────────────────────────────────────────────────────
interface SubEntry  { label: string; path: string; isNew?: boolean; isList?: boolean; }
interface MenuItem  { label: string; newPath: string; listPath?: string; submenu?: SubEntry[]; }
interface NavMenu   { label: string; items: MenuItem[]; }

const NAV_MENUS: NavMenu[] = [
  {
    label: 'Transactions',
    items: [
      {
        label: 'Bank',
        newPath: '/bank/write-checks',
        submenu: [
          { label: 'New Write Check',    path: '/bank/write-checks',    isNew: true  },
          { label: 'Write Checks List',  path: '/bank/checks-list',     isList: true },
          { label: 'New Make Deposit',   path: '/bank/make-deposit',    isNew: true  },
          { label: 'Make Deposits List', path: '/bank/deposits-list',   isList: true },
          { label: 'New Transfer Funds', path: '/bank/transfer-funds',  isNew: true  },
          { label: 'Transfer Funds List',path: '/bank/transfers-list',  isList: true },
        ],
      },
      {
        label: 'Purchases',
        newPath: '/purchasing/orders/new',
        submenu: [
          { label: 'New Purchase Request',  path: '/purchasing/requisitions/new',  isNew: true  },
          { label: 'Purchase Requisitions', path: '/purchasing/requisitions',      isList: true },
          { label: 'New Purchase Order',    path: '/purchasing/orders/new',        isNew: true  },
          { label: 'Purchase Orders',       path: '/purchasing/orders',            isList: true },
          { label: 'New Items Receipt',     path: '/purchasing/receipts/new',      isNew: true  },
          { label: 'Items Receipts',        path: '/purchasing/receipts',          isList: true },
          { label: 'New Vendor Bill',       path: '/purchasing/bills/new',         isNew: true  },
          { label: 'Vendor Bills',          path: '/purchasing/bills',             isList: true },
          { label: 'New Bill Payment',      path: '/purchasing/payments/new',      isNew: true  },
          { label: 'Bill Payments',         path: '/purchasing/payments',          isList: true },
          { label: 'New Vendor Prepayment', path: '/purchasing/prepayments/new',   isNew: true  },
          { label: 'Vendor Prepayments',    path: '/purchasing/prepayments',       isList: true },
        ],
      },
      {
        label: 'Purchase Return',
        newPath: '/purchasing/vendor-returns/new',
        submenu: [
          { label: 'New Vendor Return',  path: '/purchasing/vendor-returns/new',  isNew: true  },
          { label: 'Vendor Returns',     path: '/purchasing/vendor-returns',      isList: true },
          { label: 'New Vendor Credit',  path: '/purchasing/vendor-credits/new',  isNew: true  },
          { label: 'Vendor Credits',     path: '/purchasing/vendor-credits',      isList: true },
        ],
      },
      {
        label: 'Sales',
        newPath: '/sales/orders/new',
        submenu: [
          { label: 'New Quotation',         path: '/sales/quotations/new',             isNew: true  },
          { label: 'Quotations',            path: '/sales/quotations',                 isList: true },
          { label: 'New Sales Order',       path: '/sales/orders/new',                 isNew: true  },
          { label: 'Sales Orders',          path: '/sales/orders',                     isList: true },
          { label: 'New Item Fulfillment',  path: '/sales/fulfillments/new',           isNew: true  },
          { label: 'Item Fulfillments',     path: '/sales/fulfillments',               isList: true },
          { label: 'New Invoice',           path: '/sales/invoices/new',               isNew: true  },
          { label: 'Invoices',              path: '/sales/invoices',                   isList: true },
          { label: 'New Customer Payment',  path: '/sales/payments/new',               isNew: true  },
          { label: 'Customer Payments',     path: '/sales/payments',                   isList: true },
          { label: 'New Customer Deposit',  path: '/sales/deposits/new',               isNew: true  },
          { label: 'Customer Deposits',     path: '/sales/deposits',                   isList: true },
        ],
      },
      {
        label: 'Sales Return',
        newPath: '/sales/return-authorizations/new',
        submenu: [
          { label: 'New Return Authorization', path: '/sales/return-authorizations/new', isNew: true  },
          { label: 'Return Authorizations',    path: '/sales/return-authorizations',     isList: true },
          { label: 'New Credit Memo',          path: '/sales/credit-memos/new',          isNew: true  },
          { label: 'Credit Memos',             path: '/sales/credit-memos',              isList: true },
          { label: 'New Refund Customer',      path: '/sales/refunds/new',               isNew: true  },
          { label: 'Customer Refunds',         path: '/sales/refunds',                   isList: true },
        ],
      },
      {
        label: 'Employee',
        newPath: '/employee/expenses/new',
        submenu: [
          { label: 'New Expense Report', path: '/employee/expenses/new', isNew: true  },
          { label: 'Expense Reports',    path: '/employee/expenses',     isList: true },
        ],
      },
      {
        label: 'Inventory',
        newPath: '/inventory/adjustments/new',
        submenu: [
          { label: 'New Inventory Adjustment', path: '/inventory/adjustments/new',    isNew: true  },
          { label: 'Inventory Adjustments',    path: '/inventory/adjustments',        isList: true },
          { label: 'New Transfer Inventory',   path: '/inventory/transfers/new',      isNew: true  },
          { label: 'Transfer Inventory',       path: '/inventory/transfers',          isList: true },
          { label: 'New Transfer Order',       path: '/inventory/transfer-orders/new',isNew: true  },
          { label: 'Transfer Orders',          path: '/inventory/transfer-orders',    isList: true },
          { label: 'New Transfer Bin',         path: '/inventory/transfer-bins/new',  isNew: true  },
          { label: 'Transfer Bins',            path: '/inventory/transfer-bins',      isList: true },
        ],
      },
      {
        label: 'Manufacturing',
        newPath: '/manufacturing/work-orders/new',
        submenu: [
          { label: 'New Work Order',       path: '/manufacturing/work-orders/new',     isNew: true  },
          { label: 'Work Orders',          path: '/manufacturing/work-orders',         isList: true },
          { label: 'New Assembly Build',   path: '/manufacturing/assembly-builds/new', isNew: true  },
          { label: 'Assembly Builds',      path: '/manufacturing/assembly-builds',     isList: true },
        ],
      },
      {
        label: 'Financial',
        newPath: '/accounting/journals/new',
        submenu: [
          { label: 'New Journal Entry', path: '/accounting/journals/new', isNew: true  },
          { label: 'Journal Entries',   path: '/accounting/journals',     isList: true },
        ],
      },
    ],
  },
  {
    label: 'Lists',
    items: [
      {
        label: 'Accounting',
        newPath: '/accounting/accounts',
        submenu: [
          { label: 'Accounts',               path: '/accounting/accounts',       isList: true },
          { label: 'Currencies',             path: '/settings/currencies',       isList: true },
          { label: 'Currency Exchange Rates',path: '/settings/exchange-rates',   isList: true },
          { label: 'Items',                  path: '/items',                     isList: true },
          { label: 'Unit Of Measure',        path: '/settings/uom',              isList: true },
        ],
      },
      {
        label: 'Supply Chain',
        newPath: '/manufacturing/boms',
        submenu: [
          { label: 'Bins',              path: '/settings/bins',          isList: true },
          { label: 'Bills Of Material', path: '/manufacturing/boms',     isList: true },
        ],
      },
      {
        label: 'Employees',
        newPath: '/lists/employees',
        submenu: [
          { label: 'Employees', path: '/lists/employees', isList: true },
        ],
      },
      {
        label: 'Relationship',
        newPath: '/customers',
        submenu: [
          { label: 'Customers', path: '/customers', isList: true },
          { label: 'Vendors',   path: '/vendors',   isList: true },
        ],
      },
    ],
  },
  {
    label: 'Reports',
    items: [
      {
        label: 'Sales Order',
        newPath: '/reports/sales-order-by-customer',
        submenu: [
          { label: 'Sales Order by Customer', path: '/reports/sales-order-by-customer', isList: true },
          { label: 'Sales Order by Items',    path: '/reports/sales-order-by-items',    isList: true },
          { label: 'Sales Order by Sales Rep',path: '/reports/sales-order-by-rep',      isList: true },
        ],
      },
      {
        label: 'Sales',
        newPath: '/reports/sales-by-customer',
        submenu: [
          { label: 'Sales by Customer', path: '/reports/sales-by-customer', isList: true },
          { label: 'Sales by Items',    path: '/reports/sales-by-items',    isList: true },
          { label: 'Sales by Sales Rep',path: '/reports/sales-by-rep',      isList: true },
        ],
      },
      {
        label: 'Receivables',
        newPath: '/accounting/reports/ar-aging',
        submenu: [
          { label: 'A/R Aging Summary', path: '/accounting/reports/ar-aging',        isList: true },
          { label: 'A/R Aging Detail',  path: '/accounting/reports/ar-aging-detail', isList: true },
        ],
      },
      {
        label: 'Purchase Order',
        newPath: '/reports/po-by-vendor',
        submenu: [
          { label: 'Purchase Order by Customer', path: '/reports/po-by-vendor',   isList: true },
          { label: 'Purchase Order by Items',    path: '/reports/po-by-items',    isList: true },
        ],
      },
      {
        label: 'Purchases',
        newPath: '/reports/purchases-by-vendor',
        submenu: [
          { label: 'Purchases by Customer',      path: '/reports/purchases-by-vendor', isList: true },
          { label: 'Purchases by Items',         path: '/reports/purchases-by-items',  isList: true },
          { label: 'Purchases by Purchases Rep', path: '/reports/purchases-by-rep',    isList: true },
        ],
      },
      {
        label: 'Payables',
        newPath: '/accounting/reports/ap-aging',
        submenu: [
          { label: 'A/P Aging Summary', path: '/accounting/reports/ap-aging',        isList: true },
          { label: 'A/P Aging Detail',  path: '/accounting/reports/ap-aging-detail', isList: true },
        ],
      },
      {
        label: 'Inventory',
        newPath: '/reports/stock-onhand',
        submenu: [
          { label: 'Stock Onhand',           path: '/reports/stock-onhand',       isList: true },
          { label: 'Stock Ledger',           path: '/reports/stock-ledger',       isList: true },
          { label: 'Inventory Valuation',    path: '/reports/inventory',          isList: true },
          { label: 'Inventory Activity Detail', path: '/reports/inventory-activity', isList: true },
        ],
      },
      {
        label: 'Financial',
        newPath: '/accounting/reports/profit-loss',
        submenu: [
          { label: 'Profit & Loss',  path: '/accounting/reports/profit-loss',    isList: true },
          { label: 'Balance Sheet',  path: '/accounting/reports/balance-sheet',  isList: true },
          { label: 'General Ledger', path: '/accounting/reports/general-ledger', isList: true },
          { label: 'Trial Balance',  path: '/accounting/reports/trial-balance',  isList: true },
          { label: 'Cash Flow',      path: '/accounting/reports/cash-flow',      isList: true },
        ],
      },
    ],
  },
  {
    label: 'Analytics',
    items: [{ label: 'Dashboard', newPath: '/', listPath: '/' }],
  },
  {
    label: 'Documents',
    items: [
      {
        label: 'File Cabinet',
        newPath: '/documents/file-cabinet',
        submenu: [
          { label: 'File Cabinet', path: '/documents/file-cabinet', isList: true },
        ],
      },
    ],
  },
  {
    label: 'Setup',
    items: [
      {
        label: 'Company',
        newPath: '/settings/company',
        submenu: [
          { label: 'Company Information', path: '/settings/company',     isList: true },
          { label: 'Departments',         path: '/settings/departments', isList: true },
          { label: 'Locations',           path: '/settings/locations',   isList: true },
        ],
      },
      {
        label: 'Accounting',
        newPath: '/settings/accounting-periods',
        submenu: [
          { label: 'Manage Accounting Periods', path: '/settings/accounting-periods', isList: true },
          { label: 'Tax Code',                  path: '/settings/tax-codes',          isList: true },
        ],
      },
      {
        label: 'Import/Export',
        newPath: '/settings/import-csv',
        submenu: [
          { label: 'Import CSV Record', path: '/settings/import-csv',       isList: true },
          { label: 'Saved CSV Import',  path: '/settings/saved-csv-import', isList: true },
        ],
      },
      {
        label: 'Users/Roles',
        newPath: '/settings/users',
        submenu: [
          { label: 'Manage Users', path: '/settings/users', isList: true },
          { label: 'Manager Roles',path: '/settings/roles', isList: true },
        ],
      },
    ],
  },
  {
    label: 'Customization',
    items: [
      {
        label: 'Custom Scripts',
        newPath: '/customization/scripts',
        submenu: [
          { label: 'Custom Scripts', path: '/customization/scripts', isList: true },
        ],
      },
    ],
  },
];

const QUICK_CREATE = [
  { label: 'Sales Order',        path: '/sales/orders/new' },
  { label: 'Purchase Order',     path: '/purchasing/orders/new' },
  { label: 'Invoice',            path: '/sales/invoices/new' },
  { label: 'Customer Payment',   path: '/sales/payments/new' },
  { label: 'Bill Payment',       path: '/purchasing/payments/new' },
  { label: 'Journal Entry',      path: '/accounting/journals/new' },
  { label: 'Item Fulfillment',   path: '/sales/fulfillments/new' },
  { label: 'Items Receipt',      path: '/purchasing/receipts/new' },
  { label: 'Vendor Prepayment',  path: '/purchasing/prepayments/new' },
  { label: 'Customer Deposit',   path: '/sales/deposits/new' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ERPLayout() {
  const { user, logout } = useAuthStore();
  const navigate          = useNavigate();
  const location          = useLocation();

  const [activeMenu,    setActiveMenu]   = useState<string | null>(null);
  const [hoveredItem,   setHoveredItem]  = useState<string | null>(null);
  const [userMenuOpen,  setUserMenuOpen] = useState(false);
  const [createOpen,    setCreateOpen]   = useState(false);
  const [searchOpen,    setSearchOpen]   = useState(false);
  const [searchQuery,   setSearchQuery]  = useState('');
  const [searchResults, setResults]      = useState<any[]>([]);
  const [notifOpen,     setNotifOpen]    = useState(false);

  const menuRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/api/settings/notifications').then(r => r.data.data),
    refetchInterval: 60000,
  });
  const unread = notifData?.filter((n: any) => !n.is_read).length || 0;

  const { data: dashData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/reports/dashboard').then(r => r.data.data),
    staleTime: 60000,
  });
  const pending = (dashData?.pendingPO || 0) + (dashData?.pendingBills || 0);

  useEffect(() => {
    if (searchQuery.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await api.get(`/api/reports/search?q=${encodeURIComponent(searchQuery)}`); setResults(r.data.data || []); }
      catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current   && !menuRef.current.contains(e.target as Node))   { setActiveMenu(null); setHoveredItem(null); }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) { setSearchOpen(false); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    setActiveMenu(null); setHoveredItem(null);
    setUserMenuOpen(false); setCreateOpen(false); setSearchOpen(false);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); toast.success('Logged out'); };

  const iconFor = (type: string) => {
    const icons: Record<string, string> = {
      customer:'👤', vendor:'🏢', item:'📦', sales_order:'🛒', 
      invoice:'📄', purchase_order:'🚚', work_order:'⚙️'
    };
    return icons[type] || '📋';
  };
  
  const pathFor = (r: any) => {
    const paths: Record<string, string> = {
      customer:`/customers/${r.id}`, vendor:`/vendors/${r.id}`, item:`/items/${r.id}`,
      sales_order:`/sales/orders/${r.id}`, invoice:`/sales/invoices/${r.id}`,
      purchase_order:`/purchasing/orders/${r.id}`, work_order:`/manufacturing/work-orders/${r.id}`,
    };
    return paths[r.type];
  };

  return (
    <div className="flex flex-col h-screen bg-erp-bg-page overflow-hidden">

      {/* ═══ ROW 1: TOP HEADER ═══ */}
      <header className="h-11 bg-white flex items-center px-0 flex-shrink-0 shadow-sm border-b border-slate-200 z-50">
        <Link to="/" className="flex items-center gap-2 px-4 h-full border-r border-slate-200 flex-shrink-0 hover:bg-slate-50 transition-colors">
          <div className="w-6 h-6 bg-blue-500 flex items-center justify-center" style={{borderRadius:'3px'}}>
            <span className="text-white text-xs font-black">CN</span>
          </div>
          <div>
            <div className="text-slate-800 font-bold text-sm leading-none">CloudNext</div>
            <div className="text-slate-500 text-2xs leading-none">ERP Platform</div>
          </div>
        </Link>

        <div className="flex items-center h-full border-r border-slate-200 px-1 flex-shrink-0">
          <Link to="/" className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Home"><Home size={15} /></Link>
          <button className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Favorites"><Star size={15} /></button>
          <button onClick={() => window.location.reload()} className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Refresh"><RefreshCw size={14} /></button>
        </div>

        {/* Search */}
        <div ref={searchRef} className="flex-1 px-3 max-w-2xl relative">
          <div onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded cursor-text hover:bg-slate-100 focus-within:bg-white focus-within:border-blue-400 transition-all">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search customers, orders, invoices, items..."
              className="flex-1 bg-transparent text-slate-700 placeholder-slate-400 text-sm outline-none min-w-0" />
            {searchQuery && <button onClick={() => { setSearchQuery(''); setResults([]); }} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>}
          </div>
          {searchOpen && (searchResults.length > 0 || !searchQuery) && (
            <div className="absolute top-full left-3 right-3 mt-0.5 bg-white border border-slate-200 shadow-mega z-50 rounded-sm">
              {!searchQuery ? (
                <div className="px-3 py-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Recent Searches</div>
                  {['Sales Orders','PT ABC Indonesia','INV-2026-000001'].map(s => (
                    <button key={s} onClick={() => setSearchQuery(s)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 text-left">
                      <Search size={12} className="text-slate-400" />{s}
                    </button>
                  ))}
                </div>
              ) : searchResults.map((r, i) => (
                <button key={i} onClick={() => { const p = pathFor(r); if (p) { navigate(p); setSearchQuery(''); setSearchOpen(false); } }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0">
                  <span className="w-5">{iconFor(r.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{r.type?.replace(/_/g,' ')} · {r.number}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right toolbar */}
        <div className="flex items-center h-full gap-0.5 px-2 flex-shrink-0">
          {/* Quick create */}
          <div className="relative">
            <button onClick={() => setCreateOpen(!createOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors mr-1">
              <Plus size={13} /> Create
            </button>
            {createOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-52 bg-white border border-slate-200 shadow-mega z-50 rounded-sm py-1">
                {QUICK_CREATE.map(item => (
                  <Link key={item.path} to={item.path}
                    className="flex items-center px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700">{item.label}</Link>
                ))}
              </div>
            )}
          </div>

          <button className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Help"><HelpCircle size={15} /></button>
          <button className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Feedback"><MessageSquare size={15} /></button>

          {/* Notifications */}
          <div className="relative">
            <button onClick={() => setNotifOpen(!notifOpen)} className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100 relative">
              <Bell size={15} />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-2xs rounded-full flex items-center justify-center font-bold">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-80 bg-white border border-slate-200 shadow-mega z-50 rounded-sm">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <span className="text-sm font-semibold text-slate-800">Notifications</span>
                  <button className="text-xs text-blue-600 hover:underline">Mark all read</button>
                </div>
                {unread === 0
                  ? <div className="px-4 py-6 text-center text-sm text-slate-500">No new notifications</div>
                  : (notifData || []).slice(0,6).map((n: any) => (
                    <div key={n.id} className={`px-3 py-2.5 border-b border-slate-50 text-xs hover:bg-slate-50 ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                      <div className="font-medium text-slate-700">{n.title}</div>
                      <div className="text-slate-500 mt-0.5">{n.message}</div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 mx-1" />

          {/* User */}
          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-semibold">{user?.name?.charAt(0)?.toUpperCase()}</span>
              </div>
              <div className="hidden lg:block leading-tight">
                <div className="text-slate-700 text-xs font-medium">{user?.name}</div>
                <div className="text-slate-500 text-2xs">{user?.companyCode} · {user?.roleName || 'Administrator'}</div>
              </div>
              <ChevronDown size={11} className="text-slate-500" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-56 bg-white border border-slate-200 shadow-mega z-50 rounded-sm">
                <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
                  <div className="text-xs text-slate-500">{user?.email}</div>
                  <div className="text-xs text-blue-600 mt-0.5">{user?.companyName}</div>
                </div>
                {[
                  { icon: <User size={13}/>,     label: 'My Profile',  path: '/settings' },
                  { icon: <Settings size={13}/>, label: 'Preferences', path: '/settings' },
                  { icon: <Grid size={13}/>,     label: 'Setup',       path: '/settings' },
                ].map(item => (
                  <Link key={item.label} to={item.path} onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    {item.icon} {item.label}
                  </Link>
                ))}
                <div className="border-t border-slate-100">
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={13}/> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══ ROW 2: NAV BAR ═══ */}
      <div ref={menuRef} className="bg-erp-subnav h-9 flex items-stretch flex-shrink-0 z-40 relative shadow-sm">
        <Link to="/"
          className={`flex items-center gap-1.5 px-4 text-sm font-medium transition-colors ${location.pathname === '/' ? 'bg-white text-slate-800' : 'text-white hover:bg-erp-subnav-hover'}`}>
          <Home size={14}/><span>Home</span>
        </Link>

        {NAV_MENUS.map(menu => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => setActiveMenu(menu.label)}
              className={`flex items-center gap-1 px-3 h-full text-sm font-medium transition-colors ${activeMenu === menu.label ? 'bg-white text-slate-800' : 'text-white hover:bg-erp-subnav-hover'}`}>
              <span>{menu.label}</span>
              <ChevronDown size={11} className={`transition-transform ${activeMenu === menu.label ? 'rotate-180' : ''}`}/>
              {menu.label === 'Transactions' && pending > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-2xs rounded-full font-bold">{pending}</span>
              )}
            </button>

            {/* Vertical dropdown */}
            {activeMenu === menu.label && (
              <div
                className="absolute top-full left-0 bg-white border border-slate-200 shadow-mega z-50 w-52 py-1"
                style={{borderRadius:'0 0 3px 3px'}}
                onMouseLeave={() => { setActiveMenu(null); setHoveredItem(null); }}
              >
                {menu.items.map(item => (
                  <div key={item.label} className="relative"
                    onMouseEnter={() => item.submenu ? setHoveredItem(item.label) : setHoveredItem(null)}
                    onMouseLeave={() => item.submenu && setHoveredItem(null)}
                  >
                    {/* Click → go directly to form (newPath) */}
                    <Link to={item.newPath}
                      className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                      <span>{item.label}</span>
                      {item.submenu && <ChevronRight size={13} className="text-slate-400"/>}
                    </Link>

                    {/* Submenu: Only List entries (no "New") */}
                    {item.submenu && hoveredItem === item.label && (
                      <div
                        className="absolute left-full top-0 bg-white border border-slate-200 shadow-mega z-50 w-60 py-1 -ml-px"
                        style={{borderRadius:'0 3px 3px 0'}}
                        onMouseEnter={() => setHoveredItem(item.label)}
                      >
                        {item.submenu
                          .filter(sub => sub.isList)
                          .map(sub => (
                            <Link key={sub.path} to={sub.path}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                              <span>{sub.label.replace(' List', '').replace('s List', 's')}</span>
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex-1"/>
        <div className="flex items-center px-4 text-xs text-white border-l border-white/20">
          <span>{user?.companyName || 'CloudNext ERP'}</span>
        </div>
      </div>

      {(activeMenu || userMenuOpen || createOpen || notifOpen) && (
        <div className="fixed inset-0 z-30"
          onClick={() => { setActiveMenu(null); setHoveredItem(null); setUserMenuOpen(false); setCreateOpen(false); setNotifOpen(false); }}/>
      )}

      <main className="flex-1 overflow-auto bg-erp-bg-page">
        <Outlet/>
      </main>
    </div>
  );
}
