import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function TransferInventoryList() {
  const columns: ListColumn[] = [
    { key: 'transfer_number', label: 'Transfer #', render: r => <span className="font-mono text-blue-600 font-medium">{r.transfer_number}</span> },
    { key: 'transfer_date', label: 'Date', render: r => formatDate(r.transfer_date) },
    { key: 'from_location_name', label: 'From Location', render: r => r.from_location_name || '-' },
    { key: 'to_location_name', label: 'To Location', render: r => r.to_location_name || '-' },
    { key: 'reference', label: 'Reference', render: r => r.reference || '-' },
    { key: 'memo', label: 'Memo', render: r => <span className="text-slate-600">{r.memo || '-'}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Transfer Inventory"
      permissionKey="transfer_order"
      iconBg="bg-emerald-600"
      iconText="TI"
      endpoint="/api/inventory/transfers"
      newPath="/inventory/transfers/new"
      detailPath={r => `/inventory/transfers/${r.id}`}
      columns={columns}
      numberField="transfer_number"
      dateField="transfer_date"
      memoField="memo"
      statusOptions={['- All -', 'draft', 'posted', 'cancelled']}
    />
  );
}
