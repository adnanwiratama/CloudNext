import TransactionListPage from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate, formatNumber } from '../../utils/format';

export default function BOMList() {
  return (
    <TransactionListPage
      title="Bill of Materials"
      permissionKey="bom"
      iconBg="bg-slate-700" iconText="BOM"
      endpoint="/api/manufacturing/boms"
      newPath="/manufacturing/boms/new"
      detailPath={r => `/manufacturing/boms/${r.id}`}
      numberField="bom_number"
      dateField="effective_date"
      memoField="name"
      statusOptions={['- All -', 'active', 'draft', 'inactive']}
      columns={[
        { key: 'bom_number', label: 'Document Number', render: r => <span className="font-mono text-blue-600 font-medium">{r.bom_number}</span> },
        { key: 'name', label: 'BOM Name', render: r => <span className="font-medium">{r.name}</span> },
        { key: 'item', label: 'Finished Good', render: r => (
          <div><span className="font-mono text-xs text-blue-600">{r.item_code}</span><div className="text-xs text-slate-500">{r.item_name}</div></div>
        ) },
        { key: 'revision', label: 'Rev', render: r => r.revision || '-' },
        { key: 'effective_date', label: 'Effective', render: r => formatDate(r.effective_date) },
        { key: 'quantity', label: 'Qty', align: 'right', render: r => formatNumber(r.quantity, 0) },
        { key: 'yield_percent', label: 'Yield %', render: r => (r.yield_percent != null ? `${r.yield_percent}%` : '-') },
        { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
