import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency } from '../../utils/format';

export default function CustomerList() {
  return (
    <TransactionListPage
      title="Customers"
      permissionKey="customer"
      iconBg="bg-sky-600" iconText="C"
      endpoint="/api/customers"
      newPath="/customers/new"
      detailPath={r => `/customers/${r.id}`}
      numberField="customer_number"
      dateField="created_at"
      memoField="name"
      statusOptions={['- All -', 'active', 'inactive', 'suspended']}
      columns={[
        { key: 'customer_number', label: 'Customer #', render: r => <span className="font-mono text-blue-600 font-medium">{r.customer_number}</span> },
        { key: 'name', label: 'Name', render: r => <span className="font-medium text-slate-800">{r.name}</span> },
        { key: 'email', label: 'Email', render: r => r.email ? <a href={`mailto:${r.email}`} className="text-blue-600 hover:underline">{r.email}</a> : '-' },
        { key: 'phone', label: 'Phone', render: r => r.phone || '-' },
        { key: 'currency', label: 'Currency', render: r => r.currency || '-' },
        { key: 'payment_terms', label: 'Terms', render: r => r.payment_terms || '-' },
        { key: 'credit_limit', label: 'Credit Limit', align: 'right', render: r => formatCurrency(r.credit_limit) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'active' ? 'bg-green-100 text-green-700' : status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
