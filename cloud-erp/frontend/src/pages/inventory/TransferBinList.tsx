import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function TransferBinList() {
  const columns: ListColumn[] = [
    { key: 'transfer_number', label: 'Bin Transfer #', render: r => <span className="font-mono text-blue-600 font-medium">{r.transfer_number}</span> },
    { key: 'transfer_date', label: 'Date', render: r => formatDate(r.transfer_date) },
    { key: 'location_name', label: 'Location', render: r => r.location_name || '-' },
    { key: 'from_bin', label: 'From Bin', render: r => r.from_bin || '-' },
    { key: 'to_bin', label: 'To Bin', render: r => r.to_bin || '-' },
    { key: 'memo', label: 'Memo', render: r => <span className="text-slate-600">{r.memo || '-'}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Transfer Bins"
      iconBg="bg-emerald-600"
      iconText="TB"
      endpoint="/api/inventory/transfer-bins"
      newPath="/inventory/transfer-bins/new"
      detailPath={r => `/inventory/transfer-bins/${r.id}`}
      columns={columns}
      numberField="transfer_number"
      dateField="transfer_date"
      memoField="memo"
      statusOptions={['- All -', 'draft', 'posted', 'cancelled']}
    />
  );
}
