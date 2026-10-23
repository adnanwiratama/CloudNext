import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function ItemFulfillmentList() {
  const columns: ListColumn[] = [
    { key: 'fulfillment_number', label: 'Fulfillment #', render: r => <span className="font-mono text-blue-600 font-medium">{r.fulfillment_number}</span> },
    { key: 'so_number', label: 'SO #', render: r => <span className="font-mono text-xs text-blue-600">{r.so_number || '-'}</span> },
    { key: 'customer_name', label: 'Customer', render: r => <span className="font-medium">{r.customer_name}</span> },
    { key: 'fulfillment_date', label: 'Fulfill Date', render: r => formatDate(r.fulfillment_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location', render: r => r.location_name || '-' },
    { key: 'tracking_number', label: 'Tracking #', render: r => r.tracking_number || '-' },
    { key: 'carrier', label: 'Carrier', render: r => r.carrier || '-' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Item Fulfillments"
      permissionKey="item_fulfillment"
      iconBg="bg-blue-600"
      iconText="IF"
      endpoint="/api/sales/fulfillments"
      newPath="/sales/fulfillments/new"
      detailPath={r => `/sales/fulfillments/${r.id}`}
      columns={columns}
      numberField="fulfillment_number"
      dateField="fulfillment_date"
      memoField="customer_name"
      statusOptions={['- All -', 'pending', 'picked', 'packed', 'shipped', 'cancelled']}
    />
  );
}
