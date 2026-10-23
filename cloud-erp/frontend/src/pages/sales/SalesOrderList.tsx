import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function SalesOrderList() {
  const columns: ListColumn[] = [
    { key: 'so_number', label: 'Order #', render: r => <span className="font-mono text-blue-600 font-medium">{r.so_number}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name}</span> },
    { key: 'order_date', label: 'Order Date', render: r => formatDate(r.order_date) },
    { key: 'expected_ship_date', label: 'Ship Date', render: r => formatDate(r.expected_ship_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'sales_rep_name', label: 'Sales Rep' },
    { key: 'currency', label: 'Curr' },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Sales Orders"
      iconBg="bg-blue-600"
      iconText="SO"
      endpoint="/api/sales/orders"
      newPath="/sales/orders/new"
      detailPath={r => `/sales/orders/${r.id}`}
      editPath={r => `/sales/orders/${r.id}/edit`}
      columns={columns}
      permissionKey="sales_order"
      numberField="so_number"
      dateField="order_date"
      memoField="customer_name"
      statusOptions={['- All -', 'pending_approval', 'pending_fulfillment', 'partially_fulfilled', 'pending_billing', 'billed', 'closed', 'cancelled']}
    />
  );
}
