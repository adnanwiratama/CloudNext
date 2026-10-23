import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';

const router = Router();
router.use(authenticate);

// ─── Lazy table ensure (mirrors the ensureSavedImportsTable pattern) ──────────
let _ensured = false;
async function ensureTables(): Promise<void> {
  if (_ensured) return;
  if (!(await db.schema.hasTable('currencies'))) {
    await db.schema.createTable('currencies', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('name', 100).notNullable();
      t.string('iso_code', 10).notNullable();
      t.string('symbol', 10).nullable();
      t.boolean('is_base').defaultTo(false);
      t.boolean('is_active').defaultTo(true);
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.unique(['company_id', 'iso_code']);
    });
  }
  if (!(await db.schema.hasTable('currency_exchange_rates'))) {
    await db.schema.createTable('currency_exchange_rates', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('base_currency', 10).notNullable();
      t.string('source_currency', 10).notNullable();
      t.decimal('rate', 24, 12).notNullable();
      t.date('effective_date').notNullable();
      t.uuid('created_by').nullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.index(['company_id', 'base_currency', 'source_currency', 'effective_date'], 'idx_fx_lookup');
    });
  }
  _ensured = true;
}

// Seed a small default currency set the first time (so the list is not empty).
async function seedDefaults(companyId: string): Promise<void> {
  const count = await db('currencies').where({ company_id: companyId }).count('id as c').first();
  if (parseInt((count as any)?.c || 0) > 0) return;
  const baseIso = (await db('companies').where({ id: companyId }).first())?.base_currency || 'IDR';
  const defaults = [
    { name: 'US Dollar',      iso_code: 'USD', symbol: '$' },
    { name: 'Euro',           iso_code: 'EUR', symbol: '€' },
    { name: 'Singapore Dollar', iso_code: 'SGD', symbol: 'S$' },
    { name: 'Rupiah',         iso_code: 'IDR', symbol: 'Rp' },
  ];
  for (const c of defaults) {
    await db('currencies').insert({ company_id: companyId, ...c, is_base: c.iso_code === baseIso, is_active: true })
      .onConflict(['company_id', 'iso_code']).ignore();
  }
}

// ─── Currencies CRUD ──────────────────────────────────────────────────────────
router.get('/currencies', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    await seedDefaults(companyId);
    const includeInactive = String(req.query.includeInactive) === 'true';
    const q = db('currencies').where({ company_id: companyId });
    if (!includeInactive) q.where('is_active', true);
    const list = await q.orderBy('created_at', 'asc')
      .select('id', 'name', 'iso_code', 'symbol', 'is_base', 'is_active', 'created_at');
    // Add a stable 1-based "internal id" for display (NetSuite-style).
    res.json({ success: true, data: list.map((c: any, i: number) => ({ ...c, internal_id: i + 1 })) });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch currencies' }); }
});

router.get('/currencies/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const c = await db('currencies').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!c) { res.status(404).json({ success: false, error: 'Currency not found' }); return; }
    res.json({ success: true, data: c });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch currency' }); }
});

router.post('/currencies', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const d = req.body || {};
    if (!d.name || !d.isoCode) { res.status(400).json({ success: false, error: 'Name and ISO Code are required' }); return; }
    // Only one base currency per company.
    if (d.isBase) await db('currencies').where({ company_id: companyId }).update({ is_base: false });
    const [row] = await db('currencies').insert({
      company_id: companyId, name: d.name, iso_code: String(d.isoCode).toUpperCase(),
      symbol: d.symbol || null, is_base: !!d.isBase, is_active: d.isActive !== false,
    }).returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (e: any) {
    if (e.code === '23505') { res.status(400).json({ success: false, error: 'A currency with that ISO code already exists' }); return; }
    console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create currency' });
  }
});

router.put('/currencies/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const d = req.body || {};
    if (d.isBase) await db('currencies').where({ company_id: companyId }).whereNot('id', req.params.id).update({ is_base: false });
    const patch: any = { updated_at: new Date() };
    if (d.name !== undefined) patch.name = d.name;
    if (d.isoCode !== undefined) patch.iso_code = String(d.isoCode).toUpperCase();
    if (d.symbol !== undefined) patch.symbol = d.symbol || null;
    if (d.isBase !== undefined) patch.is_base = !!d.isBase;
    if (d.isActive !== undefined) patch.is_active = !!d.isActive;
    const [row] = await db('currencies').where({ id: req.params.id, company_id: companyId }).update(patch).returning('*');
    if (!row) { res.status(404).json({ success: false, error: 'Currency not found' }); return; }
    res.json({ success: true, data: row });
  } catch (e: any) {
    if (e.code === '23505') { res.status(400).json({ success: false, error: 'A currency with that ISO code already exists' }); return; }
    console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update currency' });
  }
});

// ─── Currency Exchange Rates ───────────────────────────────────────────────────
// List rates effective as-of a date (latest rate per base/source pair on/before the date).
router.get('/exchange-rates', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const asOf = (req.query.asOf as string) || new Date().toISOString().split('T')[0];
    // DISTINCT ON picks the newest effective_date per pair up to asOf.
    const rows = await db.raw(
      `SELECT DISTINCT ON (r.base_currency, r.source_currency)
          r.id, r.base_currency, r.source_currency, r.rate, r.effective_date,
          bc.name AS base_name, sc.name AS source_name
       FROM currency_exchange_rates r
       LEFT JOIN currencies bc ON bc.company_id = r.company_id AND bc.iso_code = r.base_currency
       LEFT JOIN currencies sc ON sc.company_id = r.company_id AND sc.iso_code = r.source_currency
       WHERE r.company_id = ? AND r.effective_date <= ?
       ORDER BY r.base_currency, r.source_currency, r.effective_date DESC`,
      [companyId, asOf]
    );
    res.json({ success: true, data: (rows.rows || []) });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch exchange rates' }); }
});

router.get('/exchange-rates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const r = await db('currency_exchange_rates').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!r) { res.status(404).json({ success: false, error: 'Exchange rate not found' }); return; }
    res.json({ success: true, data: r });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch exchange rate' }); }
});

// Rate lookup for a base/source pair as-of a date (used by transaction forms + revaluation).
// Returns { rate, effectiveDate } or rate 1 when base === source.
router.get('/exchange-rate-lookup', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const base = String(req.query.base || '').toUpperCase();
    const source = String(req.query.source || '').toUpperCase();
    const asOf = (req.query.asOf as string) || new Date().toISOString().split('T')[0];
    if (!base || !source) { res.status(400).json({ success: false, error: 'base and source are required' }); return; }
    if (base === source) { res.json({ success: true, data: { rate: 1, effectiveDate: asOf, exact: true } }); return; }
    const row = await db('currency_exchange_rates')
      .where({ company_id: companyId, base_currency: base, source_currency: source })
      .where('effective_date', '<=', asOf)
      .orderBy('effective_date', 'desc').first();
    if (row) { res.json({ success: true, data: { rate: parseFloat(row.rate), effectiveDate: row.effective_date, exact: true } }); return; }
    // Try the inverse pair and reciprocate.
    const inv = await db('currency_exchange_rates')
      .where({ company_id: companyId, base_currency: source, source_currency: base })
      .where('effective_date', '<=', asOf)
      .orderBy('effective_date', 'desc').first();
    if (inv && parseFloat(inv.rate) !== 0) { res.json({ success: true, data: { rate: 1 / parseFloat(inv.rate), effectiveDate: inv.effective_date, exact: false } }); return; }
    res.json({ success: true, data: { rate: null, effectiveDate: null, exact: false } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to look up rate' }); }
});

// Previous rate for a pair strictly before a given effective date (for the form's "Previous" fields).
router.get('/exchange-rate-previous', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const base = String(req.query.base || '').toUpperCase();
    const source = String(req.query.source || '').toUpperCase();
    const before = String(req.query.before || new Date().toISOString().split('T')[0]);
    const row = await db('currency_exchange_rates')
      .where({ company_id: companyId, base_currency: base, source_currency: source })
      .where('effective_date', '<', before)
      .orderBy('effective_date', 'desc').first();
    res.json({ success: true, data: row ? { rate: parseFloat(row.rate), effectiveDate: row.effective_date } : null });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch previous rate' }); }
});

router.post('/exchange-rates', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const d = req.body || {};
    if (!d.baseCurrency || !d.sourceCurrency || d.rate == null || !d.effectiveDate) {
      res.status(400).json({ success: false, error: 'Base currency, source currency, rate and effective date are required' }); return;
    }
    const [row] = await db('currency_exchange_rates').insert({
      company_id: req.user!.companyId,
      base_currency: String(d.baseCurrency).toUpperCase(),
      source_currency: String(d.sourceCurrency).toUpperCase(),
      rate: parseFloat(d.rate), effective_date: d.effectiveDate, created_by: req.user!.id,
    }).returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create exchange rate' }); }
});

router.put('/exchange-rates/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const d = req.body || {};
    const patch: any = { updated_at: new Date() };
    if (d.baseCurrency !== undefined) patch.base_currency = String(d.baseCurrency).toUpperCase();
    if (d.sourceCurrency !== undefined) patch.source_currency = String(d.sourceCurrency).toUpperCase();
    if (d.rate !== undefined) patch.rate = parseFloat(d.rate);
    if (d.effectiveDate !== undefined) patch.effective_date = d.effectiveDate;
    const [row] = await db('currency_exchange_rates').where({ id: req.params.id, company_id: req.user!.companyId }).update(patch).returning('*');
    if (!row) { res.status(404).json({ success: false, error: 'Exchange rate not found' }); return; }
    res.json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update exchange rate' }); }
});

router.delete('/exchange-rates/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const n = await db('currency_exchange_rates').where({ id: req.params.id, company_id: req.user!.companyId }).del();
    if (!n) { res.status(404).json({ success: false, error: 'Exchange rate not found' }); return; }
    res.json({ success: true });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to delete exchange rate' }); }
});

// ─── Monthly Currency Revaluation ──────────────────────────────────────────────
// Revalue open foreign-currency AR (invoices) and AP (vendor bills) at the
// as-of (month-end) rate and post an unrealized FX gain/loss journal entry.
//   Previous base value = foreign amount_due * original exchange_rate (stored on the doc)
//   New base value       = foreign amount_due * month-end rate
//   Difference           = unrealized FX gain/loss
router.post('/currency-revaluation', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const companyId = req.user!.companyId;
    const asOf = String(req.body?.asOf || new Date().toISOString().split('T')[0]);
    const baseIso = (await db('companies').where({ id: companyId }).first())?.base_currency || 'IDR';

    // Rate lookup helper (base per 1 source) as-of the revaluation date.
    const rateFor = async (source: string): Promise<number | null> => {
      if (source === baseIso) return 1;
      const r = await db('currency_exchange_rates')
        .where({ company_id: companyId, base_currency: baseIso, source_currency: source })
        .where('effective_date', '<=', asOf).orderBy('effective_date', 'desc').first();
      if (r) return parseFloat(r.rate);
      const inv = await db('currency_exchange_rates')
        .where({ company_id: companyId, base_currency: source, source_currency: baseIso })
        .where('effective_date', '<=', asOf).orderBy('effective_date', 'desc').first();
      return inv && parseFloat(inv.rate) !== 0 ? 1 / parseFloat(inv.rate) : null;
    };

    // Open foreign-currency AR and AP (exclude base currency).
    const openInvoices = await db('invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided'])
      .whereNot('currency', baseIso)
      .select('id', 'invoice_number', 'currency', 'exchange_rate', 'amount_due');
    const openBills = await db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided'])
      .whereNot('currency', baseIso)
      .select('id', 'bill_number', 'currency', 'exchange_rate', 'amount_due');

    let arGainLoss = 0;  // + = gain (AR worth more in base)
    let apGainLoss = 0;  // + = gain (AP worth less in base)
    const details: any[] = [];
    const missingRates = new Set<string>();

    for (const inv of openInvoices) {
      const newRate = await rateFor(inv.currency);
      if (newRate == null) { missingRates.add(inv.currency); continue; }
      const due = parseFloat(inv.amount_due || 0);
      if (due === 0) continue;
      const oldBase = due * parseFloat(inv.exchange_rate || 1);
      const newBase = due * newRate;
      const diff = newBase - oldBase; // AR up in base = gain
      if (Math.abs(diff) < 0.01) continue;
      arGainLoss += diff;
      details.push({ type: 'AR', doc: inv.invoice_number, currency: inv.currency, amountDue: due, oldRate: parseFloat(inv.exchange_rate || 1), newRate, diff });
    }
    for (const bill of openBills) {
      const newRate = await rateFor(bill.currency);
      if (newRate == null) { missingRates.add(bill.currency); continue; }
      const due = parseFloat(bill.amount_due || 0);
      if (due === 0) continue;
      const oldBase = due * parseFloat(bill.exchange_rate || 1);
      const newBase = due * newRate;
      const diff = newBase - oldBase; // AP up in base = loss
      if (Math.abs(diff) < 0.01) continue;
      apGainLoss += -diff; // liability increase reduces equity (loss)
      details.push({ type: 'AP', doc: bill.bill_number, currency: bill.currency, amountDue: due, oldRate: parseFloat(bill.exchange_rate || 1), newRate, diff: -diff });
    }

    const netGainLoss = arGainLoss + apGainLoss; // + = net gain, - = net loss
    if (Math.abs(netGainLoss) < 0.01) {
      res.json({ success: true, data: { posted: false, message: 'No material FX difference to revalue.', netGainLoss: 0, details, missingRates: [...missingRates] } });
      return;
    }

    // Post the revaluation journal:
    //   Net gain  -> Dr AR adjustment (asset up) / Cr FX Gain  (simplified: Dr FX clearing, Cr Gain)
    // We post against an FX revaluation account and the gain/loss account so the
    // GL stays balanced without re-touching each sub-ledger doc.
    const je = await db.transaction(async (trx: any) => {
      // Resolve AR/AP control accounts (code first, then subtype fallback).
      const bySubtype = async (sub: string) => (await trx('accounts').where({ company_id: companyId, subtype: sub }).orderBy('code').first())?.id || null;
      const arAcc = await AccountingEngine.getDefaultAccount(companyId, '1200', trx) || await bySubtype('receivable');
      const apAcc = await AccountingEngine.getDefaultAccount(companyId, '2100', trx) || await bySubtype('payable');

      // Resolve (or auto-create) the Unrealized FX gain/loss accounts.
      const ensureFxAccount = async (name: string, type: string, code: string): Promise<string> => {
        let acc = await trx('accounts').where({ company_id: companyId, name }).first();
        if (!acc) acc = await trx('accounts').where({ company_id: companyId, code }).first();
        if (acc) return acc.id;
        const [created] = await trx('accounts').insert({
          company_id: companyId, code, name, type, is_active: true,
        }).returning('id');
        return typeof created === 'object' ? created.id : created;
      };
      const gainAcc = await ensureFxAccount('Unrealized FX Gain', 'income', '4900');
      const lossAcc = await ensureFxAccount('Unrealized FX Loss', 'expense', '8900');

      const lines: any[] = [];
      // AR revaluation line (adjust AR control account by arGainLoss).
      if (Math.abs(arGainLoss) >= 0.01 && arAcc) {
        lines.push({ accountId: arAcc, debit: arGainLoss > 0 ? arGainLoss : 0, credit: arGainLoss < 0 ? -arGainLoss : 0, memo: 'AR FX revaluation' });
      }
      // AP revaluation line (apGainLoss is already sign-adjusted so + = gain).
      if (Math.abs(apGainLoss) >= 0.01 && apAcc) {
        // apGainLoss + => AP decreased (debit AP); - => AP increased (credit AP)
        lines.push({ accountId: apAcc, debit: apGainLoss > 0 ? apGainLoss : 0, credit: apGainLoss < 0 ? -apGainLoss : 0, memo: 'AP FX revaluation' });
      }
      // Balancing gain/loss line.
      if (netGainLoss > 0) {
        const acc = gainAcc || lossAcc!;
        lines.push({ accountId: acc, debit: 0, credit: netGainLoss, memo: 'Unrealized FX gain' });
      } else {
        const acc = lossAcc || gainAcc!;
        lines.push({ accountId: acc, debit: -netGainLoss, credit: 0, memo: 'Unrealized FX loss' });
      }

      return AccountingEngine.createJournalEntry({
        companyId, date: asOf, type: 'system', sourceType: 'fx_revaluation',
        memo: `Monthly Currency Revaluation as of ${asOf}`,
        lines, createdBy: req.user!.id, trx,
      });
    });

    res.json({
      success: true,
      data: {
        posted: true, journalNumber: je.journal_number, journalId: je.id,
        netGainLoss, arGainLoss, apGainLoss, details, missingRates: [...missingRates],
      },
    });
  } catch (e: any) {
    console.error('[ERP ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to run currency revaluation' });
  }
});

export default router;
