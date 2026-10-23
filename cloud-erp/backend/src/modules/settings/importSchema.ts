// ─────────────────────────────────────────────────────────────────────────────
// Import schema registry — defines the importable fields for each record type so
// the Import Assistant (field mapping) and the import engine stay in sync.
//
// Each field: { key, label, required?, type?, line? }
//  - key   : the field name sent in the mapping and used by the engine
//  - label : human label shown in the mapping UI
//  - type  : 'string' | 'number' | 'boolean' | 'date' (for coercion)
//  - line  : true = belongs to a transaction line (grouped under the header doc)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date';
  line?: boolean;
}

export interface ImportTypeDef {
  value: string;
  label: string;
  category: 'Master Data' | 'Transactions';
  table: string;            // header table
  naturalKey: string;       // field used to match existing records on Update
  fields: ImportField[];
  // For transaction types with line items:
  lineTable?: string;
  lineFk?: string;          // FK column on the line table pointing to header id
  docKey?: string;          // field (in CSV) that groups rows into one document
  // When true, the engine computes line `amount` = quantity * unit_price and rolls
  // the total up into the header. Set false for line tables without an amount column
  // (e.g. inventory adjustments / transfer orders / work-order materials).
  computeLineAmount?: boolean;
  // Header column the engine should populate with the summed line total, if any.
  totalColumn?: string;
  // Entity (customer/vendor) name field on the header that must be resolved to an id.
  // Already auto-handled for customer_name / vendor_name.
}

const S = (key: string, label: string, extra: Partial<ImportField> = {}): ImportField => ({ key, label, type: 'string', ...extra });
const N = (key: string, label: string, extra: Partial<ImportField> = {}): ImportField => ({ key, label, type: 'number', ...extra });
const B = (key: string, label: string): ImportField => ({ key, label, type: 'boolean' });
const D = (key: string, label: string, extra: Partial<ImportField> = {}): ImportField => ({ key, label, type: 'date', ...extra });

export const IMPORT_TYPES: ImportTypeDef[] = [
  // ───────────── MASTER DATA ─────────────
  {
    value: 'customers', label: 'Customers', category: 'Master Data',
    table: 'customers', naturalKey: 'name',
    fields: [
      S('customer_number', 'Customer Number'),
      S('name', 'Customer Name', { required: true }),
      S('company_name', 'Company Name'),
      S('type', 'Type (company/individual)'),
      S('email', 'Email'), S('phone', 'Phone'), S('mobile', 'Mobile'),
      S('tax_id', 'Tax ID (NPWP)'),
      S('billing_address', 'Billing Address'), S('billing_city', 'Billing City'),
      S('billing_state', 'Billing State'), S('billing_country', 'Billing Country'), S('billing_postal', 'Billing Postal'),
      S('currency', 'Currency'), S('payment_terms', 'Payment Terms'),
      N('credit_limit', 'Credit Limit'), S('status', 'Status'), S('notes', 'Notes'),
    ],
  },
  {
    value: 'vendors', label: 'Vendors', category: 'Master Data',
    table: 'vendors', naturalKey: 'name',
    fields: [
      S('vendor_number', 'Vendor Number'),
      S('name', 'Vendor Name', { required: true }),
      S('company_name', 'Company Name'),
      S('type', 'Type (company/individual)'),
      S('email', 'Email'), S('phone', 'Phone'), S('tax_id', 'Tax ID (NPWP)'),
      S('address', 'Address'), S('city', 'City'), S('state', 'State'), S('country', 'Country'), S('postal_code', 'Postal Code'),
      S('currency', 'Currency'), S('payment_terms', 'Payment Terms'), N('credit_limit', 'Credit Limit'),
      S('bank_name', 'Bank Name'), S('bank_account_number', 'Bank Account Number'), S('bank_account_name', 'Account Holder Name'),
      S('status', 'Status'), S('notes', 'Notes'),
    ],
  },
  {
    value: 'items', label: 'Items', category: 'Master Data',
    table: 'items', naturalKey: 'item_code',
    fields: [
      S('item_code', 'Item Code', { required: true }),
      S('sku', 'SKU'),
      S('name', 'Item Name', { required: true }),
      S('description', 'Description'),
      S('type', 'Item Type (inventory/service/...)'),
      S('brand', 'Brand'), S('manufacturer', 'Manufacturer'),
      N('standard_cost', 'Standard Cost'), N('sales_price', 'Sales Price'),
      N('purchase_price', 'Purchase Price'), N('last_purchase_price', 'Last Purchase Price'),
      N('reorder_point', 'Reorder Point'), N('safety_stock', 'Safety Stock'), N('lead_time_days', 'Lead Time (days)'),
      B('is_purchasable', 'Is Purchasable'), B('is_sellable', 'Is Sellable'), B('is_stockable', 'Is Stockable'), B('is_active', 'Is Active'),
    ],
  },
  {
    value: 'accounts', label: 'Chart of Accounts', category: 'Master Data',
    table: 'accounts', naturalKey: 'code',
    fields: [
      S('code', 'Account Number', { required: true }),
      S('name', 'Account Name', { required: true }),
      S('account_type', 'Account Type (bank/accounts_receivable/...)'),
      S('description', 'Description'),
      S('currency', 'Currency'),
      B('is_summary', 'Is Summary'),
    ],
  },
  {
    value: 'departments', label: 'Departments', category: 'Master Data',
    table: 'departments', naturalKey: 'name',
    fields: [S('code', 'Code'), S('name', 'Name', { required: true }), S('description', 'Description')],
  },
  {
    value: 'locations', label: 'Locations', category: 'Master Data',
    table: 'locations', naturalKey: 'name',
    fields: [S('code', 'Code'), S('name', 'Name', { required: true }), S('type', 'Type'), S('address', 'Address')],
  },

  // ───────────── TRANSACTIONS ─────────────
  {
    value: 'journal_entries', label: 'Journal Entry', category: 'Transactions',
    table: 'journal_entries', naturalKey: 'journal_number', docKey: 'journal_number',
    lineTable: 'journal_entry_lines', lineFk: 'journal_id',
    fields: [
      S('journal_number', 'Journal Number', { required: true }),
      D('entry_date', 'Date', { required: true }),
      S('memo', 'Memo'),
      // Line fields
      S('account_code', 'Line: Account Number', { line: true, required: true }),
      N('debit', 'Line: Debit', { line: true }),
      N('credit', 'Line: Credit', { line: true }),
      S('line_memo', 'Line: Memo', { line: true }),
    ],
  },
  {
    value: 'sales_orders', label: 'Sales Order', category: 'Transactions',
    table: 'sales_orders', naturalKey: 'order_number', docKey: 'order_number',
    lineTable: 'sales_order_lines', lineFk: 'so_id',
    fields: [
      S('order_number', 'SO Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('order_date', 'Date', { required: true }),
      D('due_date', 'Due Date'),
      S('payment_terms', 'Payment Terms'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('quantity', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'purchase_orders', label: 'Purchase Order', category: 'Transactions',
    table: 'purchase_orders', naturalKey: 'po_number', docKey: 'po_number',
    lineTable: 'purchase_order_lines', lineFk: 'po_id',
    fields: [
      S('po_number', 'PO Number', { required: true }),
      S('vendor_name', 'Vendor', { required: true }),
      D('order_date', 'Date', { required: true }),
      D('due_date', 'Due Date'),
      S('payment_terms', 'Payment Terms'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('quantity', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'invoices', label: 'Invoice', category: 'Transactions',
    table: 'invoices', naturalKey: 'invoice_number', docKey: 'invoice_number',
    lineTable: 'invoice_lines', lineFk: 'invoice_id',
    fields: [
      S('invoice_number', 'Invoice Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('invoice_date', 'Date', { required: true }),
      D('due_date', 'Due Date'),
      S('payment_terms', 'Payment Terms'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('quantity', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'vendor_bills', label: 'Vendor Bill', category: 'Transactions',
    table: 'vendor_bills', naturalKey: 'bill_number', docKey: 'bill_number',
    lineTable: 'vendor_bill_lines', lineFk: 'bill_id', computeLineAmount: true, totalColumn: 'total_amount',
    fields: [
      S('bill_number', 'Bill Number', { required: true }),
      S('vendor_name', 'Vendor', { required: true }),
      D('bill_date', 'Date', { required: true }),
      D('due_date', 'Due Date'),
      S('payment_terms', 'Payment Terms'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true }),
      N('quantity', 'Line: Quantity', { line: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'quotations', label: 'Quotation', category: 'Transactions',
    table: 'quotations', naturalKey: 'quotation_number', docKey: 'quotation_number',
    lineTable: 'quotation_lines', lineFk: 'quotation_id', computeLineAmount: true, totalColumn: 'total_amount',
    fields: [
      S('quotation_number', 'Quotation Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('quotation_date', 'Date', { required: true }),
      D('expiry_date', 'Expiry Date'),
      S('payment_terms', 'Payment Terms'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('quantity', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'purchase_requisitions', label: 'Purchase Requisition', category: 'Transactions',
    table: 'purchase_requisitions', naturalKey: 'requisition_number', docKey: 'requisition_number',
    lineTable: 'purchase_requisition_lines', lineFk: 'pr_id', computeLineAmount: true, totalColumn: 'total_amount',
    fields: [
      S('requisition_number', 'Requisition Number', { required: true }),
      D('request_date', 'Request Date', { required: true }),
      D('required_date', 'Required Date'),
      S('requested_by', 'Requested By'),
      S('priority', 'Priority'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('quantity', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'return_authorizations', label: 'Return Authorization', category: 'Transactions',
    table: 'return_authorizations', naturalKey: 'ra_number', docKey: 'ra_number',
    lineTable: 'return_authorization_lines', lineFk: 'ra_id', computeLineAmount: true, totalColumn: 'total_amount',
    fields: [
      S('ra_number', 'RA Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('return_date', 'Return Date', { required: true }),
      S('original_invoice_number', 'Original Invoice Number'),
      S('return_reason', 'Return Reason'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('qty', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'credit_memos', label: 'Credit Memo', category: 'Transactions',
    table: 'credit_memos', naturalKey: 'memo_number', docKey: 'memo_number',
    lineTable: 'credit_memo_lines', lineFk: 'credit_memo_id', computeLineAmount: true, totalColumn: 'total_amount',
    fields: [
      S('memo_number', 'Memo Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('memo_date', 'Date', { required: true }),
      S('original_invoice_number', 'Original Invoice Number'),
      S('reason', 'Reason'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('qty', 'Line: Quantity', { line: true, required: true }),
      N('unit_price', 'Line: Unit Price', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'expense_reports', label: 'Expense Report', category: 'Transactions',
    table: 'expense_reports', naturalKey: 'report_number', docKey: 'report_number',
    lineTable: 'expense_report_lines', lineFk: 'report_id', computeLineAmount: false, totalColumn: 'total_amount',
    fields: [
      S('report_number', 'Report Number', { required: true }),
      S('employee_name', 'Employee Name', { required: true }),
      S('title', 'Title'),
      D('report_period_start', 'Period Start'),
      D('report_period_end', 'Period End'),
      S('purpose', 'Purpose'), S('memo', 'Memo'),
      D('expense_date', 'Line: Date', { line: true }),
      S('category', 'Line: Category', { line: true }),
      N('amount', 'Line: Amount', { line: true, required: true }),
      S('account_code', 'Line: Account Number', { line: true }),
      S('line_description', 'Line: Description', { line: true }),
    ],
  },
  {
    value: 'inventory_adjustments', label: 'Inventory Adjustment', category: 'Transactions',
    table: 'inventory_adjustments', naturalKey: 'adjustment_number', docKey: 'adjustment_number',
    lineTable: 'inventory_adjustment_lines', lineFk: 'adjustment_id', computeLineAmount: false,
    fields: [
      S('adjustment_number', 'Adjustment Number', { required: true }),
      D('adjustment_date', 'Date', { required: true }),
      S('adjustment_type', 'Adjustment Type (quantity/value)'),
      S('reason', 'Reason'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('adjust_qty', 'Line: Adjust Quantity', { line: true, required: true }),
      N('unit_cost', 'Line: Unit Cost', { line: true }),
      S('line_reason', 'Line: Reason', { line: true }),
    ],
  },
  {
    value: 'inventory_transfer_orders', label: 'Inventory Transfer Order', category: 'Transactions',
    table: 'inventory_transfer_orders', naturalKey: 'transfer_order_number', docKey: 'transfer_order_number',
    lineTable: 'inventory_transfer_order_lines', lineFk: 'transfer_order_id', computeLineAmount: false,
    fields: [
      S('transfer_order_number', 'Transfer Order Number', { required: true }),
      D('order_date', 'Order Date', { required: true }),
      D('expected_date', 'Expected Date'),
      S('from_location_name', 'From Location'),
      S('to_location_name', 'To Location'),
      S('priority', 'Priority'), S('memo', 'Memo'),
      S('item_code', 'Line: Item', { line: true, required: true }),
      N('qty_requested', 'Line: Quantity Requested', { line: true, required: true }),
      D('requested_date', 'Line: Requested Date', { line: true }),
    ],
  },
  {
    value: 'work_orders', label: 'Work Order', category: 'Transactions',
    table: 'work_orders', naturalKey: 'wo_number', docKey: 'wo_number',
    lineTable: 'work_order_materials', lineFk: 'wo_id', computeLineAmount: false,
    fields: [
      S('wo_number', 'WO Number', { required: true }),
      S('item_code_header', 'Finished Item', { required: true }),
      N('planned_quantity_header', 'Planned Quantity', { required: true, type: 'number' }),
      D('planned_start_date', 'Planned Start Date'),
      D('planned_end_date', 'Planned End Date'),
      S('priority', 'Priority'), S('memo', 'Memo'),
      S('item_code', 'Line: Material Item', { line: true, required: true }),
      N('planned_quantity', 'Line: Planned Quantity', { line: true, required: true }),
      N('standard_cost', 'Line: Standard Cost', { line: true }),
    ],
  },

  // ── Bank / payment transactions (header-only, no line grouping) ──
  {
    value: 'bank_transfers', label: 'Transfer Funds', category: 'Transactions',
    table: 'bank_transfers', naturalKey: 'transfer_number',
    fields: [
      S('transfer_number', 'Transfer Number', { required: true }),
      D('transfer_date', 'Date', { required: true }),
      S('from_account_code', 'From Account Number', { required: true }),
      S('to_account_code', 'To Account Number', { required: true }),
      N('amount', 'Amount', { required: true }),
      S('reference', 'Reference'), S('memo', 'Memo'),
    ],
  },
  {
    value: 'customer_deposits', label: 'Customer Deposit', category: 'Transactions',
    table: 'customer_deposits', naturalKey: 'deposit_number',
    fields: [
      S('deposit_number', 'Deposit Number', { required: true }),
      S('customer_name', 'Customer', { required: true }),
      D('deposit_date', 'Date', { required: true }),
      N('amount', 'Amount', { required: true }),
      S('bank_account_code', 'Bank Account Number'),
      S('payment_method', 'Payment Method'),
      S('reference', 'Reference'), S('memo', 'Memo'),
    ],
  },
  {
    value: 'vendor_prepayments', label: 'Vendor Prepayment', category: 'Transactions',
    table: 'vendor_prepayments', naturalKey: 'prepayment_number',
    fields: [
      S('prepayment_number', 'Prepayment Number', { required: true }),
      S('vendor_name', 'Vendor', { required: true }),
      D('payment_date', 'Date', { required: true }),
      N('amount', 'Amount', { required: true }),
      S('bank_account_code', 'Bank Account Number'),
      S('payment_method', 'Payment Method'),
      S('reference', 'Reference'), S('memo', 'Memo'),
    ],
  },
  {
    value: 'bank_checks', label: 'Write Check', category: 'Transactions',
    table: 'bank_checks', naturalKey: 'check_number', docKey: 'check_number',
    lineTable: 'bank_check_lines', lineFk: 'check_id', computeLineAmount: false,
    fields: [
      S('check_number', 'Check Number', { required: true }),
      D('check_date', 'Date', { required: true }),
      S('pay_to', 'Pay To', { required: true }),
      S('vendor_name', 'Vendor'),
      S('bank_account_code', 'Bank Account Number'),
      N('header_amount', 'Total Amount', { required: true }),
      S('memo', 'Memo'),
      S('account_code', 'Line: Expense Account Number', { line: true, required: true }),
      N('amount', 'Line: Amount', { line: true, required: true }),
      S('line_memo', 'Line: Memo', { line: true }),
    ],
  },
  {
    value: 'bank_deposits', label: 'Make Deposit', category: 'Transactions',
    table: 'bank_deposits', naturalKey: 'deposit_number', docKey: 'deposit_number',
    lineTable: 'bank_deposit_lines', lineFk: 'deposit_id', computeLineAmount: false, totalColumn: 'total_amount',
    fields: [
      S('deposit_number', 'Deposit Number', { required: true }),
      D('deposit_date', 'Date', { required: true }),
      S('bank_account_code', 'Bank Account Number'),
      S('reference', 'Reference'), S('memo', 'Memo'),
      S('account_code', 'Line: Account Number', { line: true, required: true }),
      N('amount', 'Line: Amount', { line: true, required: true }),
      S('line_memo', 'Line: Memo', { line: true }),
    ],
  },
];

export const getImportType = (value: string): ImportTypeDef | undefined => IMPORT_TYPES.find(t => t.value === value);
