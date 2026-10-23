import TransactionListPage from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate, formatNumber } from '../../utils/format';

export default function WorkOrderList() {
  return (
    <TransactionListPage
      title="Work Orders"
      permissionKey="work_order"
      iconBg="bg-indigo-700" iconText="WO"
      endpoint="/api/manufacturing/work-orders"
      newPath="/manufacturing/work-orders/new"
      detailPath={r => `/manufacturing/work-orders/${r.id}`}
      numberField="wo_number"
      dateField="planned_start_date"
      memoField="item_name"
      statusOptions={['- All -', 'planned', 'released', 'in_progress', 'completed', 'closed', 'cancelled']}
      columns={[
        { key: 'wo_number', label: 'Document Number', render: r => <span className="font-mono text-blue-600 font-medium">{r.wo_number}</span> },
        { key: 'item', label: 'Item', render: r => (
          <div><span className="font-mono text-xs text-blue-600">{r.item_code}</span><div className="text-xs text-slate-600">{r.item_name}</div></div>
        ) },
        { key: 'planned_quantity', label: 'Planned', align: 'right', render: r => formatNumber(r.planned_quantity, 0) },
        { key: 'completed_quantity', label: 'Completed', align: 'right', render: r => (
          <span className={parseFloat(r.completed_quantity) >= parseFloat(r.planned_quantity) ? 'text-emerald-600 font-medium' : 'text-slate-600'}>
            {formatNumber(r.completed_quantity, 0)}
          </span>
        ) },
        { key: 'planned_start_date', label: 'Start Date', render: r => formatDate(r.planned_start_date) },
        { key: 'planned_end_date', label: 'End Date', render: r => formatDate(r.planned_end_date) },
        { key: 'location_name', label: 'Location' },
        { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
