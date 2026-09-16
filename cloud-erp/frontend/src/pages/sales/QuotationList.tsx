import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function QuotationList() {
  const columns: ListColumn[] = [
    { key: 'quotation_number', label: 'Quotation #', render: r => <span className="font-mono text-blue-600 font-medium">{r.quotation_number}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name}</span> },
    { key: 'quotation_date', label: 'Date', render: r => formatDate(r.quotation_date) },
    { key: 'expiry_date', label: 'Expiry', render: r => formatDate(r.expiry_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'sales_rep_name', label: 'Sales Rep' },
    { key: 'currency', label: 'Currency' },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Quotations"
      iconBg="bg-blue-600"
      iconText="QT"
      endpoint="/api/sales/quotations"
      newPath="/sales/quotations/new"
      detailPath={r => `/sales/quotations/${r.id}`}
      columns={columns}
      numberField="quotation_number"
      dateField="quotation_date"
      memoField="customer_name"
      statusOptions={['- All -', 'draft', 'submitted', 'approved', 'converted']}
    />
  );
}
