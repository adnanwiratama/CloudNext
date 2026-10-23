import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function VendorReturnList() {
  return (
    <TransactionListPage
      title="Vendor Returns"
      permissionKey="vendor_return"
      iconBg="bg-red-600" iconText="↩"
      endpoint="/api/purchasing/vendor-returns"
      newPath="/purchasing/vendor-returns/new"
      detailPath={r => `/purchasing/vendor-returns/${r.id}`}
      numberField="return_number"
      dateField="return_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'open', 'shipped', 'closed', 'cancelled']}
      columns={[
        { key: 'return_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.return_number}</span> },
        { key: 'return_date', label: 'Date', render: r => formatDate(r.return_date) },
        { key: 'vendor_name', label: 'Vendor' },
        { key: 'return_reason', label: 'Reason', render: r => (r.return_reason || '').replace(/_/g, ' ') || '-' },
        { key: 'total_amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.total_amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = ['shipped', 'closed'].includes(status) ? 'bg-green-100 text-green-700' : status === 'open' ? 'bg-blue-100 text-blue-700' : status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
