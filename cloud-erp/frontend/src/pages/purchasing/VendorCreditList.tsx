import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function VendorCreditList() {
  return (
    <TransactionListPage
      title="Vendor Credits"
      permissionKey="vendor_credit"
      iconBg="bg-amber-500" iconText="−"
      endpoint="/api/purchasing/vendor-credits"
      newPath="/purchasing/vendor-credits/new"
      detailPath={r => `/purchasing/vendor-credits/${r.id}`}
      numberField="credit_number"
      dateField="credit_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'open', 'applied', 'voided']}
      columns={[
        { key: 'credit_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.credit_number}</span> },
        { key: 'credit_date', label: 'Date', render: r => formatDate(r.credit_date) },
        { key: 'vendor_name', label: 'Vendor' },
        { key: 'reason', label: 'Reason', render: r => (r.reason || '').replace(/_/g, ' ') || '-' },
        { key: 'total_amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.total_amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'applied' ? 'bg-green-100 text-green-700' : status === 'open' ? 'bg-blue-100 text-blue-700' : status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
