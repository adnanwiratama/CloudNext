import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import ERPLayout from './components/layout/ERPLayout';
import LoginPage from './pages/auth/LoginPage';
import Dashboard from './pages/dashboard/Dashboard';

// CRM
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';
import CustomerForm from './pages/customers/CustomerForm';
import VendorList from './pages/vendors/VendorList';
import VendorDetail from './pages/vendors/VendorDetail';
import VendorForm from './pages/vendors/VendorForm';

// Items
import ItemList from './pages/items/ItemList';
import ItemDetail from './pages/items/ItemDetail';
import ItemForm from './pages/items/ItemForm';

// Sales
import SalesOrderList from './pages/sales/SalesOrderList';
import SalesOrderDetail from './pages/sales/SalesOrderDetail';
import SalesOrderForm from './pages/sales/SalesOrderForm';
import InvoiceList from './pages/sales/InvoiceList';
import InvoiceDetail from './pages/sales/InvoiceDetail';
import InvoiceForm from './pages/sales/InvoiceForm';
import QuotationList from './pages/sales/QuotationList';
import QuotationForm from './pages/sales/QuotationForm';
import CustomerPaymentForm from './pages/sales/CustomerPaymentForm';
import CustomerPaymentList from './pages/sales/CustomerPaymentList';
import CustomerPaymentDetail from './pages/sales/CustomerPaymentDetail';
import CustomerDepositForm from './pages/sales/CustomerDepositForm';
import CustomerDepositList from './pages/sales/CustomerDepositList';
import RefundCustomerList from './pages/sales/RefundCustomerList';
import ItemFulfillmentList from './pages/sales/ItemFulfillmentList';
import ItemFulfillmentDetail from './pages/sales/ItemFulfillmentDetail';
import ItemFulfillmentForm from './pages/sales/ItemFulfillmentForm';
import ReturnAuthorizationForm from './pages/sales/ReturnAuthorizationForm';
import ReturnAuthorizationList from './pages/sales/ReturnAuthorizationList';
import CreditMemoForm from './pages/sales/CreditMemoForm';
import CreditMemoList from './pages/sales/CreditMemoList';
import RefundCustomerForm from './pages/sales/RefundCustomerForm';

// Purchasing
import PurchaseOrderList from './pages/purchasing/PurchaseOrderList';
import PurchaseOrderDetail from './pages/purchasing/PurchaseOrderDetail';
import PurchaseOrderForm from './pages/purchasing/PurchaseOrderForm';
import PurchaseRequisitionForm from './pages/purchasing/PurchaseRequisitionForm';
import GoodReceiptList from './pages/purchasing/GoodReceiptList';
import GoodReceiptDetail from './pages/purchasing/GoodReceiptDetail';
import GoodReceiptForm from './pages/purchasing/GoodReceiptForm';
import VendorBillList from './pages/purchasing/VendorBillList';
import VendorBillDetail from './pages/purchasing/VendorBillDetail';
import VendorBillForm from './pages/purchasing/VendorBillForm';
import BillPaymentList from './pages/purchasing/BillPaymentList';
import BillPaymentForm from './pages/purchasing/BillPaymentForm';
import BillPaymentDetail from './pages/purchasing/BillPaymentDetail';
import RequisitionList from './pages/purchasing/RequisitionList';
import VendorPrepaymentForm from './pages/purchasing/VendorPrepaymentForm';
import VendorPrepaymentList from './pages/purchasing/VendorPrepaymentList';
import VendorReturnForm from './pages/purchasing/VendorReturnForm';
import VendorReturnList from './pages/purchasing/VendorReturnList';
import VendorCreditForm from './pages/purchasing/VendorCreditForm';
import VendorCreditList from './pages/purchasing/VendorCreditList';

// Bank
import WriteChecksForm from './pages/bank/WriteChecksForm';
import WriteCheckDetail from './pages/bank/WriteCheckDetail';
import MakeDepositForm from './pages/bank/MakeDepositForm';
import TransferFundsForm from './pages/bank/TransferFundsForm';
import ChecksList from './pages/bank/ChecksList';
import DepositsList from './pages/bank/DepositsList';
import DepositDetail from './pages/bank/DepositDetail';
import TransfersList from './pages/bank/TransfersList';
import TransferDetail from './pages/bank/TransferDetail';

// Custom Forms
import CustomFormList from './pages/customforms/CustomFormList';
import CustomFormBuilder from './pages/customforms/CustomFormBuilder';

// Manufacturing
import BOMList from './pages/manufacturing/BOMList';
import BOMDetail from './pages/manufacturing/BOMDetail';
import BOMForm from './pages/manufacturing/BOMForm';
import WorkOrderList from './pages/manufacturing/WorkOrderList';
import WorkOrderDetail from './pages/manufacturing/WorkOrderDetail';
import WorkOrderForm from './pages/manufacturing/WorkOrderForm';
import WorkCenterList from './pages/manufacturing/WorkCenterList';
import AssemblyBuildForm from './pages/manufacturing/AssemblyBuildForm';

// Inventory
import InventoryAdjustmentForm from './pages/inventory/InventoryAdjustmentForm';
import TransferInventoryForm from './pages/inventory/TransferInventoryForm';
import TransferOrderForm from './pages/inventory/TransferOrderForm';
import InventoryAdjustmentList from './pages/inventory/InventoryAdjustmentList';
import TransferInventoryList from './pages/inventory/TransferInventoryList';
import TransferOrderList from './pages/inventory/TransferOrderList';
import TransferBinList from './pages/inventory/TransferBinList';

// Employee
import ExpenseReportList from './pages/employee/ExpenseReportList';
import ExpenseReportForm from './pages/employee/ExpenseReportForm';

// Accounting
import JournalList from './pages/accounting/JournalList';
import JournalDetail from './pages/accounting/JournalDetail';
import JournalEntryForm from './pages/accounting/JournalEntryForm';
import AccountList from './pages/accounting/AccountList';
import ProfitLossReport from './pages/accounting/ProfitLossReport';
import BalanceSheetReport from './pages/accounting/BalanceSheetReport';
import ARAgingReport from './pages/accounting/ARAgingReport';
import APAgingReport from './pages/accounting/APAgingReport';
import TrialBalanceReport from './pages/accounting/TrialBalanceReport';
import GeneralLedgerReport from './pages/accounting/GeneralLedgerReport';
import CashFlowReport from './pages/accounting/CashFlowReport';

// Reports
import InventoryReport from './pages/reports/InventoryReport';
import ManufacturingReport from './pages/reports/ManufacturingReport';
import MRPPage from './pages/reports/MRPPage';
import SalesReports from './pages/reports/SalesReports';
import PurchaseReports from './pages/reports/PurchaseReports';
import StockOnhandReport from './pages/reports/StockOnhandReport';
import StockLedgerReport from './pages/reports/StockLedgerReport';
import InventoryActivityReport from './pages/reports/InventoryActivityReport';

// Settings
import SettingsPage from './pages/settings/SettingsPage';
import UsersRolesPage from './pages/settings/UsersRolesPage';
import CompanySettingsPage from './pages/settings/CompanySettingsPage';
import AccountingPeriodsPage from './pages/settings/AccountingPeriodsPage';
import TaxCodePage from './pages/settings/TaxCodePage';
import DepartmentsPage from './pages/settings/DepartmentsPage';
import LocationsPage from './pages/settings/LocationsPage';
import ImportCSVPage from './pages/settings/ImportCSVPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

// Simple placeholder for routes not yet implemented
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">This page is coming soon.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      <Route path="/" element={<PrivateRoute><ERPLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />

        {/* ── CUSTOMERS ── */}
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerDetail />} />

        {/* ── VENDORS ── */}
        <Route path="vendors" element={<VendorList />} />
        <Route path="vendors/new" element={<VendorForm />} />
        <Route path="vendors/:id" element={<VendorDetail />} />

        {/* ── ITEMS ── */}
        <Route path="items" element={<ItemList />} />
        <Route path="items/new" element={<ItemForm />} />
        <Route path="items/:id" element={<ItemDetail />} />

        {/* ── BANK ── */}
        <Route path="bank/write-checks" element={<WriteChecksForm />} />
        <Route path="bank/checks/:id" element={<WriteCheckDetail />} />
        <Route path="bank/checks/:id/edit" element={<WriteChecksForm />} />
        <Route path="bank/checks-list" element={<ChecksList />} />

        {/* ── CUSTOMIZATION ── */}
        <Route path="customization/forms" element={<CustomFormList />} />
        <Route path="customization/forms/new" element={<CustomFormBuilder />} />
        <Route path="customization/forms/:id" element={<CustomFormBuilder />} />
        <Route path="bank/make-deposit" element={<MakeDepositForm />} />
        <Route path="bank/deposits-list" element={<DepositsList />} />
        <Route path="bank/deposits/:id" element={<DepositDetail />} />
        <Route path="bank/transfer-funds" element={<TransferFundsForm />} />
        <Route path="bank/transfers-list" element={<TransfersList />} />
        <Route path="bank/transfers/:id" element={<TransferDetail />} />

        {/* ── SALES ── */}
        <Route path="sales/quotations" element={<QuotationList />} />
        <Route path="sales/quotations/new" element={<QuotationForm />} />
        <Route path="sales/orders" element={<SalesOrderList />} />
        <Route path="sales/orders/new" element={<SalesOrderForm />} />
        <Route path="sales/orders/:id" element={<SalesOrderDetail />} />
        <Route path="sales/fulfillments" element={<ItemFulfillmentList />} />
        <Route path="sales/fulfillments/new" element={<ItemFulfillmentForm />} />
        <Route path="sales/fulfillments/:id" element={<ItemFulfillmentDetail />} />
        <Route path="sales/invoices" element={<InvoiceList />} />
        <Route path="sales/invoices/new" element={<InvoiceForm />} />
        <Route path="sales/invoices/:id" element={<InvoiceDetail />} />
        <Route path="sales/payments" element={<CustomerPaymentList />} />
        <Route path="sales/payments/new" element={<CustomerPaymentForm />} />
        <Route path="sales/payments/:id" element={<CustomerPaymentDetail />} />
        <Route path="sales/deposits" element={<CustomerDepositList />} />
        <Route path="sales/deposits/new" element={<CustomerDepositForm />} />
        <Route path="sales/return-authorizations" element={<ReturnAuthorizationList />} />
        <Route path="sales/return-authorizations/new" element={<ReturnAuthorizationForm />} />
        <Route path="sales/return-receipts" element={<ComingSoon title="Return Receipts" />} />
        <Route path="sales/credit-memos" element={<CreditMemoList />} />
        <Route path="sales/credit-memos/new" element={<CreditMemoForm />} />
        <Route path="sales/refunds" element={<RefundCustomerList />} />
        <Route path="sales/refunds/new" element={<RefundCustomerForm />} />

        {/* ── PURCHASING ── */}
        <Route path="purchasing/requisitions" element={<RequisitionList />} />
        <Route path="purchasing/requisitions/new" element={<PurchaseRequisitionForm />} />
        <Route path="purchasing/orders" element={<PurchaseOrderList />} />
        <Route path="purchasing/orders/new" element={<PurchaseOrderForm />} />
        <Route path="purchasing/orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="purchasing/receipts" element={<GoodReceiptList />} />
        <Route path="purchasing/receipts/new" element={<GoodReceiptForm />} />
        <Route path="purchasing/receipts/:id" element={<GoodReceiptDetail />} />
        <Route path="purchasing/bills" element={<VendorBillList />} />
        <Route path="purchasing/bills/new" element={<VendorBillForm />} />
        <Route path="purchasing/bills/:id" element={<VendorBillDetail />} />
        <Route path="purchasing/payments" element={<BillPaymentList />} />
        <Route path="purchasing/payments/new" element={<BillPaymentForm />} />
        <Route path="purchasing/payments/:id" element={<BillPaymentDetail />} />
        <Route path="purchasing/prepayments" element={<VendorPrepaymentList />} />
        <Route path="purchasing/prepayments/new" element={<VendorPrepaymentForm />} />
        <Route path="purchasing/vendor-returns" element={<VendorReturnList />} />
        <Route path="purchasing/vendor-returns/new" element={<VendorReturnForm />} />
        <Route path="purchasing/vendor-credits" element={<VendorCreditList />} />
        <Route path="purchasing/vendor-credits/new" element={<VendorCreditForm />} />

        {/* ── EMPLOYEE ── */}
        <Route path="employee/expenses" element={<ExpenseReportList />} />
        <Route path="employee/expenses/new" element={<ExpenseReportForm />} />

        {/* ── INVENTORY ── */}
        <Route path="inventory/adjustments" element={<InventoryAdjustmentList />} />
        <Route path="inventory/adjustments/new" element={<InventoryAdjustmentForm />} />
        <Route path="inventory/transfers" element={<TransferInventoryList />} />
        <Route path="inventory/transfers/new" element={<TransferInventoryForm />} />
        <Route path="inventory/transfer-orders" element={<TransferOrderList />} />
        <Route path="inventory/transfer-orders/new" element={<TransferOrderForm />} />
        <Route path="inventory/transfer-bins" element={<TransferBinList />} />
        <Route path="inventory/transfer-bins/new" element={<ComingSoon title="Transfer Bin" />} />

        {/* ── MANUFACTURING ── */}
        <Route path="manufacturing/boms" element={<BOMList />} />
        <Route path="manufacturing/boms/new" element={<BOMForm />} />
        <Route path="manufacturing/boms/:id" element={<BOMDetail />} />
        <Route path="manufacturing/work-orders" element={<WorkOrderList />} />
        <Route path="manufacturing/work-orders/new" element={<WorkOrderForm />} />
        <Route path="manufacturing/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="manufacturing/work-centers" element={<WorkCenterList />} />
        <Route path="manufacturing/assembly-builds" element={<ComingSoon title="Assembly Builds" />} />
        <Route path="manufacturing/assembly-builds/new" element={<AssemblyBuildForm />} />
        <Route path="manufacturing/mrp" element={<MRPPage />} />

        {/* ── ACCOUNTING ── */}
        <Route path="accounting/accounts" element={<AccountList />} />
        <Route path="accounting/journals" element={<JournalList />} />
        <Route path="accounting/journals/new" element={<JournalEntryForm />} />
        <Route path="accounting/journals/:id" element={<JournalDetail />} />
        <Route path="accounting/reports/profit-loss" element={<ProfitLossReport />} />
        <Route path="accounting/reports/balance-sheet" element={<BalanceSheetReport />} />
        <Route path="accounting/reports/trial-balance" element={<TrialBalanceReport />} />
        <Route path="accounting/reports/ar-aging" element={<ARAgingReport />} />
        <Route path="accounting/reports/ap-aging" element={<APAgingReport />} />
        <Route path="accounting/reports/general-ledger" element={<GeneralLedgerReport />} />
        <Route path="accounting/reports/cash-flow" element={<CashFlowReport />} />

        {/* ── REPORTS ── */}
        <Route path="reports/inventory" element={<InventoryReport />} />
        <Route path="reports/manufacturing" element={<ManufacturingReport />} />
        <Route path="reports/stock-onhand" element={<StockOnhandReport />} />
        <Route path="reports/stock-ledger" element={<StockLedgerReport />} />
        <Route path="reports/inventory-activity" element={<InventoryActivityReport />} />
        <Route path="reports/sales-by-customer" element={<SalesReports type="sales-by-customer" />} />
        <Route path="reports/sales-by-items" element={<SalesReports type="sales-by-items" />} />
        <Route path="reports/sales-by-rep" element={<SalesReports type="sales-by-rep" />} />
        <Route path="reports/sales-order-by-customer" element={<SalesReports type="so-by-customer" />} />
        <Route path="reports/sales-order-by-items" element={<SalesReports type="so-by-items" />} />
        <Route path="reports/sales-order-by-rep" element={<ComingSoon title="Sales Order by Sales Rep" />} />
        <Route path="reports/purchases-by-customer" element={<PurchaseReports type="purchases-by-customer" />} />
        <Route path="reports/purchases-by-items" element={<PurchaseReports type="purchases-by-items" />} />
        <Route path="reports/purchases-by-rep" element={<PurchaseReports type="purchases-by-rep" />} />
        <Route path="reports/po-by-customer" element={<PurchaseReports type="po-by-customer" />} />
        <Route path="reports/po-by-items" element={<PurchaseReports type="po-by-items" />} />
        <Route path="reports/ar-aging-detail" element={<ARAgingReport />} />
        <Route path="reports/ap-aging-detail" element={<APAgingReport />} />

        {/* ── SETTINGS ── */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/users" element={<UsersRolesPage />} />
        <Route path="settings/roles" element={<UsersRolesPage />} />
        <Route path="settings/company" element={<CompanySettingsPage />} />
        <Route path="settings/departments" element={<DepartmentsPage />} />
        <Route path="settings/locations" element={<LocationsPage />} />
        <Route path="settings/accounting-periods" element={<AccountingPeriodsPage />} />
        <Route path="settings/tax-codes" element={<TaxCodePage />} />
        <Route path="settings/import-csv" element={<ImportCSVPage />} />
        <Route path="settings/saved-imports" element={<ComingSoon title="Saved CSV Imports" />} />

        {/* ── MISC ── */}
        <Route path="lists/currencies" element={<ComingSoon title="Currencies" />} />
        <Route path="lists/exchange-rates" element={<ComingSoon title="Currency Exchange Rates" />} />
        <Route path="lists/uom" element={<ComingSoon title="Unit of Measure" />} />
        <Route path="lists/bins" element={<ComingSoon title="Bins" />} />
        <Route path="lists/employees" element={<ComingSoon title="Employees" />} />
        <Route path="documents/file-cabinet" element={<ComingSoon title="File Cabinet" />} />
        <Route path="customization/scripts" element={<ComingSoon title="Custom Scripts" />} />
        <Route path="accounting/bank" element={<ComingSoon title="Bank Transactions" />} />
        <Route path="purchasing/payables" element={<APAgingReport />} />
        <Route path="sales/billing" element={<InvoiceList />} />
        <Route path="sales/order-management" element={<SalesOrderList />} />
        <Route path="settings/employees" element={<ComingSoon title="Employees" />} />
        <Route path="settings/accounting" element={<AccountingPeriodsPage />} />
        <Route path="settings/tax" element={<TaxCodePage />} />
        <Route path="settings/departments" element={<DepartmentsPage />} />
        <Route path="reports/custom" element={<ComingSoon title="Custom Reports" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
