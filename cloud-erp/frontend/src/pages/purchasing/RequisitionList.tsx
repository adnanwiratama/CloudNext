import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function RequisitionList() {
  const columns: ListColumn[] = [
    { key: 'pr_number', label: 'PR #', render: r => <span className="font-mono text-blue-600 font-medium">{r.pr_number}</span> },
    { key: 'requested_by_name', label: 'Requested By' },
    { key: 'request_date', label: 'Request Date', render: r => formatDate(r.request_date) },
    { key: 'required_date', label: 'Required Date', render: r => formatDate(r.required_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'total_amount', label: 'Est. Total', align: 'right', render: r => formatCurrency(r.total_amount) },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Purchase Requisitions"
      permissionKey="purchase_requisition"
      iconBg="bg-amber-600"
      iconText="PR"
      endpoint="/api/purchasing/requisitions"
      newPath="/purchasing/requisitions/new"
      detailPath={r => `/purchasing/requisitions/${r.id}`}
      columns={columns}
      numberField="pr_number"
      dateField="request_date"
      memoField="requested_by_name"
      statusOptions={['- All -', 'draft', 'submitted', 'approved', 'rejected', 'converted']}
    />
  );
}
