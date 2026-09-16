import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function ExpenseReportList() {
  const columns: ListColumn[] = [
    { key: 'report_number', label: 'Report #', render: r => <span className="font-mono text-blue-600 font-medium">{r.report_number}</span> },
    { key: 'employee_name', label: 'Employee', render: r => <span className="font-medium">{r.employee_name}</span> },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location' },
    { key: 'report_period_start', label: 'Period', render: r => <span className="text-xs">{formatDate(r.report_period_start)} – {formatDate(r.report_period_end)}</span> },
    { key: 'purpose', label: 'Purpose', render: r => <span className="text-slate-600">{r.purpose || '-'}</span> },
    { key: 'total_amount', label: 'Total', align: 'right', render: r => <span className="font-medium">{formatCurrency(r.total_amount)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'created_at', label: 'Submitted', render: r => formatDate(r.created_at) },
  ];

  return (
    <TransactionListPage
      title="Expense Reports"
      iconBg="bg-purple-600"
      iconText="ER"
      endpoint="/api/employee/expenses"
      newPath="/employee/expenses/new"
      detailPath={r => `/employee/expenses/${r.id}`}
      columns={columns}
      numberField="report_number"
      dateField="report_period_start"
      memoField="employee_name"
      statusOptions={['- All -', 'draft', 'submitted', 'approved', 'rejected', 'paid']}
    />
  );
}
