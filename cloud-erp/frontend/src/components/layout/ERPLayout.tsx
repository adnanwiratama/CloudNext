import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Bell, HelpCircle, ChevronDown, ChevronRight, LogOut,
  Settings, User, Plus, X, Home, Star, RefreshCw, MessageSquare, Grid,
  List, History, Menu,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { usePermissions } from '../../hooks/usePermissions';

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
          { label: 'New Expense Payment', path: '/employee/expense-payments/new', isNew: true  },
          { label: 'Expense Payments',    path: '/employee/expense-payments',     isList: true },
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
          { label: 'Unit Of Measure',        path: '/settings/uom',              isList: true },
        ],
      },
      {
        label: 'Items',
        newPath: '/items/new',
        submenu: [
          { label: 'New Item', path: '/items/new', isNew: true  },
          { label: 'Items',    path: '/items',     isList: true },
        ],
      },
      {
        label: 'Supply Chain',
        newPath: '/manufacturing/boms',
        submenu: [
          { label: 'Bills Of Material', path: '/manufacturing/boms',     isList: true },
        ],
      },
      {
        label: 'Employees',
        newPath: '/lists/employees/new',
        submenu: [
          { label: 'New Employee', path: '/lists/employees/new', isNew: true  },
          { label: 'Employees',    path: '/lists/employees',     isList: true },
        ],
      },
      {
        label: 'Relationship',
        newPath: '/customers/new',
        submenu: [
          { label: 'New Customer', path: '/customers/new', isNew: true  },
          { label: 'Customers',    path: '/customers',     isList: true },
          { label: 'New Vendor',   path: '/vendors/new',   isNew: true  },
          { label: 'Vendors',      path: '/vendors',       isList: true },
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
          { label: 'A/R Aging Summary', path: '/accounting/reports/ar-aging', isList: true },
          { label: 'A/R Aging Detail',  path: '/reports/ar-aging-detail',     isList: true },
        ],
      },
      {
        label: 'Purchase Order',
        newPath: '/reports/po-by-customer',
        submenu: [
          { label: 'Purchase Order by Vendor', path: '/reports/po-by-customer', isList: true },
          { label: 'Purchase Order by Items',  path: '/reports/po-by-items',    isList: true },
        ],
      },
      {
        label: 'Purchases',
        newPath: '/reports/purchases-by-customer',
        submenu: [
          { label: 'Purchases by Vendor',        path: '/reports/purchases-by-customer', isList: true },
          { label: 'Purchases by Items',         path: '/reports/purchases-by-items',    isList: true },
          { label: 'Purchases by Purchases Rep', path: '/reports/purchases-by-rep',      isList: true },
        ],
      },
      {
        label: 'Payables',
        newPath: '/accounting/reports/ap-aging',
        submenu: [
          { label: 'A/P Aging Summary', path: '/accounting/reports/ap-aging', isList: true },
          { label: 'A/P Aging Detail',  path: '/reports/ap-aging-detail',     isList: true },
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
        label: 'Auto Generated Number',
        newPath: '/settings/auto-numbers',
        submenu: [
          { label: 'Auto Generated Number', path: '/settings/auto-numbers', isList: true },
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

// Maps a menu path to its role-matrix permission key. If a path has no mapping
// here, it is never hidden by the role filter (backward compatible). A NONE
// level on the mapped key hides the menu entry entirely (per spec).
const PATH_PERM: { prefix: string; key: string }[] = [
  // Bank
  { prefix: '/bank/write-checks',  key: 'check' },
  { prefix: '/bank/checks-list',   key: 'check' },
  { prefix: '/bank/make-deposit',  key: 'deposit' },
  { prefix: '/bank/deposits-list', key: 'deposit' },
  { prefix: '/bank/transfer-funds', key: 'transfer_order' },
  { prefix: '/bank/transfers-list', key: 'transfer_order' },
  // Purchases
  { prefix: '/purchasing/requisitions', key: 'purchase_requisition' },
  { prefix: '/purchasing/orders',       key: 'purchase_order' },
  { prefix: '/purchasing/receipts',     key: 'item_receipt' },
  { prefix: '/purchasing/bills',        key: 'vendor_bill' },
  { prefix: '/purchasing/payments',     key: 'bill_payment' },
  { prefix: '/purchasing/prepayments',  key: 'bill_payment' },
  { prefix: '/purchasing/vendor-returns', key: 'vendor_return' },
  { prefix: '/purchasing/vendor-credits', key: 'vendor_credit' },
  // Sales
  { prefix: '/sales/quotations',  key: 'quotation' },
  { prefix: '/sales/orders',      key: 'sales_order' },
  { prefix: '/sales/fulfillments', key: 'item_fulfillment' },
  { prefix: '/sales/invoices',    key: 'invoice' },
  { prefix: '/sales/payments',    key: 'customer_payment' },
  { prefix: '/sales/deposits',    key: 'deposit' },
  { prefix: '/sales/return-authorizations', key: 'return_authorization' },
  { prefix: '/sales/credit-memos', key: 'credit_memo' },
  { prefix: '/sales/refunds',     key: 'customer_refund' },
  // Employee
  { prefix: '/employee/expense-payments', key: 'expense_report' },
  { prefix: '/employee/expenses', key: 'expense_report' },
  // Inventory
  { prefix: '/inventory/adjustments',    key: 'inventory_adjustment' },
  { prefix: '/inventory/transfer-orders', key: 'transfer_order' },
  { prefix: '/inventory/transfers',      key: 'transfer_order' },
  // Manufacturing
  { prefix: '/manufacturing/work-orders',     key: 'work_order' },
  { prefix: '/manufacturing/assembly-builds', key: 'work_order' },
  { prefix: '/manufacturing/boms',            key: 'bom' },
  // Financial
  { prefix: '/accounting/journals', key: 'journal_entry' },
  // Lists
  { prefix: '/items',    key: 'item' },
  { prefix: '/lists/employees', key: 'employee' },
  { prefix: '/customers', key: 'customer' },
  { prefix: '/vendors',   key: 'vendor' },
];

// Longest-prefix match so '/purchasing/orders' wins over a shorter prefix.
function permKeyForPath(path: string): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const { prefix, key } of PATH_PERM) {
    if ((path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix)) && prefix.length > bestLen) {
      best = key; bestLen = prefix.length;
    }
  }
  return best;
}

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
  const { canView }       = usePermissions();

  // Hide a path when its mapped permission level is NONE (canView=false).
  // Unmapped paths are always visible.
  const pathVisible = (path: string) => {
    const key = permKeyForPath(path);
    return key ? canView(key) : true;
  };

  // Build the role-filtered menu tree:
  //  - drop submenu entries whose path is NONE
  //  - drop a MenuItem if its own path is NONE AND it has no visible submenu entries
  //  - drop a NavMenu if it ends up with no visible items
  const visibleMenus: NavMenu[] = NAV_MENUS.map(menu => {
    const items = menu.items.map(item => {
      const sub = item.submenu?.filter(s => pathVisible(s.path));
      const ownVisible = pathVisible(item.newPath) || (item.listPath ? pathVisible(item.listPath) : false);
      // keep item if it has visible submenu entries, or (no submenu) its own path is visible
      if (item.submenu) {
        if (!sub || sub.length === 0) return null;
        return { ...item, submenu: sub };
      }
      return ownVisible ? item : null;
    }).filter(Boolean) as MenuItem[];
    return { ...menu, items };
  }).filter(menu => menu.items.length > 0);

  const [activeMenu,    setActiveMenu]   = useState<string | null>(null);
  const [hoveredItem,   setHoveredItem]  = useState<string | null>(null);
  const [hoveredLeaf,   setHoveredLeaf]  = useState<string | null>(null);
  const [userMenuOpen,  setUserMenuOpen] = useState(false);
  const [createOpen,    setCreateOpen]   = useState(false);
  const [searchOpen,    setSearchOpen]   = useState(false);
  const [searchQuery,   setSearchQuery]  = useState('');
  const [searchResults, setResults]      = useState<any[]>([]);
  const [notifOpen,     setNotifOpen]    = useState(false);
  // Mobile navigation drawer (tap-friendly replacement for the hover menus).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [mobileExpandedItem, setMobileExpandedItem] = useState<string | null>(null);

  const menuRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Company logo (shown in the header next to the CloudNext mark).
  const { data: companyLogo } = useQuery({
    queryKey: ['company-logo'],
    queryFn: () => api.get('/api/settings/company').then(r => r.data.data?.logo_url || null),
    staleTime: 5 * 60 * 1000,
  });

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
    setActiveMenu(null); setHoveredItem(null); setHoveredLeaf(null);
    setUserMenuOpen(false); setCreateOpen(false); setSearchOpen(false);
    setMobileNavOpen(false); setMobileExpanded(null); setMobileExpandedItem(null);
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
      <header className="h-16 bg-white flex items-center px-0 flex-shrink-0 shadow-sm border-b border-slate-200 z-50">
        {/* Hamburger — mobile only (opens the tap-friendly nav drawer) */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="lg:hidden flex items-center justify-center w-11 h-full border-r border-slate-200 text-slate-600 hover:bg-slate-50 flex-shrink-0"
          title="Menu" aria-label="Open menu">
          <Menu size={20} />
        </button>

        {/* SECTION 1 (fixed): CloudNext ERP product logo — links home, never changes.
            Falls back to a text logo until /cloudnext-logo.png is added to public/. */}
        <Link to="/" className="flex items-center px-4 h-full border-r border-slate-200 flex-shrink-0 hover:bg-slate-50 transition-colors">
          <img src="/cloudnext-logo.png" alt="CloudNext ERP"
            className="h-10 max-w-[220px] object-contain"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              (img.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
            }} />
          {/* Fallback text brand (hidden once the image loads) */}
          <div className="items-center gap-2" style={{ display: 'none' }}>
            <div className="w-9 h-9 bg-blue-600 flex items-center justify-center rounded">
              <span className="text-white text-sm font-black">CN</span>
            </div>
            <div className="leading-none">
              <div className="text-slate-800 font-bold text-base">CloudNext</div>
              <div className="text-slate-400 text-2xs">ERP</div>
            </div>
          </div>
        </Link>

        {/* SECTION 2 (dynamic): customer company logo from Company Information upload */}
        {companyLogo && (
          <div className="flex items-center px-4 h-full border-r border-slate-200 flex-shrink-0">
            <img src={companyLogo} alt="Company logo" className="h-10 max-w-[200px] object-contain" />
          </div>
        )}

        <div className="flex items-center h-full border-r border-slate-200 px-1 flex-shrink-0">
          <Link to="/" className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Home"><Home size={15} /></Link>
          <button className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Favorites"><Star size={15} /></button>
          <button onClick={() => window.location.reload()} className="flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100" title="Refresh"><RefreshCw size={14} /></button>
        </div>

        {/* Search — hidden on mobile to save header space */}
        <div ref={searchRef} className="hidden lg:block px-3 w-full max-w-md relative">
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

        {/* Spacer pushes the Create → user/role cluster to the far right */}
        <div className="flex-1" />

        {/* Right toolbar: Create → Help → Feedback → Notifications → User/Role (flush right) */}
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

      {/* ═══ ROW 2: NAV BAR (NetSuite-style slate-blue bar) — desktop only ═══ */}
      <div ref={menuRef} className="bg-erp-subnav h-10 hidden lg:flex items-stretch flex-shrink-0 z-40 relative shadow-sm">
        {/* Left icon group: history / favorites / home */}
        <div className="flex items-stretch">
          <button onClick={() => navigate(-1)} className="flex items-center justify-center px-2.5 text-white/90 hover:bg-erp-subnav-hover transition-colors" title="Back">
            <History size={16}/>
          </button>
          <button className="flex items-center justify-center px-2.5 text-white/90 hover:bg-erp-subnav-hover transition-colors" title="Favorites">
            <Star size={16}/>
          </button>
          <Link to="/"
            className={`flex items-center justify-center px-3 transition-colors ${location.pathname === '/' ? 'bg-white text-slate-800' : 'text-white/90 hover:bg-erp-subnav-hover'}`} title="Home">
            <Home size={16}/>
          </Link>
        </div>

        {visibleMenus.map(menu => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => setActiveMenu(menu.label)}
              className={`flex items-center gap-1 px-4 h-full text-sm font-normal transition-colors ${activeMenu === menu.label ? 'bg-white text-slate-800' : 'text-white hover:bg-erp-subnav-hover'}`}>
              <span>{menu.label}</span>
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
                {menu.items.map(item => {
                  // Use the New-form + "List" sub-flyout pattern for any group that
                  // has explicit "New" entries (all of Transactions, plus the Lists
                  // records Customer/Vendor/Employee/Items). Pure list groups
                  // (Reports, Accounting master data, …) just render their links.
                  const newEntries = (item.submenu || []).filter(s => s.isNew);
                  const isTxn = newEntries.length > 0;
                  const listEntries = (item.submenu || []).filter(s => s.isList);
                  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const leaves = newEntries.length
                    ? newEntries.map(ne => {
                        const name = ne.label.replace(/^New\s+/i, '').trim();
                        // Pair by PATH first (reliable across plural/word-order label
                        // differences): "/x/new" ↔ "/x". Fall back to label matching.
                        const basePath = ne.path.replace(/\/new$/i, '');
                        const list = listEntries.find(le => le.path === basePath)
                          || listEntries.find(le =>
                              norm(le.label).includes(norm(name)) || norm(name).includes(norm(le.label.replace(/s?\s*list$/i, ''))));
                        return { key: `${item.label}:${ne.label}`, name, newPath: ne.path, listPath: list?.path };
                      })
                    : [{ key: `${item.label}:self`, name: item.label, newPath: item.newPath, listPath: listEntries[0]?.path }];

                  return (
                    <div key={item.label} className="relative"
                      onMouseEnter={() => item.submenu ? setHoveredItem(item.label) : setHoveredItem(null)}
                      onMouseLeave={() => { if (item.submenu) { setHoveredItem(null); setHoveredLeaf(null); } }}
                    >
                      {/* Group row → clicking opens the group default page/form */}
                      <Link to={item.newPath}
                        className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                        <span>{item.label}</span>
                        {item.submenu && <ChevronRight size={13} className="text-slate-400"/>}
                      </Link>

                      {item.submenu && hoveredItem === item.label && (
                        <div
                          className="absolute left-full top-0 bg-white border border-slate-200 shadow-mega z-50 w-56 py-1 -ml-px"
                          style={{borderRadius:'0 3px 3px 0'}}
                          onMouseEnter={() => setHoveredItem(item.label)}
                        >
                          {isTxn
                            ? /* Transactions: each type → New form; hover → "List" flyout */
                              leaves.map(leaf => (
                                <div key={leaf.key} className="relative"
                                  onMouseEnter={() => setHoveredLeaf(leaf.key)}
                                  onMouseLeave={() => setHoveredLeaf(null)}
                                >
                                  <Link to={leaf.newPath}
                                    className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                                    <span>{leaf.name}</span>
                                    {leaf.listPath && <ChevronRight size={13} className="text-slate-400"/>}
                                  </Link>

                                  {leaf.listPath && hoveredLeaf === leaf.key && (
                                    <div
                                      className="absolute left-full top-0 bg-white border border-slate-200 shadow-mega z-50 w-40 py-1 -ml-px"
                                      style={{borderRadius:'0 3px 3px 0'}}
                                      onMouseEnter={() => setHoveredLeaf(leaf.key)}
                                    >
                                      <Link to={leaf.listPath}
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                        <span>List</span>
                                      </Link>
                                    </div>
                                  )}
                                </div>
                              ))
                            : /* Reports / Lists / Setup / etc.: plain links, no "List" level */
                              (item.submenu || []).filter(s => s.isList).map(sub => (
                                <Link key={sub.path} to={sub.path}
                                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                  <span>{sub.label}</span>
                                </Link>
                              ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {/* ═══ MOBILE NAV DRAWER (tap-friendly; lg:hidden) ═══ */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col">
            {/* Drawer header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-erp-subnav">
              <span className="text-white font-semibold text-sm">{user?.companyName || 'CloudNext ERP'}</span>
              <button onClick={() => setMobileNavOpen(false)} className="text-white/90 hover:text-white p-1" aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            {/* Mobile search */}
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-slate-700 placeholder-slate-400 text-sm outline-none min-w-0" />
              </div>
              {searchQuery.length >= 2 && searchResults.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded bg-white max-h-56 overflow-auto">
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => { const p = pathFor(r); if (p) { navigate(p); setMobileNavOpen(false); setSearchQuery(''); } }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0">
                      <span className="w-5">{iconFor(r.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 truncate">{r.name}</div>
                        <div className="text-xs text-slate-500 capitalize">{r.type?.replace(/_/g,' ')} · {r.number}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scrollable menu list */}
            <div className="flex-1 overflow-auto">
              <Link to="/" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 border-b border-slate-100 hover:bg-slate-50">
                <Home size={16} /> Home
              </Link>

              {visibleMenus.map(menu => {
                const open = mobileExpanded === menu.label;
                return (
                  <div key={menu.label} className="border-b border-slate-100">
                    {/* Top-level group */}
                    <button
                      onClick={() => { setMobileExpanded(open ? null : menu.label); setMobileExpandedItem(null); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                      <span>{menu.label}</span>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Group items */}
                    {open && (
                      <div className="bg-slate-50/60 pb-1">
                        {menu.items.map(item => {
                          const hasSub = !!item.submenu && item.submenu.length > 0;
                          const itemOpen = mobileExpandedItem === item.label;
                          if (!hasSub) {
                            return (
                              <Link key={item.label} to={item.newPath}
                                className="block px-6 py-2.5 text-sm text-slate-700 hover:bg-white">
                                {item.label}
                              </Link>
                            );
                          }
                          return (
                            <div key={item.label}>
                              <button
                                onClick={() => setMobileExpandedItem(itemOpen ? null : item.label)}
                                className="w-full flex items-center justify-between px-6 py-2.5 text-sm text-slate-700 hover:bg-white">
                                <span>{item.label}</span>
                                <ChevronRight size={14} className={`text-slate-400 transition-transform ${itemOpen ? 'rotate-90' : ''}`} />
                              </button>
                              {itemOpen && (
                                <div className="pb-1">
                                  {(item.submenu || []).map(sub => (
                                    <Link key={sub.path} to={sub.path}
                                      className="block pl-10 pr-4 py-2 text-sm text-slate-600 hover:bg-white">
                                      {sub.label}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Drawer footer: user + sign out */}
            <div className="border-t border-slate-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">{user?.name?.charAt(0)?.toUpperCase()}</span>
                </div>
                <div className="leading-tight min-w-0">
                  <div className="text-slate-700 text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-slate-500 text-xs truncate">{user?.companyCode} · {user?.roleName || 'Administrator'}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100">
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
