import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function RefundCustomerList() {
  return (
    <TransactionListPage
      title="Customer Refunds"
      permissionKey="customer_refund"
      iconBg="bg-amber-500" iconText="↩"
      endpoint="/api/sales/refunds"
      newPath="/sales/refunds/new"
      detailPath={r => `/sales/refunds/${r.id}`}
      numberField="refund_number"
      dateField="refund_date"
      memoField="customer_name"
      statusOptions={['- All -', 'posted', 'voided']}
      columns={[
        { key: 'refund_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.refund_number}</span> },
        { key: 'refund_date', label: 'Date', render: r => formatDate(r.refund_date) },
        { key: 'customer_name', label: 'Customer' },
        { key: 'payment_method', label: 'Method', render: r => (r.payment_method || '').replace(/_/g, ' ') },
        { key: 'amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'posted' ? 'bg-blue-100 text-blue-700' : status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
