import db from '../../config/database';
import { generateTransactionNumber } from '../../utils/sequence';
import { AppError } from '../../middleware/errorHandler';

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  entityCustomerId?: string;
  entityVendorId?: string;
  departmentId?: string;
  locationId?: string;
  memo?: string;
  currency?: string;
}

interface CreateJournalParams {
  companyId: string;
  subsidiaryId?: string;
  date: string;
  currency?: string;
  exchangeRate?: number;
  type?: string;
  sourceType?: string;
  sourceId?: string;
  memo: string;
  lines: JournalLine[];
  createdBy: string;
  trx: any;
  // When true, the journal entry is created with status 'non_posting': it appears
  // in the transaction's GL Impact tab but is EXCLUDED from all financial reports
  // (every report query filters status='posted'). Used for pending-approval records;
  // the approve step flips it to 'posted'. Default false = posted immediately.
  nonPosting?: boolean;
}

export class AccountingEngine {
  /**
   * Core method: create a balanced journal entry.
   * All accounting entries must flow through this method.
   */
  static async createJournalEntry(params: CreateJournalParams): Promise<any> {
    const {
      companyId, subsidiaryId, date, currency = 'IDR', exchangeRate = 1,
      type = 'system', sourceType, sourceId, memo, lines, createdBy, trx,
      nonPosting = false,
    } = params;

    const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new AppError(
        `Journal entry is not balanced. Debit: ${totalDebit.toLocaleString()} ≠ Credit: ${totalCredit.toLocaleString()}`,
        400
      );
    }

    const period = await trx('accounting_periods')
      .where({ company_id: companyId })
      .where('start_date', '<=', date)
      .where('end_date', '>=', date)
      .first();

    if (period && period.status === 'locked') {
      throw new AppError(`Accounting period ${period.name} is locked.`, 400);
    }

    const journalNumber = await generateTransactionNumber(companyId, 'journal_entry', trx);

    const [je] = await trx('journal_entries').insert({
      company_id: companyId, subsidiary_id: subsidiaryId,
      journal_number: journalNumber, entry_date: date, period_id: period?.id,
      currency, exchange_rate: exchangeRate, type,
      source_type: sourceType, source_id: sourceId, memo,
      // Non-posting entries are deferred until approval; they stay out of reports.
      status: nonPosting ? 'non_posting' : 'posted',
      posted_by: nonPosting ? null : createdBy,
      posted_at: nonPosting ? null : new Date(),
      created_by: createdBy,
    }).returning('*');

    const lineInserts = lines.map((line, idx) => ({
      journal_id: je.id, line_number: idx + 1,
      account_id: line.accountId,
      debit: line.debit || 0, credit: line.credit || 0,
      debit_base: (line.debit || 0) * exchangeRate,
      credit_base: (line.credit || 0) * exchangeRate,
      currency,
      entity_customer_id: line.entityCustomerId || null,
      entity_vendor_id: line.entityVendorId || null,
      department_id: line.departmentId || null,
      location_id: line.locationId || null,
      memo: line.memo || null,
    }));

    await trx('journal_entry_lines').insert(lineInserts);
    return je;
  }

  static async getDefaultAccount(companyId: string, code: string, trx: any): Promise<string | null> {
    const acct = await trx('accounts').where({ company_id: companyId, code, is_active: true }).first();
    return acct?.id || null;
  }

  /**
   * Flip all NON-POSTING journal entries for a source record to 'posted' (used by
   * the approval step). Only touches status='non_posting' rows, so it's a no-op for
   * records that were posted immediately. Returns the number of entries posted.
   */
  static async postDeferredJournal(sourceType: string, sourceId: string, userId: string, trx: any): Promise<number> {
    const n = await trx('journal_entries')
      .where({ source_type: sourceType, source_id: sourceId, status: 'non_posting' })
      .update({ status: 'posted', posted_by: userId, posted_at: new Date() });
    return n;
  }

  // ─── TASK 1 & 2: Item Fulfillment GL ─────────────────────────────────────────
  /**
   * Post Item Fulfillment:
   *   Dr. COGS
   *   Cr. Finished Goods Inventory (1230)
   *
   * This replaces COGS posting that was previously in postInvoice.
   */
  static async postItemFulfillment(fulfillmentId: string, userId: string, trx: any): Promise<void> {
    const fulfillment = await trx('item_fulfillments as ff')
      .where('ff.id', fulfillmentId)
      .first();

    if (!fulfillment) throw new AppError('Item fulfillment not found', 404);

    const ffLines = await trx('item_fulfillment_lines as ffl')
      .join('items as i', 'ffl.item_id', 'i.id')
      .leftJoin('sales_order_lines as sol', 'ffl.so_line_id', 'sol.id')
      .where('ffl.fulfillment_id', fulfillmentId)
      .select('ffl.*', 'i.name as item_name', 'i.item_code',
        'i.cogs_account_id', 'i.inventory_account_id', 'i.asset_account_id',
        'i.average_cost', 'i.standard_cost', 'i.last_purchase_price', 'i.purchase_price',
        'sol.unit_price as so_unit_price');

    // Get SO to find company_id
    const so = await trx('sales_orders').where({ id: fulfillment.so_id }).first();
    const companyId = so?.company_id || fulfillment.company_id;

    const defaultCOGS = await AccountingEngine.getDefaultAccount(companyId, '5100', trx);
    const defaultFGInventory = await AccountingEngine.getDefaultAccount(companyId, '1230', trx)
      || await AccountingEngine.getDefaultAccount(companyId, '1200', trx);

    const jeLines: JournalLine[] = [];

    for (const line of ffLines) {
      // Cost basis fallback: average_cost → standard_cost → last purchase → purchase price → SO line unit price.
      // (Many demo items carry no recorded cost; without a fallback the COGS JE would be skipped and GL stays empty.)
      const firstPositive = (...vals: any[]): number => {
        for (const v of vals) { const n = parseFloat(v || '0'); if (n > 0) return n; }
        return 0;
      };
      const unitCost = firstPositive(line.average_cost, line.standard_cost, line.last_purchase_price, line.purchase_price, line.so_unit_price);
      const cogsAmount = parseFloat(line.quantity) * unitCost;

      if (cogsAmount <= 0) continue;

      // Dr = item's COGS account; Cr = item's Inventory account (else Asset account)
      const cogsAccountId = line.cogs_account_id || defaultCOGS;
      const inventoryAccountId = line.inventory_account_id || line.asset_account_id || defaultFGInventory;

      if (!cogsAccountId || !inventoryAccountId) continue;

      // Dr. COGS
      jeLines.push({
        accountId: cogsAccountId,
        debit: cogsAmount,
        credit: 0,
        memo: `COGS - ${line.item_code} x${line.quantity}`,
      });
      // Cr. Inventory / Asset
      jeLines.push({
        accountId: inventoryAccountId,
        debit: 0,
        credit: cogsAmount,
        memo: `Inventory Out - ${line.item_code} x${line.quantity}`,
      });
    }

    if (jeLines.length === 0) return; // Nothing to post (service items, zero cost)

    const soData = await trx('sales_orders').where({ id: fulfillment.so_id }).first();
    const ffNumber = fulfillment.fulfillment_number;

    await AccountingEngine.createJournalEntry({
      companyId,
      date: fulfillment.fulfillment_date,
      sourceType: 'item_fulfillment',
      sourceId: fulfillmentId,
      memo: `Item Fulfillment ${ffNumber} - COGS Recognition`,
      lines: jeLines,
      createdBy: userId,
      trx,
    });
  }

  // ─── TASK 2: Sales Invoice GL (no COGS) ──────────────────────────────────────
  /**
   * Post Sales Invoice:
   *   Dr. Accounts Receivable
   *   Cr. Revenue (by line)
   *   Cr. Tax Payable (PPN Output)
   *
   * NOTE: COGS is now posted at Item Fulfillment stage, NOT here.
   */
  static async postInvoice(invoiceId: string, userId: string, trx: any): Promise<void> {
    const invoice = await trx('invoices as i')
      .join('customers as c', 'i.customer_id', 'c.id')
      .select('i.*', 'c.name as customer_name', 'c.ar_account_id as cust_ar_account_id')
      .where('i.id', invoiceId)
      .first();

    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.is_posted) throw new AppError('Invoice is already posted', 400);

    const lines = await trx('invoice_lines as il')
      .join('items as itm', 'il.item_id', 'itm.id')
      .select('il.*', 'itm.income_account_id as item_income_account')
      .where('il.invoice_id', invoiceId);

    const defaultAR = await AccountingEngine.getDefaultAccount(invoice.company_id, '1100', trx);
    const defaultRevenue = await AccountingEngine.getDefaultAccount(invoice.company_id, '4100', trx);

    const arAccountId = invoice.ar_account_id || invoice.cust_ar_account_id || defaultAR;
    if (!arAccountId) throw new AppError('AR Account not configured.', 400);

    const jeLines: JournalLine[] = [];

    // Dr. Accounts Receivable (full invoice amount)
    jeLines.push({
      accountId: arAccountId,
      debit: parseFloat(invoice.total_amount),
      credit: 0,
      entityCustomerId: invoice.customer_id,
      memo: `AR - ${invoice.customer_name} (${invoice.invoice_number})`,
    });

    // Cr. Revenue per line
    let totalRevenueCredited = 0;
    for (const line of lines) {
      const incomeAccountId = line.income_account_id || line.item_income_account || defaultRevenue;
      if (!incomeAccountId) continue;
      const lineAmount = parseFloat(line.amount);
      jeLines.push({
        accountId: incomeAccountId,
        debit: 0,
        credit: lineAmount,
        memo: `Revenue - ${line.description || 'Item'}`,
      });
      totalRevenueCredited += lineAmount;
    }

    // Fallback: if no revenue lines credited, use subtotal to default revenue
    if (totalRevenueCredited === 0 && defaultRevenue) {
      jeLines.push({
        accountId: defaultRevenue,
        debit: 0,
        credit: parseFloat(invoice.subtotal || invoice.total_amount),
        memo: 'Revenue',
      });
    }

    // Cr. Tax Payable (PPN Output)
    const taxAmount = parseFloat(invoice.tax_amount || '0');
    if (taxAmount > 0) {
      const taxAccountId = await AccountingEngine.getDefaultAccount(invoice.company_id, '2200', trx);
      if (taxAccountId) {
        jeLines.push({
          accountId: taxAccountId,
          debit: 0,
          credit: taxAmount,
          memo: 'PPN Output',
        });
      }
    }

    await AccountingEngine.createJournalEntry({
      companyId: invoice.company_id,
      subsidiaryId: invoice.subsidiary_id,
      date: invoice.invoice_date,
      sourceType: 'invoice',
      sourceId: invoiceId,
      memo: `Sales Invoice ${invoice.invoice_number}`,
      lines: jeLines,
      createdBy: userId,
      trx,
    });

    await trx('invoices').where({ id: invoiceId }).update({ is_posted: true, posted_by: userId, posted_at: new Date() });
  }

  // ─── TASK 3: Good Receipt (Item Receipt) GL ───────────────────────────────────
  /**
   * Post Item Receipt (Goods Receipt Note):
   *   Dr. Inventory (1200/1210)
   *   Cr. Accrued AP / GR-IR (2110)
   *
   * This creates a liability until matched with Vendor Bill.
   */
  static async postItemReceipt(receiptId: string, userId: string, trx: any): Promise<void> {
    const receipt = await trx('item_receipts').where({ id: receiptId }).first();
    if (!receipt) throw new AppError('Item receipt not found', 404);

    // Pull PO-line discount so the receipt reflects the discounted (net) inventory value
    const receiptLines = await trx('item_receipt_lines as rl')
      .join('items as i', 'rl.item_id', 'i.id')
      .leftJoin('purchase_order_lines as pol', 'rl.po_line_id', 'pol.id')
      .where('rl.receipt_id', receiptId)
      .select('rl.*', 'i.name as item_name', 'i.item_code', 'i.asset_account_id', 'i.inventory_account_id', 'i.type as item_type',
        'pol.quantity as po_qty', 'pol.discount_amount as po_discount', 'pol.discount_account_id as line_discount_account');

    const po = await trx('purchase_orders').where({ id: receipt.po_id }).first();
    const companyId = receipt.company_id || po?.company_id;

    // Default accounts
    const defaultInventory = await AccountingEngine.getDefaultAccount(companyId, '1210', trx)
      || await AccountingEngine.getDefaultAccount(companyId, '1200', trx);
    const accruedAP = await AccountingEngine.getDefaultAccount(companyId, '2110', trx);

    if (!accruedAP) throw new AppError('Accrued AP account (2110) not found. Please add it to Chart of Accounts.', 400);

    const jeLines: JournalLine[] = [];
    let netTotal = 0;        // Dr Inventory (net) = Cr GRNI

    for (const line of receiptLines) {
      const unitCost = parseFloat(line.unit_cost || '0');
      const recvQty = parseFloat(line.quantity);
      const gross = recvQty * unitCost;
      if (gross <= 0) continue;

      // Discount proportional to received qty vs ordered qty
      const poQty = parseFloat(line.po_qty || 0);
      const poDisc = parseFloat(line.po_discount || 0);
      const lineDiscount = (poDisc > 0 && poQty > 0) ? Math.round((poDisc * (recvQty / poQty)) * 100) / 100 : 0;
      const net = gross - lineDiscount;

      const debitAccountId = line.asset_account_id || line.inventory_account_id || defaultInventory;
      if (!debitAccountId) continue;

      // Dr. Inventory at NET value (after discount)
      jeLines.push({
        accountId: debitAccountId,
        debit: net,
        credit: 0,
        memo: `Inventory In - ${line.item_code} x${recvQty} @ ${unitCost}${lineDiscount > 0 ? ` (net of disc ${lineDiscount})` : ''}`,
      });
      netTotal += net;
    }

    if (jeLines.length === 0 || netTotal <= 0) return;

    // Cr. Accrued AP (GR-IR) - net value (matches inventory debit)
    jeLines.push({
      accountId: accruedAP,
      debit: 0,
      credit: netTotal,
      entityVendorId: receipt.vendor_id || po?.vendor_id,
      memo: `Accrued AP - GRN ${receipt.receipt_number}`,
    });

    await AccountingEngine.createJournalEntry({
      companyId,
      date: receipt.receipt_date,
      sourceType: 'item_receipt',
      sourceId: receiptId,
      memo: `Goods Receipt ${receipt.receipt_number}`,
      lines: jeLines,
      createdBy: userId,
      trx,
    });

    // Mark the receipt as GL-posted so the list reflects "Posted".
    if (await trx.schema.hasColumn('item_receipts', 'is_posted')) {
      await trx('item_receipts').where({ id: receiptId }).update({ is_posted: true });
    }
  }

  // ─── TASK 4: Vendor Bill GL (3-way match clearing) ────────────────────────────
  /**
   * Post Vendor Bill:
   *   Dr. Accrued AP / GR-IR (2110)   ← clears the receipt accrual
   *   Cr. Accounts Payable (2100)       ← becomes formal AP
   *
   * If Tax: Dr. also Tax Input (PPN masukan)
   */
  static async postVendorBill(billId: string, userId: string, trx: any, nonPosting: boolean = false): Promise<void> {
    const bill = await trx('vendor_bills as b')
      .join('vendors as v', 'b.vendor_id', 'v.id')
      .select('b.*', 'v.name as vendor_name', 'v.ap_account_id as vendor_ap_account')
      .where('b.id', billId)
      .first();

    if (!bill) throw new AppError('Vendor bill not found', 404);
    if (bill.is_posted) throw new AppError('Bill is already posted', 400);

    const defaultAP = await AccountingEngine.getDefaultAccount(bill.company_id, '2100', trx);
    const accruedAP = await AccountingEngine.getDefaultAccount(bill.company_id, '2110', trx);

    const apAccountId = bill.ap_account_id || bill.vendor_ap_account || defaultAP;
    if (!apAccountId) throw new AppError('AP Account (2100) not configured.', 400);
    if (!accruedAP) throw new AppError('Accrued AP account (2110) not found.', 400);

    const subtotal = parseFloat(bill.subtotal || '0');
    const discountAmount = parseFloat(bill.discount_amount || '0');
    const netSubtotal = subtotal - discountAmount;   // matches the receipt's net GR-IR accrual
    const taxAmount = parseFloat(bill.tax_amount || '0');

    const jeLines: JournalLine[] = [];

    // Dr. Accrued AP / GR-IR (clears the GRN net accrual)
    jeLines.push({
      accountId: accruedAP,
      debit: netSubtotal,
      credit: 0,
      entityVendorId: bill.vendor_id,
      memo: `Clear GR-IR - ${bill.vendor_name} (${bill.bill_number})`,
    });

    // Dr. Tax Input / PPN Masukan (if applicable)
    if (taxAmount > 0) {
      const taxInputRow = await trx('accounts').where({ company_id: bill.company_id, subtype: 'tax_receivable' }).orderBy('code').first();
      const taxInputAccount = taxInputRow?.id
        || await AccountingEngine.getDefaultAccount(bill.company_id, '2220', trx)
        || await AccountingEngine.getDefaultAccount(bill.company_id, '1150', trx);
      if (taxInputAccount) {
        jeLines.push({
          accountId: taxInputAccount,
          debit: taxAmount,
          credit: 0,
          memo: `PPN Masukan - ${bill.bill_number}`,
        });
      } else {
        // Absorb tax into accrued AP if no tax input account
        jeLines[0].debit += taxAmount;
      }
    }

    // Cr. Accounts Payable = sum of debits (net accrual + tax) to keep the entry balanced
    const apCredit = jeLines.reduce((s, l) => s + (l.debit || 0), 0);
    jeLines.push({
      accountId: apAccountId,
      debit: 0,
      credit: apCredit,
      entityVendorId: bill.vendor_id,
      memo: `AP - ${bill.vendor_name} (${bill.bill_number})`,
    });

    await AccountingEngine.createJournalEntry({
      companyId: bill.company_id,
      subsidiaryId: bill.subsidiary_id,
      date: bill.bill_date,
      sourceType: 'vendor_bill',
      sourceId: billId,
      memo: `Vendor Bill ${bill.bill_number} - ${bill.vendor_name}`,
      lines: jeLines,
      createdBy: userId,
      trx,
      nonPosting,
    });

    // Only mark posted when not deferred (non-posting means we wait for approval).
    if (!nonPosting) {
      await trx('vendor_bills').where({ id: billId }).update({
        is_posted: true, posted_by: userId, posted_at: new Date(),
      });
    }
  }

  /**
   * Post Customer Payment: Bank + AR
   */
  static async postCustomerPayment(paymentId: string, userId: string, trx: any): Promise<void> {
    const payment = await trx('customer_payments as p')
      .join('customers as c', 'p.customer_id', 'c.id')
      .select('p.*', 'c.name as customer_name', 'c.ar_account_id as cust_ar_account_id')
      .where('p.id', paymentId)
      .first();

    if (!payment) throw new AppError('Payment not found', 404);
    if (payment.is_posted) throw new AppError('Payment is already posted', 400);

    const defaultBank = await AccountingEngine.getDefaultAccount(payment.company_id, '1020', trx);
    const defaultAR = await AccountingEngine.getDefaultAccount(payment.company_id, '1100', trx);

    const bankAccountId = payment.bank_account_id || defaultBank;
    const arAccountId = payment.ar_account_id || payment.cust_ar_account_id || defaultAR;

    if (!bankAccountId) throw new AppError('Bank account not configured for payment GL posting.', 400);
    if (!arAccountId) throw new AppError('AR account not configured for payment GL posting.', 400);

    const amount = parseFloat(payment.amount);

    await AccountingEngine.createJournalEntry({
      companyId: payment.company_id,
      date: payment.payment_date,
      sourceType: 'customer_payment',
      sourceId: paymentId,
      memo: `Customer Payment ${payment.payment_number}`,
      lines: [
        { accountId: bankAccountId, debit: amount, credit: 0, memo: `Receipt from ${payment.customer_name}` },
        { accountId: arAccountId, debit: 0, credit: amount, entityCustomerId: payment.customer_id, memo: `AR Settlement - ${payment.customer_name}` },
      ],
      createdBy: userId,
      trx,
    });

    await trx('customer_payments').where({ id: paymentId }).update({ is_posted: true });
  }

  /**
   * Post Vendor Payment: AP + Bank
   */
  static async postVendorPayment(paymentId: string, userId: string, trx: any): Promise<void> {
    const payment = await trx('vendor_payments as p')
      .join('vendors as v', 'p.vendor_id', 'v.id')
      .select('p.*', 'v.name as vendor_name', 'v.ap_account_id as vendor_ap_account_id')
      .where('p.id', paymentId)
      .first();

    if (!payment) throw new AppError('Vendor payment not found', 404);
    if (payment.is_posted) throw new AppError('Payment is already posted', 400);

    const defaultBank = await AccountingEngine.getDefaultAccount(payment.company_id, '1020', trx);
    const defaultAP = await AccountingEngine.getDefaultAccount(payment.company_id, '2100', trx);

    const apAccountId = payment.ap_account_id || payment.vendor_ap_account_id || defaultAP;
    const bankAccountId = payment.bank_account_id || defaultBank;

    if (!apAccountId) throw new AppError('AP account not configured.', 400);
    if (!bankAccountId) throw new AppError('Bank account not configured.', 400);

    const amount = parseFloat(payment.amount);

    await AccountingEngine.createJournalEntry({
      companyId: payment.company_id,
      date: payment.payment_date,
      sourceType: 'vendor_payment',
      sourceId: paymentId,
      memo: `Vendor Payment ${payment.payment_number} - ${payment.vendor_name}`,
      lines: [
        { accountId: apAccountId, debit: amount, credit: 0, entityVendorId: payment.vendor_id, memo: `AP Settlement - ${payment.vendor_name}` },
        { accountId: bankAccountId, debit: 0, credit: amount, memo: `Payment to ${payment.vendor_name}` },
      ],
      createdBy: userId,
      trx,
    });

    await trx('vendor_payments').where({ id: paymentId }).update({ is_posted: true });
  }

  /**
   * Work Order Material Issue: WIP + Inventory
   */
  static async postMaterialIssue(issueId: string, userId: string, trx: any): Promise<void> {
    const issue = await trx('material_issues').where({ id: issueId }).first();
    const wo = await trx('work_orders').where({ id: issue.wo_id }).first();
    const lines = await trx('material_issue_lines').where({ issue_id: issueId });

    const wipAccount = await trx('accounts').where({ company_id: wo.company_id, code: '1220' }).first();
    const jeLines: JournalLine[] = [];

    for (const line of lines) {
      const item = await trx('items').where({ id: line.item_id }).first();
      const totalCost = line.total_cost || (line.quantity * line.unit_cost);
      if (totalCost > 0 && wipAccount && item.inventory_account_id) {
        jeLines.push({ accountId: wipAccount.id, debit: totalCost, credit: 0, memo: `WIP - ${issue.issue_number}` });
        jeLines.push({ accountId: item.inventory_account_id, debit: 0, credit: totalCost, memo: `Inventory Issue to WO ${wo.wo_number}` });
      }
    }

    if (jeLines.length > 0) {
      await AccountingEngine.createJournalEntry({
        companyId: wo.company_id,
        subsidiaryId: wo.subsidiary_id,
        date: issue.issue_date,
        sourceType: 'material_issue',
        sourceId: issueId,
        memo: `Material Issue ${issue.issue_number} for WO ${wo.wo_number}`,
        lines: jeLines,
        createdBy: userId,
        trx,
      });
    }
  }

  /**
   * Work Order Completion: FG Inventory + WIP + Variance
   */
  static async postWorkOrderCompletion(completionId: string, userId: string, trx: any): Promise<void> {
    const completion = await trx('work_order_completions').where({ id: completionId }).first();
    const wo = await trx('work_orders').where({ id: completion.wo_id }).first();
    const item = await trx('items').where({ id: wo.item_id }).first();

    const wipAccount = await trx('accounts').where({ company_id: wo.company_id, code: '1220' }).first();
    const varianceAccount = await trx('accounts').where({ company_id: wo.company_id, code: '5200' }).first();
    const fgAccount = item.inventory_account_id
      || await AccountingEngine.getDefaultAccount(wo.company_id, '1230', trx);

    const totalCompletionCost = parseFloat(completion.total_cost || '0');
    const wipRelieved = parseFloat(completion.actual_material_cost || '0');

    const jeLines: JournalLine[] = [];

    if (fgAccount && totalCompletionCost > 0) {
      jeLines.push({ accountId: fgAccount, debit: totalCompletionCost, credit: 0, memo: `FG Receipt - ${wo.wo_number}` });
    }
    if (wipAccount && wipRelieved > 0) {
      jeLines.push({ accountId: wipAccount.id, debit: 0, credit: wipRelieved, memo: `WIP Relief - ${wo.wo_number}` });
    }

    const laborOverheadCost = parseFloat(completion.actual_labor_cost || '0')
      + parseFloat(completion.actual_machine_cost || '0')
      + parseFloat(completion.actual_overhead_cost || '0');
    if (laborOverheadCost > 0 && wipAccount) {
      jeLines.push({ accountId: wipAccount.id, debit: 0, credit: laborOverheadCost, memo: 'Labor/Overhead to FG' });
    }

    const expectedCost = parseFloat(wo.estimated_material_cost || '0') + parseFloat(wo.estimated_labor_cost || '0')
      + parseFloat(wo.estimated_machine_cost || '0') + parseFloat(wo.estimated_overhead_cost || '0');
    const variance = totalCompletionCost - (expectedCost * (completion.completed_quantity / wo.planned_quantity));
    if (Math.abs(variance) > 1 && varianceAccount) {
      jeLines.push({ accountId: varianceAccount.id, debit: variance > 0 ? variance : 0, credit: variance < 0 ? Math.abs(variance) : 0, memo: `Production Variance - ${wo.wo_number}` });
    }

    if (jeLines.length > 0) {
      const totalD = jeLines.reduce((s, l) => s + l.debit, 0);
      const totalC = jeLines.reduce((s, l) => s + l.credit, 0);
      const diff = totalD - totalC;
      if (Math.abs(diff) > 0.01 && wipAccount) {
        if (diff > 0) jeLines.push({ accountId: wipAccount.id, debit: 0, credit: diff, memo: 'Balancing - WIP' });
        else jeLines.push({ accountId: wipAccount.id, debit: Math.abs(diff), credit: 0, memo: 'Balancing - WIP' });
      }

      await AccountingEngine.createJournalEntry({
        companyId: wo.company_id, subsidiaryId: wo.subsidiary_id,
        date: completion.completion_date, sourceType: 'wo_completion', sourceId: completionId,
        memo: `Work Order Completion ${completion.completion_number}`,
        lines: jeLines, createdBy: userId, trx,
      });
    }
  }
}
