import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function InvoiceList() {
  const columns: ListColumn[] = [
    { key: 'invoice_number', label: 'Invoice #', render: r => <span className="font-mono text-blue-600 font-medium">{r.invoice_number}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name}</span> },
    { key: 'invoice_date', label: 'Invoice Date', render: r => formatDate(r.invoice_date) },
    { key: 'due_date', label: 'Due Date', render: r => {
      const overdue = new Date(r.due_date) < new Date() && !['paid', 'voided'].includes(r.status);
      return <span className={overdue ? 'text-red-600 font-medium' : ''}>{formatDate(r.due_date)}</span>;
    } },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'currency', label: 'Curr' },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'amount_paid', label: 'Paid', align: 'right', render: r => <span className="text-emerald-600">{formatCurrency(r.amount_paid)}</span> },
    { key: 'amount_due', label: 'Balance', align: 'right', render: r => <span className={parseFloat(r.amount_due) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{formatCurrency(r.amount_due)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Customer Invoices"
      iconBg="bg-blue-600"
      iconText="IN"
      endpoint="/api/sales/invoices"
      newPath="/sales/invoices/new"
      detailPath={r => `/sales/invoices/${r.id}`}
      columns={columns}
      permissionKey="invoice"
      numberField="invoice_number"
      dateField="invoice_date"
      memoField="customer_name"
      statusOptions={['- All -', 'open', 'partially_paid', 'paid', 'overdue', 'voided']}
    />
  );
}
