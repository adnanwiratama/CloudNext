import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Clear in reverse dependency order
  await knex('audit_logs').del();
  await knex('notifications').del();
  await knex('activities').del();
  await knex('work_order_completions').del();
  await knex('material_issue_lines').del();
  await knex('material_issues').del();
  await knex('work_order_materials').del();
  await knex('work_orders').del();
  await knex('bom_components').del();
  await knex('boms').del();
  await knex('routing_operations').del();
  await knex('routings').del();
  await knex('work_centers').del();
  await knex('journal_entry_lines').del();
  await knex('journal_entries').del();
  await knex('inventory_transaction_lines').del();
  await knex('inventory_transactions').del();
  await knex('inventory_balances').del();
  await knex('invoice_lines').del();
  await knex('invoices').del();
  await knex('sales_order_lines').del();
  await knex('sales_orders').del();
  await knex('vendor_bill_lines').del();
  await knex('vendor_bills').del();
  await knex('purchase_order_lines').del();
  await knex('purchase_orders').del();
  await knex('item_prices').del();
  await knex('items').del();
  await knex('item_categories').del();
  await knex('vendor_contacts').del();
  await knex('vendors').del();
  await knex('customer_contacts').del();
  await knex('customers').del();
  await knex('accounting_periods').del();
  await knex('fiscal_years').del();
  await knex('accounts').del();
  await knex('tax_codes').del();
  await knex('uom_conversions').del();
  await knex('units_of_measure').del();
  await knex('exchange_rates').del();
  await knex('currencies').del();
  await knex('bins').del();
  await knex('warehouses').del();
  await knex('departments').del();
  await knex('locations').del();
  await knex('transaction_sequences').del();
  await knex('user_subsidiaries').del();
  await knex('users').del();
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').del();
  await knex('subsidiaries').del();
  await knex('companies').del();

  // ============================================================
  // COMPANY
  // ============================================================
  const [company] = await knex('companies').insert({
    id: knex.raw('uuid_generate_v4()'),
    code: 'CMI',
    name: 'Cloud Manufacturing Indonesia',
    legal_name: 'PT Cloud Manufacturing Indonesia',
    tax_id: '01.234.567.8-901.000',
    email: 'info@cloudmfg.co.id',
    phone: '+62 21 5678 9000',
    website: 'https://cloudmfg.co.id',
    address: 'Jl. Sudirman No. 1',
    city: 'Jakarta',
    country: 'Indonesia',
    postal_code: '10220',
    base_currency: 'IDR',
    timezone: 'Asia/Jakarta',
    fiscal_year_start: '01-01',
    is_active: true,
  }).returning('*');

  // Subsidiaries
  const [subTrading] = await knex('subsidiaries').insert({
    id: knex.raw('uuid_generate_v4()'),
    company_id: company.id,
    code: 'CT',
    name: 'Cloud Trading',
    currency: 'IDR',
    country: 'Indonesia',
    is_active: true,
  }).returning('*');

  const [subManufacturing] = await knex('subsidiaries').insert({
    id: knex.raw('uuid_generate_v4()'),
    company_id: company.id,
    code: 'CM',
    name: 'Cloud Manufacturing',
    currency: 'IDR',
    country: 'Indonesia',
    is_active: true,
  }).returning('*');

  // ============================================================
  // ROLES & PERMISSIONS
  // ============================================================
  const modules = ['accounting', 'sales', 'purchasing', 'inventory', 'manufacturing', 'reports', 'settings', 'crm'];
  const resources = {
    accounting: ['journal', 'invoice', 'bill', 'payment', 'account', 'period'],
    sales: ['quotation', 'sales_order', 'fulfillment', 'invoice', 'payment', 'credit_memo'],
    purchasing: ['requisition', 'purchase_order', 'receipt', 'bill', 'payment'],
    inventory: ['item', 'adjustment', 'transfer', 'count'],
    manufacturing: ['bom', 'work_order', 'material_issue', 'completion', 'mrp'],
    reports: ['financial', 'operational', 'manufacturing'],
    settings: ['company', 'users', 'roles', 'tax', 'currency'],
    crm: ['lead', 'opportunity', 'customer', 'activity'],
  };
  const actions = ['view', 'create', 'edit', 'delete', 'approve', 'post', 'export', 'print'];

  const permInserts: any[] = [];
  for (const mod of modules) {
    const res = resources[mod as keyof typeof resources] || [];
    for (const resource of res) {
      for (const action of actions) {
        permInserts.push({ module: mod, resource, action, description: `${action} ${resource}` });
      }
    }
  }
  const perms = await knex('permissions').insert(permInserts).returning('*');

  // Roles
  const [adminRole] = await knex('roles').insert({
    company_id: company.id, name: 'Administrator', description: 'Full system access', is_system: true, is_active: true,
  }).returning('*');
  const [financeRole] = await knex('roles').insert({
    company_id: company.id, name: 'Finance Manager', description: 'Accounting, AR, AP access', is_system: false, is_active: true,
  }).returning('*');
  const [salesRole] = await knex('roles').insert({
    company_id: company.id, name: 'Sales Manager', description: 'Sales and CRM access', is_system: false, is_active: true,
  }).returning('*');
  const [purchasingRole] = await knex('roles').insert({
    company_id: company.id, name: 'Purchasing Manager', description: 'Purchasing access', is_system: false, is_active: true,
  }).returning('*');
  const [mfgRole] = await knex('roles').insert({
    company_id: company.id, name: 'Manufacturing Manager', description: 'Manufacturing and inventory access', is_system: false, is_active: true,
  }).returning('*');
  const [viewerRole] = await knex('roles').insert({
    company_id: company.id, name: 'Read Only', description: 'View only access', is_system: false, is_active: true,
  }).returning('*');

  // Admin gets all permissions
  const rolePermAdmin = perms.map((p: any) => ({ role_id: adminRole.id, permission_id: p.id }));
  if (rolePermAdmin.length > 0) await knex('role_permissions').insert(rolePermAdmin);

  // Finance permissions
  const financePerms = perms.filter((p: any) => ['accounting', 'reports'].includes(p.module));
  if (financePerms.length > 0) await knex('role_permissions').insert(financePerms.map((p: any) => ({ role_id: financeRole.id, permission_id: p.id })));

  // ============================================================
  // USERS
  // ============================================================
  const passwordHash = await bcrypt.hash('CloudERP@2026', 12);

  const [adminUser] = await knex('users').insert({
    company_id: company.id,
    name: 'System Administrator',
    email: 'admin@cloudmfg.co.id',
    password_hash: passwordHash,
    role_id: adminRole.id,
    subsidiary_id: subManufacturing.id,
    is_active: true,
    is_admin: true,
  }).returning('*');

  const [financeUser] = await knex('users').insert({
    company_id: company.id,
    name: 'Budi Santoso',
    email: 'budi.santoso@cloudmfg.co.id',
    password_hash: passwordHash,
    role_id: financeRole.id,
    subsidiary_id: subTrading.id,
    is_active: true,
    is_admin: false,
  }).returning('*');

  const [salesUser] = await knex('users').insert({
    company_id: company.id,
    name: 'Sari Dewi',
    email: 'sari.dewi@cloudmfg.co.id',
    password_hash: passwordHash,
    role_id: salesRole.id,
    subsidiary_id: subTrading.id,
    is_active: true,
    is_admin: false,
  }).returning('*');

  const [mfgUser] = await knex('users').insert({
    company_id: company.id,
    name: 'Andi Wijaya',
    email: 'andi.wijaya@cloudmfg.co.id',
    password_hash: passwordHash,
    role_id: mfgRole.id,
    subsidiary_id: subManufacturing.id,
    is_active: true,
    is_admin: false,
  }).returning('*');

  // User subsidiary access
  for (const userId of [adminUser.id, financeUser.id]) {
    await knex('user_subsidiaries').insert([
      { user_id: userId, subsidiary_id: subTrading.id },
      { user_id: userId, subsidiary_id: subManufacturing.id },
    ]);
  }

  // ============================================================
  // LOCATIONS & DEPARTMENTS
  // ============================================================
  const [locJakarta] = await knex('locations').insert({ company_id: company.id, subsidiary_id: subTrading.id, code: 'JKT', name: 'Jakarta', type: 'warehouse', city: 'Jakarta', country: 'Indonesia', is_active: true }).returning('*');
  const [locBandung] = await knex('locations').insert({ company_id: company.id, subsidiary_id: subTrading.id, code: 'BDG', name: 'Bandung', type: 'warehouse', city: 'Bandung', country: 'Indonesia', is_active: true }).returning('*');
  const [locSurabaya] = await knex('locations').insert({ company_id: company.id, subsidiary_id: subTrading.id, code: 'SBY', name: 'Surabaya', type: 'warehouse', city: 'Surabaya', country: 'Indonesia', is_active: true }).returning('*');
  const [locFactoryA] = await knex('locations').insert({ company_id: company.id, subsidiary_id: subManufacturing.id, code: 'FAB-A', name: 'Factory A', type: 'plant', city: 'Bekasi', country: 'Indonesia', is_active: true }).returning('*');

  const [deptSales] = await knex('departments').insert({ company_id: company.id, code: 'SALES', name: 'Sales', is_active: true }).returning('*');
  const [deptFinance] = await knex('departments').insert({ company_id: company.id, code: 'FIN', name: 'Finance', is_active: true }).returning('*');
  const [deptPurchasing] = await knex('departments').insert({ company_id: company.id, code: 'PURCH', name: 'Purchasing', is_active: true }).returning('*');
  const [deptMfg] = await knex('departments').insert({ company_id: company.id, code: 'MFG', name: 'Manufacturing', is_active: true }).returning('*');
  const [deptIT] = await knex('departments').insert({ company_id: company.id, code: 'IT', name: 'Information Technology', is_active: true }).returning('*');

  // ============================================================
  // WAREHOUSES & BINS
  // ============================================================
  const [whJKT] = await knex('warehouses').insert({ company_id: company.id, location_id: locJakarta.id, code: 'WH-JKT', name: 'Jakarta Warehouse', is_active: true }).returning('*');
  const [whBDG] = await knex('warehouses').insert({ company_id: company.id, location_id: locBandung.id, code: 'WH-BDG', name: 'Bandung Warehouse', is_active: true }).returning('*');
  const [whFabA] = await knex('warehouses').insert({ company_id: company.id, location_id: locFactoryA.id, code: 'WH-FAB-A', name: 'Factory A Warehouse', is_active: true }).returning('*');

  const [binA1] = await knex('bins').insert({ warehouse_id: whJKT.id, code: 'A-01-01', zone: 'A', aisle: '01', rack: '01', level: '01', is_active: true }).returning('*');
  const [binA2] = await knex('bins').insert({ warehouse_id: whJKT.id, code: 'A-01-02', zone: 'A', aisle: '01', rack: '01', level: '02', is_active: true }).returning('*');
  const [binFab1] = await knex('bins').insert({ warehouse_id: whFabA.id, code: 'RAW-01', zone: 'RAW', aisle: '01', rack: '01', level: '01', is_active: true }).returning('*');
  const [binFabFG] = await knex('bins').insert({ warehouse_id: whFabA.id, code: 'FG-01', zone: 'FG', aisle: '01', rack: '01', level: '01', is_active: true }).returning('*');

  // ============================================================
  // CURRENCIES
  // ============================================================
  await knex('currencies').insert([
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimal_places: 0, is_active: true },
    { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_active: true },
    { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_active: true },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimal_places: 2, is_active: true },
  ]);

  await knex('exchange_rates').insert([
    { company_id: company.id, from_currency: 'USD', to_currency: 'IDR', rate: 15500, effective_date: '2026-01-01', created_by: adminUser.id },
    { company_id: company.id, from_currency: 'EUR', to_currency: 'IDR', rate: 16800, effective_date: '2026-01-01', created_by: adminUser.id },
    { company_id: company.id, from_currency: 'SGD', to_currency: 'IDR', rate: 11500, effective_date: '2026-01-01', created_by: adminUser.id },
  ]);

  // ============================================================
  // UNITS OF MEASURE
  // ============================================================
  const [uomPcs] = await knex('units_of_measure').insert({ company_id: company.id, code: 'PCS', name: 'Pieces', type: 'quantity', is_base: true, is_active: true }).returning('*');
  const [uomBox] = await knex('units_of_measure').insert({ company_id: company.id, code: 'BOX', name: 'Box', type: 'quantity', is_base: false, is_active: true }).returning('*');
  const [uomKg] = await knex('units_of_measure').insert({ company_id: company.id, code: 'KG', name: 'Kilogram', type: 'weight', is_base: true, is_active: true }).returning('*');
  const [uomGram] = await knex('units_of_measure').insert({ company_id: company.id, code: 'GR', name: 'Gram', type: 'weight', is_base: false, is_active: true }).returning('*');
  const [uomLiter] = await knex('units_of_measure').insert({ company_id: company.id, code: 'LTR', name: 'Liter', type: 'volume', is_base: true, is_active: true }).returning('*');
  const [uomMeter] = await knex('units_of_measure').insert({ company_id: company.id, code: 'MTR', name: 'Meter', type: 'length', is_base: true, is_active: true }).returning('*');
  const [uomSet] = await knex('units_of_measure').insert({ company_id: company.id, code: 'SET', name: 'Set', type: 'quantity', is_base: true, is_active: true }).returning('*');

  await knex('uom_conversions').insert([
    { company_id: company.id, from_uom_id: uomBox.id, to_uom_id: uomPcs.id, conversion_factor: 24 },
    { company_id: company.id, from_uom_id: uomKg.id, to_uom_id: uomGram.id, conversion_factor: 1000 },
  ]);

  // ============================================================
  // TAX CODES
  // ============================================================
  const [taxPpn] = await knex('tax_codes').insert({ company_id: company.id, code: 'PPN-11', name: 'PPN 11%', rate: 11, type: 'exclusive', is_active: true }).returning('*');
  const [taxExempt] = await knex('tax_codes').insert({ company_id: company.id, code: 'EXEMPT', name: 'Tax Exempt', rate: 0, type: 'exclusive', is_active: true }).returning('*');

  // ============================================================
  // CHART OF ACCOUNTS
  // ============================================================
  // ASSETS
  const [acCurrentAssets] = await knex('accounts').insert({ company_id: company.id, code: '1000', name: 'Current Assets', type: 'asset', subtype: 'current_asset', is_summary: true, is_active: true }).returning('*');
  const [acCash] = await knex('accounts').insert({ company_id: company.id, code: '1010', name: 'Cash on Hand', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_bank: true, is_active: true }).returning('*');
  const [acBankBCA] = await knex('accounts').insert({ company_id: company.id, code: '1020', name: 'Bank BCA', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_bank: true, is_active: true }).returning('*');
  const [acBankMandiri] = await knex('accounts').insert({ company_id: company.id, code: '1025', name: 'Bank Mandiri', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_bank: true, is_active: true }).returning('*');
  const [acAR] = await knex('accounts').insert({ company_id: company.id, code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_active: true }).returning('*');
  const [acInventory] = await knex('accounts').insert({ company_id: company.id, code: '1200', name: 'Inventory', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_active: true }).returning('*');
  const [acRawMaterial] = await knex('accounts').insert({ company_id: company.id, code: '1210', name: 'Raw Materials Inventory', type: 'asset', subtype: 'current_asset', parent_id: acInventory.id, is_active: true }).returning('*');
  const [acWIP] = await knex('accounts').insert({ company_id: company.id, code: '1220', name: 'Work In Progress', type: 'asset', subtype: 'current_asset', parent_id: acInventory.id, is_active: true }).returning('*');
  const [acFG] = await knex('accounts').insert({ company_id: company.id, code: '1230', name: 'Finished Goods Inventory', type: 'asset', subtype: 'current_asset', parent_id: acInventory.id, is_active: true }).returning('*');
  const [acPrepaid] = await knex('accounts').insert({ company_id: company.id, code: '1300', name: 'Prepaid Expenses', type: 'asset', subtype: 'current_asset', parent_id: acCurrentAssets.id, is_active: true }).returning('*');

  const [acFixedAssets] = await knex('accounts').insert({ company_id: company.id, code: '1500', name: 'Fixed Assets', type: 'asset', subtype: 'fixed_asset', is_summary: true, is_active: true }).returning('*');
  const [acMachinery] = await knex('accounts').insert({ company_id: company.id, code: '1510', name: 'Machinery & Equipment', type: 'asset', subtype: 'fixed_asset', parent_id: acFixedAssets.id, is_active: true }).returning('*');
  const [acAccDepreciation] = await knex('accounts').insert({ company_id: company.id, code: '1590', name: 'Accumulated Depreciation', type: 'asset', subtype: 'fixed_asset', parent_id: acFixedAssets.id, is_active: true }).returning('*');

  // LIABILITIES
  const [acCurrentLiab] = await knex('accounts').insert({ company_id: company.id, code: '2000', name: 'Current Liabilities', type: 'liability', subtype: 'current_liability', is_summary: true, is_active: true }).returning('*');
  const [acAP] = await knex('accounts').insert({ company_id: company.id, code: '2100', name: 'Accounts Payable', type: 'liability', subtype: 'current_liability', parent_id: acCurrentLiab.id, is_active: true }).returning('*');
  const [acTaxPayable] = await knex('accounts').insert({ company_id: company.id, code: '2200', name: 'Tax Payable (PPN)', type: 'liability', subtype: 'current_liability', parent_id: acCurrentLiab.id, is_active: true }).returning('*');
  const [acAccruedLiab] = await knex('accounts').insert({ company_id: company.id, code: '2300', name: 'Accrued Liabilities', type: 'liability', subtype: 'current_liability', parent_id: acCurrentLiab.id, is_active: true }).returning('*');

  const [acLongTermLiab] = await knex('accounts').insert({ company_id: company.id, code: '2500', name: 'Long-Term Liabilities', type: 'liability', subtype: 'long_term_liability', is_summary: true, is_active: true }).returning('*');
  const [acBankLoan] = await knex('accounts').insert({ company_id: company.id, code: '2510', name: 'Bank Loan', type: 'liability', subtype: 'long_term_liability', parent_id: acLongTermLiab.id, is_active: true }).returning('*');

  // EQUITY
  const [acEquity] = await knex('accounts').insert({ company_id: company.id, code: '3000', name: 'Equity', type: 'equity', is_summary: true, is_active: true }).returning('*');
  const [acPaidInCapital] = await knex('accounts').insert({ company_id: company.id, code: '3100', name: 'Paid-In Capital', type: 'equity', parent_id: acEquity.id, is_active: true }).returning('*');
  const [acRetainedEarnings] = await knex('accounts').insert({ company_id: company.id, code: '3200', name: 'Retained Earnings', type: 'equity', parent_id: acEquity.id, is_active: true }).returning('*');

  // REVENUE
  const [acRevenue] = await knex('accounts').insert({ company_id: company.id, code: '4000', name: 'Revenue', type: 'revenue', is_summary: true, is_active: true }).returning('*');
  const [acSalesRevenue] = await knex('accounts').insert({ company_id: company.id, code: '4100', name: 'Sales Revenue', type: 'revenue', parent_id: acRevenue.id, is_active: true }).returning('*');
  const [acServiceRevenue] = await knex('accounts').insert({ company_id: company.id, code: '4200', name: 'Service Revenue', type: 'revenue', parent_id: acRevenue.id, is_active: true }).returning('*');

  // COGS
  const [acCOGS] = await knex('accounts').insert({ company_id: company.id, code: '5000', name: 'Cost of Goods Sold', type: 'cogs', is_summary: true, is_active: true }).returning('*');
  const [acCOGSSales] = await knex('accounts').insert({ company_id: company.id, code: '5100', name: 'COGS - Sales', type: 'cogs', parent_id: acCOGS.id, is_active: true }).returning('*');
  const [acMfgVariance] = await knex('accounts').insert({ company_id: company.id, code: '5200', name: 'Manufacturing Variance', type: 'cogs', parent_id: acCOGS.id, is_active: true }).returning('*');

  // EXPENSES
  const [acExpenses] = await knex('accounts').insert({ company_id: company.id, code: '6000', name: 'Operating Expenses', type: 'expense', is_summary: true, is_active: true }).returning('*');
  const [acSalaryExp] = await knex('accounts').insert({ company_id: company.id, code: '6100', name: 'Salaries & Wages', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');
  const [acRentExp] = await knex('accounts').insert({ company_id: company.id, code: '6200', name: 'Rent Expense', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');
  const [acUtilityExp] = await knex('accounts').insert({ company_id: company.id, code: '6300', name: 'Utilities', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');
  const [acDeprecExp] = await knex('accounts').insert({ company_id: company.id, code: '6400', name: 'Depreciation Expense', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');
  const [acMfgOverhead] = await knex('accounts').insert({ company_id: company.id, code: '6500', name: 'Manufacturing Overhead', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');
  const [acMfgLabor] = await knex('accounts').insert({ company_id: company.id, code: '6510', name: 'Direct Labor', type: 'expense', parent_id: acExpenses.id, is_active: true }).returning('*');

  // Update tax account references
  await knex('tax_codes').where({ id: taxPpn.id }).update({ tax_account: acTaxPayable.code });

  // ============================================================
  // FISCAL YEAR & ACCOUNTING PERIODS
  // ============================================================
  const [fy2026] = await knex('fiscal_years').insert({
    company_id: company.id, name: 'Fiscal Year 2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open',
  }).returning('*');

  const months = [
    { name: 'Jan 2026', num: 1, start: '2026-01-01', end: '2026-01-31' },
    { name: 'Feb 2026', num: 2, start: '2026-02-01', end: '2026-02-28' },
    { name: 'Mar 2026', num: 3, start: '2026-03-01', end: '2026-03-31' },
    { name: 'Apr 2026', num: 4, start: '2026-04-01', end: '2026-04-30' },
    { name: 'May 2026', num: 5, start: '2026-05-01', end: '2026-05-31' },
    { name: 'Jun 2026', num: 6, start: '2026-06-01', end: '2026-06-30' },
    { name: 'Jul 2026', num: 7, start: '2026-07-01', end: '2026-07-31' },
    { name: 'Aug 2026', num: 8, start: '2026-08-01', end: '2026-08-31' },
    { name: 'Sep 2026', num: 9, start: '2026-09-01', end: '2026-09-30' },
    { name: 'Oct 2026', num: 10, start: '2026-10-01', end: '2026-10-31' },
    { name: 'Nov 2026', num: 11, start: '2026-11-01', end: '2026-11-30' },
    { name: 'Dec 2026', num: 12, start: '2026-12-01', end: '2026-12-31' },
  ];

  const periodInserts = months.map(m => ({
    company_id: company.id,
    fiscal_year_id: fy2026.id,
    name: m.name,
    period_number: m.num,
    start_date: m.start,
    end_date: m.end,
    status: m.num <= 8 ? 'closed' : 'open',
  }));
  await knex('accounting_periods').insert(periodInserts);

  // ============================================================
  // TRANSACTION SEQUENCES
  // ============================================================
  await knex('transaction_sequences').insert([
    { company_id: company.id, transaction_type: 'quotation', prefix: 'QT', last_number: 5, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'sales_order', prefix: 'SO', last_number: 8, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'fulfillment', prefix: 'IF', last_number: 6, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'invoice', prefix: 'INV', last_number: 12, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'customer_payment', prefix: 'RCPT', last_number: 8, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'credit_memo', prefix: 'CM', last_number: 2, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'purchase_requisition', prefix: 'PR', last_number: 4, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'purchase_order', prefix: 'PO', last_number: 6, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'item_receipt', prefix: 'GRN', last_number: 6, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'vendor_bill', prefix: 'BILL', last_number: 6, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'vendor_payment', prefix: 'PYMT', last_number: 5, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'inventory_adjustment', prefix: 'ADJ', last_number: 3, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'inventory_transfer', prefix: 'TRF', last_number: 2, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'journal_entry', prefix: 'JE', last_number: 20, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'work_order', prefix: 'WO', last_number: 3, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'material_issue', prefix: 'MI', last_number: 3, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'wo_completion', prefix: 'WOC', last_number: 2, min_digits: 6, include_year: true },
    { company_id: company.id, transaction_type: 'mrp_plan', prefix: 'MRP', last_number: 1, min_digits: 6, include_year: true },
  ]);

  // ============================================================
  // ITEM CATEGORIES
  // ============================================================
  const [catRM] = await knex('item_categories').insert({ company_id: company.id, code: 'RM', name: 'Raw Materials', is_active: true }).returning('*');
  const [catFG] = await knex('item_categories').insert({ company_id: company.id, code: 'FG', name: 'Finished Goods', is_active: true }).returning('*');
  const [catSFG] = await knex('item_categories').insert({ company_id: company.id, code: 'SFG', name: 'Semi-Finished Goods', is_active: true }).returning('*');
  const [catPKG] = await knex('item_categories').insert({ company_id: company.id, code: 'PKG', name: 'Packaging', is_active: true }).returning('*');
  const [catCONS] = await knex('item_categories').insert({ company_id: company.id, code: 'CONS', name: 'Consumables', is_active: true }).returning('*');
  const [catSVC] = await knex('item_categories').insert({ company_id: company.id, code: 'SVC', name: 'Services', is_active: true }).returning('*');

  // ============================================================
  // ITEMS
  // ============================================================
  const [itemRM001] = await knex('items').insert({
    company_id: company.id, item_code: 'RM-001', sku: 'RM001', name: 'Raw Material A - Resin', type: 'raw_material',
    category_id: catRM.id, brand: 'Material Corp', base_uom_id: uomKg.id, purchase_uom_id: uomKg.id, stock_uom_id: uomKg.id,
    standard_cost: 25000, average_cost: 25000, last_purchase_price: 25000, sales_price: 0,
    income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id, inventory_account_id: acRawMaterial.id,
    reorder_point: 100, safety_stock: 50, lead_time_days: 7, is_lot_tracked: false,
    is_purchasable: true, is_sellable: false, is_stockable: true, is_active: true, created_by: adminUser.id,
  }).returning('*');

  const [itemRM002] = await knex('items').insert({
    company_id: company.id, item_code: 'RM-002', sku: 'RM002', name: 'Raw Material B - Polymer', type: 'raw_material',
    category_id: catRM.id, brand: 'Polymer Tech', base_uom_id: uomKg.id, purchase_uom_id: uomKg.id, stock_uom_id: uomKg.id,
    standard_cost: 18000, average_cost: 18000, last_purchase_price: 18000, sales_price: 0,
    income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id, inventory_account_id: acRawMaterial.id,
    reorder_point: 200, safety_stock: 100, lead_time_days: 14, is_lot_tracked: true,
    is_purchasable: true, is_sellable: false, is_stockable: true, is_active: true, created_by: adminUser.id,
  }).returning('*');

  const [itemPKG001] = await knex('items').insert({
    company_id: company.id, item_code: 'PKG-001', sku: 'PKG001', name: 'Packaging Box A', type: 'packaging',
    category_id: catPKG.id, base_uom_id: uomPcs.id, purchase_uom_id: uomBox.id, stock_uom_id: uomPcs.id,
    standard_cost: 2500, average_cost: 2500, last_purchase_price: 2500, sales_price: 0,
    income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id, inventory_account_id: acRawMaterial.id,
    reorder_point: 500, safety_stock: 200, lead_time_days: 5,
    is_purchasable: true, is_sellable: false, is_stockable: true, is_active: true, created_by: adminUser.id,
  }).returning('*');

  const [itemFGA] = await knex('items').insert({
    company_id: company.id, item_code: 'FG-001', sku: 'FGA001', name: 'Product A - Industrial Component', type: 'finished_goods',
    category_id: catFG.id, brand: 'CloudMFG', base_uom_id: uomPcs.id, sales_uom_id: uomPcs.id, stock_uom_id: uomPcs.id,
    standard_cost: 125000, average_cost: 125000, sales_price: 185000,
    tax_code_id: taxPpn.id, income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id,
    inventory_account_id: acFG.id,
    reorder_point: 50, safety_stock: 20, lead_time_days: 3,
    is_purchasable: false, is_sellable: true, is_stockable: true, is_active: true, created_by: adminUser.id,
  }).returning('*');

  const [itemFGB] = await knex('items').insert({
    company_id: company.id, item_code: 'FG-002', sku: 'FGB001', name: 'Product B - Premium Component', type: 'finished_goods',
    category_id: catFG.id, brand: 'CloudMFG', base_uom_id: uomPcs.id, sales_uom_id: uomPcs.id, stock_uom_id: uomPcs.id,
    standard_cost: 220000, average_cost: 220000, sales_price: 320000,
    tax_code_id: taxPpn.id, income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id,
    inventory_account_id: acFG.id,
    reorder_point: 30, safety_stock: 10, lead_time_days: 5,
    is_purchasable: false, is_sellable: true, is_stockable: true, is_active: true, created_by: adminUser.id,
  }).returning('*');

  // ============================================================
  // VENDORS
  // ============================================================
  const [vendorA] = await knex('vendors').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    vendor_number: 'V-000001', name: 'PT Bahan Baku Utama', type: 'company',
    email: 'purchasing@bbu.co.id', phone: '+62 21 1234 5678', tax_id: '01.111.111.1-001.000',
    address: 'Jl. Industri No. 15', city: 'Tangerang', country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net30', ap_account_id: acAP.id,
    expense_account_id: acMfgOverhead.id, department_id: deptPurchasing.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  const [vendorB] = await knex('vendors').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    vendor_number: 'V-000002', name: 'PT Polimer Nusantara', type: 'company',
    email: 'sales@polimer.co.id', phone: '+62 21 9876 5432', tax_id: '01.222.222.2-002.000',
    address: 'Jl. Kimia Raya No. 8', city: 'Bekasi', country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net45', ap_account_id: acAP.id,
    expense_account_id: acMfgOverhead.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  const [vendorC] = await knex('vendors').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    vendor_number: 'V-000003', name: 'PT Kemasan Pratama', type: 'company',
    email: 'order@kemasan.co.id', phone: '+62 21 5555 4444', tax_id: '01.333.333.3-003.000',
    address: 'Jl. Kemasan No. 22', city: 'Bogor', country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net30', ap_account_id: acAP.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  // Vendor contacts
  await knex('vendor_contacts').insert([
    { vendor_id: vendorA.id, name: 'Hendra Kurniawan', title: 'Sales Manager', email: 'hendra@bbu.co.id', phone: '+62 812 1111 2222', is_primary: true },
    { vendor_id: vendorB.id, name: 'Wati Rahayu', title: 'Account Manager', email: 'wati@polimer.co.id', phone: '+62 813 3333 4444', is_primary: true },
    { vendor_id: vendorC.id, name: 'Agus Prianto', title: 'Sales Rep', email: 'agus@kemasan.co.id', phone: '+62 814 5555 6666', is_primary: true },
  ]);

  // ============================================================
  // CUSTOMERS
  // ============================================================
  const [custA] = await knex('customers').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    customer_number: 'C-000001', name: 'PT Elektronik Maju', company_name: 'PT Elektronik Maju Tbk',
    type: 'company', email: 'purchasing@elmaju.co.id', phone: '+62 21 7777 8888', tax_id: '01.444.444.4-004.000',
    billing_address: 'Jl. Gatot Subroto No. 55', billing_city: 'Jakarta', billing_country: 'Indonesia',
    shipping_address: 'Jl. Gatot Subroto No. 55', shipping_city: 'Jakarta', shipping_country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net30', credit_limit: 500000000,
    sales_rep_id: salesUser.id, ar_account_id: acAR.id, department_id: deptSales.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  const [custB] = await knex('customers').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    customer_number: 'C-000002', name: 'CV Teknologi Mandiri', company_name: 'CV Teknologi Mandiri',
    type: 'company', email: 'pembelian@tekmandiri.co.id', phone: '+62 22 1111 2222', tax_id: '01.555.555.5-005.000',
    billing_address: 'Jl. Asia Afrika No. 10', billing_city: 'Bandung', billing_country: 'Indonesia',
    shipping_address: 'Jl. Asia Afrika No. 10', shipping_city: 'Bandung', shipping_country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net45', credit_limit: 200000000,
    sales_rep_id: salesUser.id, ar_account_id: acAR.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  const [custC] = await knex('customers').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    customer_number: 'C-000003', name: 'PT Industri Surabaya', company_name: 'PT Industri Surabaya',
    type: 'company', email: 'procurement@indsby.co.id', phone: '+62 31 3333 4444',
    billing_address: 'Jl. Rungkut No. 100', billing_city: 'Surabaya', billing_country: 'Indonesia',
    shipping_address: 'Jl. Rungkut No. 100', shipping_city: 'Surabaya', shipping_country: 'Indonesia',
    currency: 'IDR', payment_terms: 'Net30', credit_limit: 750000000,
    sales_rep_id: salesUser.id, ar_account_id: acAR.id, status: 'active',
    created_by: adminUser.id,
  }).returning('*');

  await knex('customer_contacts').insert([
    { customer_id: custA.id, name: 'Dewi Kusuma', title: 'Purchasing Manager', email: 'dewi@elmaju.co.id', phone: '+62 811 7777 8888', is_primary: true },
    { customer_id: custB.id, name: 'Rudi Setiawan', title: 'Procurement Officer', email: 'rudi@tekmandiri.co.id', phone: '+62 812 9999 0000', is_primary: true },
    { customer_id: custC.id, name: 'Rina Hartono', title: 'Director', email: 'rina@indsby.co.id', phone: '+62 813 1111 2222', is_primary: true },
  ]);

  // ============================================================
  // INVENTORY BALANCES (Opening Stock)
  // ============================================================
  await knex('inventory_balances').insert([
    { company_id: company.id, item_id: itemRM001.id, location_id: locFactoryA.id, warehouse_id: whFabA.id, bin_id: binFab1.id, qty_on_hand: 500, avg_cost: 25000 },
    { company_id: company.id, item_id: itemRM002.id, location_id: locFactoryA.id, warehouse_id: whFabA.id, bin_id: binFab1.id, qty_on_hand: 300, avg_cost: 18000 },
    { company_id: company.id, item_id: itemPKG001.id, location_id: locFactoryA.id, warehouse_id: whFabA.id, qty_on_hand: 1000, avg_cost: 2500 },
    { company_id: company.id, item_id: itemFGA.id, location_id: locJakarta.id, warehouse_id: whJKT.id, bin_id: binA1.id, qty_on_hand: 120, avg_cost: 125000 },
    { company_id: company.id, item_id: itemFGB.id, location_id: locJakarta.id, warehouse_id: whJKT.id, bin_id: binA1.id, qty_on_hand: 80, avg_cost: 220000 },
    { company_id: company.id, item_id: itemFGA.id, location_id: locBandung.id, warehouse_id: whBDG.id, qty_on_hand: 50, avg_cost: 125000 },
  ]);

  // ============================================================
  // MANUFACTURING: Work Centers, BOM, Routing
  // ============================================================
  const [wcCutting] = await knex('work_centers').insert({
    company_id: company.id, code: 'WC-CUT', name: 'Cutting Station',
    location_id: locFactoryA.id, capacity: 8, labor_rate: 75000, machine_rate: 50000, overhead_rate: 25000, efficiency_percent: 95,
  }).returning('*');

  const [wcAssembly] = await knex('work_centers').insert({
    company_id: company.id, code: 'WC-ASM', name: 'Assembly Station',
    location_id: locFactoryA.id, capacity: 8, labor_rate: 85000, machine_rate: 60000, overhead_rate: 30000, efficiency_percent: 90,
  }).returning('*');

  const [wcTesting] = await knex('work_centers').insert({
    company_id: company.id, code: 'WC-TST', name: 'Quality Testing',
    location_id: locFactoryA.id, capacity: 8, labor_rate: 90000, machine_rate: 40000, overhead_rate: 20000, efficiency_percent: 100,
  }).returning('*');

  const [wcPacking] = await knex('work_centers').insert({
    company_id: company.id, code: 'WC-PCK', name: 'Packing Station',
    location_id: locFactoryA.id, capacity: 8, labor_rate: 65000, machine_rate: 30000, overhead_rate: 15000, efficiency_percent: 98,
  }).returning('*');

  // BOM for Product A
  const [bomFGA] = await knex('boms').insert({
    company_id: company.id, bom_number: 'BOM-2026-000001',
    name: 'Product A - Standard BOM',
    finished_good_id: itemFGA.id, revision: '1', effective_date: '2026-01-01',
    quantity: 1, uom_id: uomPcs.id, yield_percent: 98, status: 'active',
    description: 'Standard BOM for Product A - Industrial Component', created_by: adminUser.id,
  }).returning('*');

  await knex('bom_components').insert([
    { bom_id: bomFGA.id, sequence: 10, item_id: itemRM001.id, quantity: 2, uom_id: uomKg.id, scrap_percent: 2, supply_type: 'pull' },
    { bom_id: bomFGA.id, sequence: 20, item_id: itemRM002.id, quantity: 1, uom_id: uomKg.id, scrap_percent: 1, supply_type: 'pull' },
    { bom_id: bomFGA.id, sequence: 30, item_id: itemPKG001.id, quantity: 1, uom_id: uomPcs.id, scrap_percent: 0, supply_type: 'pull' },
  ]);

  // BOM for Product B
  const [bomFGB] = await knex('boms').insert({
    company_id: company.id, bom_number: 'BOM-2026-000002',
    name: 'Product B - Premium BOM',
    finished_good_id: itemFGB.id, revision: '1', effective_date: '2026-01-01',
    quantity: 1, uom_id: uomPcs.id, yield_percent: 97, status: 'active',
    description: 'Standard BOM for Product B - Premium Component', created_by: adminUser.id,
  }).returning('*');

  await knex('bom_components').insert([
    { bom_id: bomFGB.id, sequence: 10, item_id: itemRM001.id, quantity: 3, uom_id: uomKg.id, scrap_percent: 2, supply_type: 'pull' },
    { bom_id: bomFGB.id, sequence: 20, item_id: itemRM002.id, quantity: 2, uom_id: uomKg.id, scrap_percent: 1, supply_type: 'pull' },
    { bom_id: bomFGB.id, sequence: 30, item_id: itemPKG001.id, quantity: 1, uom_id: uomPcs.id, scrap_percent: 0, supply_type: 'pull' },
  ]);

  // Routing for Product A
  const [routingA] = await knex('routings').insert({
    company_id: company.id, routing_number: 'RT-2026-000001',
    name: 'Product A Standard Routing', item_id: itemFGA.id, status: 'active',
  }).returning('*');

  await knex('routing_operations').insert([
    { routing_id: routingA.id, sequence: 10, operation_name: 'Cutting', work_center_id: wcCutting.id, setup_time: 0.5, run_time_per_unit: 0.05, labor_cost_per_hour: 75000, machine_cost_per_hour: 50000, overhead_cost_per_hour: 25000 },
    { routing_id: routingA.id, sequence: 20, operation_name: 'Assembly', work_center_id: wcAssembly.id, setup_time: 0.25, run_time_per_unit: 0.1, labor_cost_per_hour: 85000, machine_cost_per_hour: 60000, overhead_cost_per_hour: 30000 },
    { routing_id: routingA.id, sequence: 30, operation_name: 'Quality Testing', work_center_id: wcTesting.id, setup_time: 0.25, run_time_per_unit: 0.02, labor_cost_per_hour: 90000, machine_cost_per_hour: 40000, overhead_cost_per_hour: 20000 },
    { routing_id: routingA.id, sequence: 40, operation_name: 'Packing', work_center_id: wcPacking.id, setup_time: 0.1, run_time_per_unit: 0.02, labor_cost_per_hour: 65000, machine_cost_per_hour: 30000, overhead_cost_per_hour: 15000 },
  ]);

  // ============================================================
  // DEMO WORK ORDER
  // ============================================================
  const [wo1] = await knex('work_orders').insert({
    company_id: company.id, subsidiary_id: subManufacturing.id,
    wo_number: 'WO-2026-000001',
    item_id: itemFGA.id, planned_quantity: 1000, uom_id: uomPcs.id,
    bom_id: bomFGA.id, routing_id: routingA.id,
    location_id: locFactoryA.id, warehouse_id: whFabA.id,
    planned_start_date: '2026-09-01', planned_end_date: '2026-09-10',
    status: 'released',
    estimated_material_cost: 70500000,
    estimated_labor_cost: 12250000,
    estimated_machine_cost: 9250000,
    estimated_overhead_cost: 5000000,
    created_by: adminUser.id,
  }).returning('*');

  await knex('work_order_materials').insert([
    { wo_id: wo1.id, item_id: itemRM001.id, planned_quantity: 2040, issued_quantity: 0, uom_id: uomKg.id, standard_cost: 25000 },
    { wo_id: wo1.id, item_id: itemRM002.id, planned_quantity: 1010, issued_quantity: 0, uom_id: uomKg.id, standard_cost: 18000 },
    { wo_id: wo1.id, item_id: itemPKG001.id, planned_quantity: 1020, issued_quantity: 0, uom_id: uomPcs.id, standard_cost: 2500 },
  ]);

  // ============================================================
  // DEMO SALES ORDER
  // ============================================================
  const [so1] = await knex('sales_orders').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    so_number: 'SO-2026-000001',
    customer_id: custA.id, order_date: '2026-08-15', expected_ship_date: '2026-08-25',
    currency: 'IDR', exchange_rate: 1, payment_terms: 'Net30',
    sales_rep_id: salesUser.id, location_id: locJakarta.id, department_id: deptSales.id,
    status: 'pending_billing',
    memo: 'Priority order for Q3 2026',
    subtotal: 18500000, tax_amount: 2035000, total_amount: 20535000,
    approved_by: adminUser.id, approved_at: new Date('2026-08-16'),
    created_by: salesUser.id,
  }).returning('*');

  const [soLine1] = await knex('sales_order_lines').insert({
    so_id: so1.id, line_number: 1, item_id: itemFGA.id,
    description: 'Product A - Industrial Component',
    quantity: 100, qty_fulfilled: 100, qty_billed: 0,
    uom_id: uomPcs.id, unit_price: 185000, discount_percent: 0,
    tax_code_id: taxPpn.id, tax_amount: 2035000, amount: 18500000,
  }).returning('*');

  // Invoice for the SO
  const [inv1] = await knex('invoices').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    invoice_number: 'INV-2026-000001',
    so_id: so1.id, customer_id: custA.id,
    invoice_date: '2026-08-25', due_date: '2026-09-24',
    currency: 'IDR', exchange_rate: 1, payment_terms: 'Net30',
    location_id: locJakarta.id, department_id: deptSales.id,
    status: 'open',
    subtotal: 18500000, tax_amount: 2035000, total_amount: 20535000,
    amount_paid: 0, amount_due: 20535000,
    ar_account_id: acAR.id, is_posted: true,
    posted_by: financeUser.id, posted_at: new Date('2026-08-25'),
    created_by: salesUser.id,
  }).returning('*');

  await knex('invoice_lines').insert({
    invoice_id: inv1.id, so_line_id: soLine1.id, line_number: 1, item_id: itemFGA.id,
    description: 'Product A - Industrial Component',
    quantity: 100, uom_id: uomPcs.id, unit_price: 185000,
    tax_code_id: taxPpn.id, tax_amount: 2035000, amount: 18500000,
    income_account_id: acSalesRevenue.id, cogs_account_id: acCOGSSales.id, cogs_amount: 12500000,
  });

  // ============================================================
  // DEMO PURCHASE ORDER
  // ============================================================
  const [po1] = await knex('purchase_orders').insert({
    company_id: company.id, subsidiary_id: subManufacturing.id,
    po_number: 'PO-2026-000001',
    vendor_id: vendorA.id, order_date: '2026-08-20', expected_receipt_date: '2026-08-30',
    currency: 'IDR', exchange_rate: 1, payment_terms: 'Net30',
    location_id: locFactoryA.id, warehouse_id: whFabA.id, department_id: deptPurchasing.id,
    status: 'fully_received',
    subtotal: 50000000, tax_amount: 5500000, total_amount: 55500000,
    approved_by: adminUser.id, approved_at: new Date('2026-08-21'),
    created_by: mfgUser.id,
  }).returning('*');

  const [poLine1] = await knex('purchase_order_lines').insert({
    po_id: po1.id, line_number: 1, item_id: itemRM001.id,
    description: 'Raw Material A - Resin',
    quantity: 2000, qty_received: 2000, qty_billed: 2000,
    uom_id: uomKg.id, unit_price: 25000,
    tax_code_id: taxPpn.id, tax_amount: 5500000, amount: 50000000,
    expense_account_id: acRawMaterial.id,
  }).returning('*');

  // Vendor Bill
  await knex('vendor_bills').insert({
    company_id: company.id, subsidiary_id: subManufacturing.id,
    bill_number: 'BILL-2026-000001',
    vendor_invoice_number: 'BBU-INV-2026-0456',
    po_id: po1.id, vendor_id: vendorA.id,
    bill_date: '2026-08-30', due_date: '2026-09-29',
    currency: 'IDR', exchange_rate: 1, payment_terms: 'Net30',
    location_id: locFactoryA.id, department_id: deptPurchasing.id,
    status: 'open',
    subtotal: 50000000, tax_amount: 5500000, total_amount: 55500000,
    amount_paid: 0, amount_due: 55500000,
    ap_account_id: acAP.id, is_posted: true,
    created_by: mfgUser.id,
  });

  // ============================================================
  // JOURNAL ENTRIES (Sample)
  // ============================================================
  const period9 = await knex('accounting_periods')
    .where({ company_id: company.id, period_number: 9 })
    .first();

  // Invoice GL
  const [je1] = await knex('journal_entries').insert({
    company_id: company.id, subsidiary_id: subTrading.id,
    journal_number: 'JE-2026-000001',
    entry_date: '2026-08-25', period_id: period9.id,
    currency: 'IDR', exchange_rate: 1, type: 'system',
    source_type: 'invoice', source_id: inv1.id,
    memo: 'Sales Invoice INV-2026-000001 - PT Elektronik Maju',
    status: 'posted', posted_by: financeUser.id, posted_at: new Date('2026-08-25'),
    created_by: financeUser.id,
  }).returning('*');

  await knex('journal_entry_lines').insert([
    { journal_id: je1.id, line_number: 1, account_id: acAR.id, debit: 20535000, credit: 0, debit_base: 20535000, credit_base: 0, entity_customer_id: custA.id, memo: 'AR - PT Elektronik Maju' },
    { journal_id: je1.id, line_number: 2, account_id: acSalesRevenue.id, debit: 0, credit: 18500000, debit_base: 0, credit_base: 18500000, memo: 'Sales Revenue' },
    { journal_id: je1.id, line_number: 3, account_id: acTaxPayable.id, debit: 0, credit: 2035000, debit_base: 0, credit_base: 2035000, memo: 'PPN Payable' },
    { journal_id: je1.id, line_number: 4, account_id: acCOGSSales.id, debit: 12500000, credit: 0, debit_base: 12500000, credit_base: 0, memo: 'COGS - Product A' },
    { journal_id: je1.id, line_number: 5, account_id: acFG.id, debit: 0, credit: 12500000, debit_base: 0, credit_base: 12500000, memo: 'Inventory reduction - FG' },
  ]);

  // PO Receipt GL
  const [je2] = await knex('journal_entries').insert({
    company_id: company.id, subsidiary_id: subManufacturing.id,
    journal_number: 'JE-2026-000002',
    entry_date: '2026-08-30', period_id: period9.id,
    currency: 'IDR', exchange_rate: 1, type: 'system',
    source_type: 'vendor_bill',
    memo: 'Vendor Bill BILL-2026-000001 - PT Bahan Baku Utama',
    status: 'posted', posted_by: financeUser.id, posted_at: new Date('2026-08-30'),
    created_by: financeUser.id,
  }).returning('*');

  await knex('journal_entry_lines').insert([
    { journal_id: je2.id, line_number: 1, account_id: acRawMaterial.id, debit: 50000000, credit: 0, debit_base: 50000000, credit_base: 0, memo: 'Raw Material Receipt' },
    { journal_id: je2.id, line_number: 2, account_id: acTaxPayable.id, debit: 5500000, credit: 0, debit_base: 5500000, credit_base: 0, memo: 'PPN Input' },
    { journal_id: je2.id, line_number: 3, account_id: acAP.id, debit: 0, credit: 55500000, debit_base: 0, credit_base: 55500000, entity_vendor_id: vendorA.id, memo: 'AP - PT Bahan Baku Utama' },
  ]);

  console.log('✅ Demo data seeded successfully');
  console.log('   Company: Cloud Manufacturing Indonesia');
  console.log('   Admin User: admin@cloudmfg.co.id / CloudERP@2026');
}
