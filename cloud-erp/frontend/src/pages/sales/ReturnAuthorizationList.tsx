import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function ReturnAuthorizationList() {
  return (
    <TransactionListPage
      title="Return Authorizations"
      permissionKey="return_authorization"
      iconBg="bg-orange-500" iconText="↺"
      endpoint="/api/sales/return-authorizations"
      newPath="/sales/return-authorizations/new"
      detailPath={r => `/sales/return-authorizations/${r.id}`}
      numberField="ra_number"
      dateField="return_date"
      memoField="customer_name"
      statusOptions={['- All -', 'open', 'approved', 'received', 'closed', 'cancelled']}
      columns={[
        { key: 'ra_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.ra_number}</span> },
        { key: 'return_date', label: 'Date', render: r => formatDate(r.return_date) },
        { key: 'customer_name', label: 'Customer' },
        { key: 'return_reason', label: 'Reason', render: r => (r.return_reason || '').replace(/_/g, ' ') || '-' },
        { key: 'total_amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.total_amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = ['approved', 'received', 'closed'].includes(status) ? 'bg-green-100 text-green-700' : status === 'open' ? 'bg-blue-100 text-blue-700' : status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
