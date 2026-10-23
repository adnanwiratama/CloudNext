import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function PurchaseOrderList() {
  const columns: ListColumn[] = [
    { key: 'po_number', label: 'PO #', render: r => <span className="font-mono text-blue-600 font-medium">{r.po_number}</span> },
    { key: 'vendor_name', label: 'Vendor', render: r => <span className="font-medium">{r.vendor_name}</span> },
    { key: 'order_date', label: 'Order Date', render: r => formatDate(r.order_date) },
    { key: 'expected_receipt_date', label: 'Expected Receipt', render: r => formatDate(r.expected_receipt_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'currency', label: 'Curr' },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Purchase Orders"
      iconBg="bg-amber-600"
      iconText="PO"
      endpoint="/api/purchasing/orders"
      newPath="/purchasing/orders/new"
      detailPath={r => `/purchasing/orders/${r.id}`}
      editPath={r => `/purchasing/orders/${r.id}/edit`}
      columns={columns}
      permissionKey="purchase_order"
      numberField="po_number"
      dateField="order_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'pending_approval', 'pending_receipt', 'partially_received', 'fully_received', 'closed', 'cancelled']}
    />
  );
}
