import TransactionListPage from '../../components/transaction/TransactionListPage';

export default function VendorList() {
  return (
    <TransactionListPage
      title="Vendors"
      permissionKey="vendor"
      iconBg="bg-orange-600" iconText="V"
      endpoint="/api/vendors"
      newPath="/vendors/new"
      detailPath={r => `/vendors/${r.id}`}
      numberField="vendor_number"
      dateField="created_at"
      memoField="name"
      statusOptions={['- All -', 'active', 'inactive', 'suspended']}
      columns={[
        { key: 'vendor_number', label: 'Vendor #', render: r => <span className="font-mono text-blue-600 font-medium">{r.vendor_number}</span> },
        { key: 'name', label: 'Name', render: r => <span className="font-medium text-slate-800">{r.name}</span> },
        { key: 'email', label: 'Email', render: r => r.email ? <a href={`mailto:${r.email}`} className="text-blue-600 hover:underline">{r.email}</a> : '-' },
        { key: 'phone', label: 'Phone', render: r => r.phone || '-' },
        { key: 'currency', label: 'Currency', render: r => r.currency || '-' },
        { key: 'payment_terms', label: 'Terms', render: r => r.payment_terms || '-' },
        { key: 'city', label: 'City', render: r => r.city || '-' },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'active' ? 'bg-green-100 text-green-700' : status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
