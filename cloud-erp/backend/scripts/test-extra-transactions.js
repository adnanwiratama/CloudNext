const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: 'localhost', port: 4100, path, method, headers }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, raw: b }); }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/api/auth/login', { email: 'admin@cloudmfg.co.id', password: 'CloudERP@2026', companyCode: 'CMI' });
  const token = login.body.data.token;
  const cust = (await req('GET', '/api/customers', null, token)).body.data?.[0]?.id;
  const vend = (await req('GET', '/api/vendors', null, token)).body.data?.[0]?.id;
  const accts = (await req('GET', '/api/accounting/accounts', null, token)).body.data;
  const bank = accts.find(a => a.is_bank)?.id;
  const item = (await req('GET', '/api/items', null, token)).body.data?.[0]?.id;

  console.log('=== GET (List) endpoints ===');
  const lists = [
    ['/api/purchasing/prepayments', 'Vendor Prepayments'],
    ['/api/purchasing/vendor-returns', 'Vendor Returns'],
    ['/api/purchasing/vendor-credits', 'Vendor Credits'],
    ['/api/sales/deposits', 'Customer Deposits'],
    ['/api/sales/return-authorizations', 'Return Authorizations'],
    ['/api/sales/credit-memos', 'Credit Memos'],
    ['/api/sales/refunds', 'Customer Refunds'],
  ];
  for (const [path, label] of lists) {
    const r = await req('GET', path, null, token);
    console.log((r.status === 200 ? 'OK  ' : 'ERR ') + '[' + r.status + '] ' + label + ' ' + path + (r.status !== 200 ? ' -> ' + (r.body?.error || r.raw || '').slice(0, 60) : ''));
  }

  console.log('\n=== POST (Create) endpoints ===');
  const creates = [
    ['/api/sales/deposits', 'Customer Deposit', { customerId: cust, depositDate: '2026-09-15', amount: 500000, bankAccountId: bank, paymentMethod: 'bank_transfer' }],
    ['/api/sales/return-authorizations', 'Return Authorization', { customerId: cust, returnDate: '2026-09-15', returnReason: 'defective', lines: [{ itemId: item, description: 'Test', qty: 1, unitPrice: 100000, reason: 'defective' }], totalAmount: 100000 }],
    ['/api/sales/credit-memos', 'Credit Memo', { customerId: cust, creditDate: '2026-09-15', reason: 'return', lines: [{ itemId: item, description: 'Test', qty: 1, unitPrice: 100000 }], subtotal: 100000, taxAmount: 11000, totalAmount: 111000 }],
    ['/api/sales/refunds', 'Customer Refund', { customerId: cust, refundDate: '2026-09-15', amount: 100000, bankAccountId: bank, paymentMethod: 'bank_transfer' }],
    ['/api/purchasing/prepayments', 'Vendor Prepayment', { vendorId: vend, paymentDate: '2026-09-15', amount: 500000, bankAccountId: bank, paymentMethod: 'bank_transfer' }],
    ['/api/purchasing/vendor-returns', 'Vendor Return', { vendorId: vend, returnDate: '2026-09-15', lines: [{ itemId: item, description: 'Test', qty: 1, unitPrice: 100000 }], totalAmount: 100000 }],
    ['/api/purchasing/vendor-credits', 'Vendor Credit', { vendorId: vend, creditDate: '2026-09-15', reason: 'return', lines: [{ itemId: item, description: 'Test', qty: 1, unitPrice: 100000 }], totalAmount: 100000 }],
  ];
  for (const [path, label, payload] of creates) {
    const r = await req('POST', path, payload, token);
    console.log((r.status === 200 || r.status === 201 ? 'OK  ' : 'ERR ') + '[' + r.status + '] ' + label + (r.status >= 400 ? ' -> ' + (r.body?.error || r.raw || '').slice(0, 70) : ''));
  }

  process.exit(0);
})();
