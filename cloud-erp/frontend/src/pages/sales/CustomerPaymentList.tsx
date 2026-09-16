import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function CustomerPaymentList() {
  const columns: ListColumn[] = [
    { key: 'payment_number', label: 'Payment #', render: r => <span className="font-mono text-blue-600 font-medium">{r.payment_number}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name}</span> },
    { key: 'payment_date', label: 'Date', render: r => formatDate(r.payment_date) },
    { key: 'payment_method', label: 'Method', render: r => r.payment_method?.replace(/_/g, ' ') || '-' },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'reference', label: 'Reference', render: r => r.reference || '-' },
    { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-medium text-emerald-600">{formatCurrency(r.amount)}</span> },
    { key: 'unapplied_amount', label: 'Unapplied', align: 'right', render: r => <span className={parseFloat(r.unapplied_amount) > 0 ? 'text-amber-600' : 'text-slate-400'}>{formatCurrency(r.unapplied_amount)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Customer Payments"
      iconBg="bg-blue-600"
      iconText="CP"
      endpoint="/api/sales/payments"
      newPath="/sales/payments/new"
      detailPath={r => `/sales/payments/${r.id}`}
      columns={columns}
      numberField="payment_number"
      dateField="payment_date"
      memoField="customer_name"
      statusOptions={['- All -', 'draft', 'posted', 'voided']}
    />
  );
}
