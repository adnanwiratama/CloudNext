const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: 'localhost', port: 4100, path, method, headers }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve({ raw: b, status: res.statusCode }); }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/api/auth/login', { email: 'admin@cloudmfg.co.id', password: 'CloudERP@2026', companyCode: 'CMI' });
  const token = login.data.token;
  const cust = (await req('GET', '/api/customers', null, token)).data?.[0]?.id;
  const vend = (await req('GET', '/api/vendors', null, token)).data?.[0]?.id;
  const accts = (await req('GET', '/api/accounting/accounts', null, token)).data;
  const bank = accts.find(a => a.is_bank)?.id;
  const exp = accts.find(a => a.type === 'expense')?.id;

  const check = (label, r) => console.log(label + ':', r.success ? 'OK ' + (r.data.so_number||r.data.po_number||r.data.bill_number||r.data.check_number||r.data.journal_number||r.data.report_number||r.data.payment_number||r.data.transfer_number||r.data.deposit_number||r.data.wo_number||'created') : 'FAIL ' + (r.error||'').slice(0,70));

  check('Sales Order', await req('POST', '/api/sales/orders', { customerId: cust, orderDate: '2026-09-15', currency: 'IDR', lines: [{ description: 'Test', quantity: 2, unitPrice: 50000, amount: 100000 }] }, token));
  check('Invoice', await req('POST', '/api/sales/invoices', { customerId: cust, invoiceDate: '2026-09-15', dueDate: '2026-10-15', currency: 'IDR', lines: [{ description: 'Test', quantity: 1, unitPrice: 100000, amount: 100000 }] }, token));
  check('Quotation', await req('POST', '/api/sales/quotations', { customerId: cust, quotationDate: '2026-09-15', currency: 'IDR', lines: [{ description: 'Test', qty: 1, unitPrice: 100000, discount: 0 }] }, token));
  check('Purchase Order', await req('POST', '/api/purchasing/orders', { vendorId: vend, orderDate: '2026-09-15', currency: 'IDR', lines: [{ description: 'Test', quantity: 2, unitPrice: 50000, amount: 100000 }] }, token));
  check('Vendor Bill', await req('POST', '/api/purchasing/bills', { vendorId: vend, billDate: '2026-09-15', dueDate: '2026-10-15', currency: 'IDR', lines: [{ description: 'Test', qty: 1, unitPrice: 100000, amount: 100000 }] }, token));
  check('Journal Entry', await req('POST', '/api/accounting/journals', { entryDate: '2026-09-15', memo: 'Test', lines: [{ accountId: accts[0].id, debit: 500000, credit: 0 }, { accountId: accts[1].id, debit: 0, credit: 500000 }] }, token));
  check('Expense Report', await req('POST', '/api/employee/expenses', { employeeName: 'Test', reportPeriodStart: '2026-09-01', reportPeriodEnd: '2026-09-30', totalAmount: 50000, lines: [{ date: '2026-09-15', category: 'meals', description: 'Lunch', amount: 50000 }] }, token));
  check('Bank Deposit', await req('POST', '/api/bank/make-deposit', { depositDate: '2026-09-15', bankAccountId: bank, totalAmount: 100000, lines: [{ accountId: exp, amount: 100000 }] }, token));
  check('Bank Transfer', await req('POST', '/api/bank/transfers', { transferDate: '2026-09-15', fromAccountId: bank, toAccountId: accts.filter(a=>a.is_bank)[1]?.id, amount: 100000 }, token));
  check('Write Check', await req('POST', '/api/bank/write-checks', { checkDate: '2026-09-15', payTo: 'Test', bankAccountId: bank, amount: 100000, documentNumber: 'CHK/2026-000099', lines: [{ accountId: exp, amount: 100000 }] }, token));

  process.exit(0);
})();
