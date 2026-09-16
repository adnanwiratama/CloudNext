import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function TransferOrderList() {
  const columns: ListColumn[] = [
    { key: 'transfer_order_number', label: 'Order #', render: r => <span className="font-mono text-blue-600 font-medium">{r.transfer_order_number}</span> },
    { key: 'order_date', label: 'Order Date', render: r => formatDate(r.order_date) },
    { key: 'expected_date', label: 'Expected Date', render: r => r.expected_date ? formatDate(r.expected_date) : '-' },
    { key: 'from_location_name', label: 'From Location', render: r => r.from_location_name || '-' },
    { key: 'to_location_name', label: 'To Location', render: r => r.to_location_name || '-' },
    { key: 'priority', label: 'Priority', render: r => <span className="capitalize">{r.priority || 'normal'}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Transfer Orders"
      iconBg="bg-emerald-600"
      iconText="TO"
      endpoint="/api/inventory/transfer-orders"
      newPath="/inventory/transfer-orders/new"
      detailPath={r => `/inventory/transfer-orders/${r.id}`}
      columns={columns}
      numberField="transfer_order_number"
      dateField="order_date"
      statusOptions={['- All -', 'pending', 'approved', 'in_transit', 'received', 'cancelled']}
    />
  );
}
