'use strict';
const knex = require('knex');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'host.docker.internal',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'cloud_erp',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'erp_secure_password',
  },
});

async function run() {
  const companies = await db('companies');
  if (!companies.length) { console.log('No company found'); process.exit(1); }

  const newAccounts = [
    { code: '1130', name: 'Advance Payment to Vendor', type: 'asset', subtype: 'other_current_asset', description: 'Vendor prepayments / down payments - Other Current Asset' },
    { code: '2210', name: 'Customer Deposit Liability',  type: 'liability', subtype: 'other_current_liability', description: 'Down payment received from customer - Other Current Liability' },
    { code: '2220', name: 'Inventory Returned Not Credited', type: 'liability', subtype: 'other_current_liability', description: 'Vendor credit pending - Other Current Liability' },
    { code: '2700', name: 'Customer Deposit', type: 'liability', subtype: 'other_current_liability', description: 'Customer Deposit - Other Current Liabilities' },
  ];

  let created = 0;
  for (const company of companies) {
    const cid = company.id;
    for (const acc of newAccounts) {
      const existing = await db('accounts').where({ company_id: cid, code: acc.code }).first();
      if (!existing) {
        await db('accounts').insert({
          company_id: cid,
          code: acc.code, name: acc.name,
          type: acc.type, subtype: acc.subtype,
          description: acc.description,
          is_active: true,
        });
        console.log(`[${company.name || cid}] Created: ${acc.code} - ${acc.name}`);
        created++;
      } else {
        console.log(`[${company.name || cid}] Exists:  ${acc.code} - ${existing.name}`);
      }
    }
  }
  console.log(`\nDone. ${created} new accounts created.`);
  await db.destroy();
}

run().catch(e => { console.error(e.message); process.exit(1); });
