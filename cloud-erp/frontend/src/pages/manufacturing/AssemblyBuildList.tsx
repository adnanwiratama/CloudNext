import TransactionListPage from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

export default function AssemblyBuildList() {
  return (
    <TransactionListPage
      title="Assembly Builds"
      permissionKey="work_order"
      iconBg="bg-emerald-600" iconText="AB"
      endpoint="/api/manufacturing/assembly-builds"
      newPath="/manufacturing/assembly-builds/new"
      detailPath={r => `/manufacturing/assembly-builds/${r.id}`}
      numberField="build_number"
      dateField="build_date"
      memoField="item_name"
      statusOptions={['- All -', 'completed', 'draft', 'cancelled']}
      columns={[
        { key: 'build_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.build_number}</span> },
        { key: 'build_date', label: 'Date', render: r => formatDate(r.build_date) },
        { key: 'item_name', label: 'Item' },
        { key: 'quantity', label: 'Qty', align: 'right', render: r => formatNumber(r.quantity, 2) },
        { key: 'location_name', label: 'Location' },
        { key: 'total_cost', label: 'Total Cost', align: 'right', render: r => formatCurrency(r.total_cost) },
        { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
