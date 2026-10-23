import TransactionListPage from '../../components/transaction/TransactionListPage';

export default function EmployeeList() {
  const yesNo = (v: boolean) => (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${v ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
      {v ? 'Yes' : 'No'}
    </span>
  );

  return (
    <TransactionListPage
      title="Employees"
      permissionKey="employee"
      iconBg="bg-indigo-600" iconText="EMP"
      endpoint="/api/settings/users"
      newPath="/lists/employees/new"
      detailPath={r => `/lists/employees/${r.id}`}
      numberField="name"
      dateField="created_at"
      memoField="email"
      columns={[
        { key: 'employee_number', label: 'Employee ID', render: r => <span className="font-mono text-xs text-slate-600">{r.employee_number || '-'}</span> },
        { key: 'name', label: 'Name', render: r => <span className="font-medium text-slate-800">{r.name}</span> },
        { key: 'email', label: 'Email', render: r => <span className="text-blue-600">{r.email}</span> },
        { key: 'phone', label: 'Phone', render: r => r.phone || '-' },
        { key: 'department_name', label: 'Department', render: r => r.department_name || '-' },
        { key: 'location_name', label: 'Location', render: r => r.location_name || '-' },
        { key: 'give_access', label: 'Give Access', align: 'center', render: r => yesNo(!!r.is_active) },
        { key: 'role_name', label: 'Role', render: r => r.is_admin ? 'Administrator' : (r.role_name || '-') },
        { key: 'subsidiary_name', label: 'Subsidiary', render: r => r.subsidiary_name || '-' },
      ]}
    />
  );
}
