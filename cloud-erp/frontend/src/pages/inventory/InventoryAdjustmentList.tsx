import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function InventoryAdjustmentList() {
  const columns: ListColumn[] = [
    { key: 'adjustment_number', label: 'Adjustment #', render: r => <span className="font-mono text-blue-600 font-medium">{r.adjustment_number}</span> },
    { key: 'adjustment_date', label: 'Date', render: r => formatDate(r.adjustment_date) },
    { key: 'adjustment_type', label: 'Type', render: r => <span className="capitalize">{r.adjustment_type || '-'}</span> },
    { key: 'reason', label: 'Reason', render: r => <span className="text-slate-600">{r.reason || '-'}</span> },
    { key: 'created_by_name', label: 'Created By', render: r => r.created_by_name || '-' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Inventory Adjustments"
      permissionKey="inventory_adjustment"
      iconBg="bg-emerald-600"
      iconText="IA"
      endpoint="/api/inventory/adjustments"
      newPath="/inventory/adjustments/new"
      detailPath={r => `/inventory/adjustments/${r.id}`}
      columns={columns}
      numberField="adjustment_number"
      dateField="adjustment_date"
      memoField="reason"
      statusOptions={['- All -', 'draft', 'posted', 'cancelled']}
    />
  );
}
