import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function VendorBillList() {
  const columns: ListColumn[] = [
    { key: 'bill_number', label: 'Bill #', render: r => <span className="font-mono text-blue-600 font-medium">{r.bill_number}</span> },
    { key: 'vendor_name', label: 'Vendor', render: r => <span className="font-medium">{r.vendor_name}</span> },
    { key: 'bill_date', label: 'Bill Date', render: r => formatDate(r.bill_date) },
    { key: 'due_date', label: 'Due Date', render: r => {
      const overdue = new Date(r.due_date) < new Date() && !['paid', 'voided'].includes(r.status);
      return <span className={overdue ? 'text-red-600 font-medium' : ''}>{formatDate(r.due_date)}</span>;
    } },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'amount_paid', label: 'Paid', align: 'right', render: r => <span className="text-emerald-600">{formatCurrency(r.amount_paid)}</span> },
    { key: 'amount_due', label: 'Balance', align: 'right', render: r => <span className={parseFloat(r.amount_due) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{formatCurrency(r.amount_due)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Vendor Bills"
      iconBg="bg-amber-600"
      iconText="VB"
      endpoint="/api/purchasing/bills"
      newPath="/purchasing/bills/new"
      detailPath={r => `/purchasing/bills/${r.id}`}
      columns={columns}
      numberField="bill_number"
      dateField="bill_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'open', 'partially_paid', 'paid', 'voided']}
    />
  );
}
