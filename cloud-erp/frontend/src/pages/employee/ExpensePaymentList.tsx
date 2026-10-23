import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function ExpensePaymentList() {
  return (
    <TransactionListPage
      title="Expense Payments"
      permissionKey="expense_report"
      iconBg="bg-orange-500" iconText="EP"
      endpoint="/api/employee/expense-payments"
      newPath="/employee/expense-payments/new"
      detailPath={r => `/employee/expense-payments/${r.id}`}
      numberField="payment_number"
      dateField="payment_date"
      memoField="account_name"
      statusOptions={['- All -', 'posted', 'voided']}
      columns={[
        { key: 'payment_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.payment_number}</span> },
        { key: 'payment_date', label: 'Date', render: r => formatDate(r.payment_date) },
        { key: 'account_name', label: 'Account', render: r => r.account_code ? `${r.account_code} - ${r.account_name}` : (r.account_name || '-') },
        { key: 'payment_method', label: 'Method', render: r => (r.payment_method || '').replace(/_/g, ' ') },
        { key: 'amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'posted' ? 'bg-green-100 text-green-700' : status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
