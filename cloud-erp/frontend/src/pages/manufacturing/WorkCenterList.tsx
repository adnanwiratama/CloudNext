import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DataTable, { Column } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { useListPage } from '../../hooks/useListPage';
import { formatCurrency, formatNumber } from '../../utils/format';

export default function WorkCenterList() {
  const navigate = useNavigate();
  const list = useListPage({ queryKey: 'work-centers', endpoint: '/api/manufacturing/work-centers' });

  const columns: Column[] = [
    { key: 'code', label: 'Code', width: '100px', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
    { key: 'machine_description', label: 'Machine' },
    { key: 'capacity', label: 'Capacity (hrs)', align: 'right', render: v => `${v} hrs/day` },
    { key: 'labor_rate', label: 'Labor Rate/hr', align: 'right', render: v => formatCurrency(v) },
    { key: 'machine_rate', label: 'Machine Rate/hr', align: 'right', render: v => formatCurrency(v) },
    { key: 'overhead_rate', label: 'Overhead/hr', align: 'right', render: v => formatCurrency(v) },
    { key: 'efficiency_percent', label: 'Efficiency', align: 'right', render: v => `${v}%` },
    { key: 'is_active', label: 'Active', width: '70px', render: v => <span className={v ? 'badge badge-green' : 'badge badge-gray'}>{v ? 'Active' : 'Inactive'}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing' }, { label: 'Work Centers' }]}
        title="Work Centers"
        subtitle={`${list.total} work centers`}
        actions={<button className="btn-primary btn-sm"><Plus size={13} /> New Work Center</button>}
      />
      <DataTable
        columns={columns} data={list.data} total={list.total} page={list.page} limit={list.limit}
        isLoading={list.isLoading} search={list.search} onSearchChange={list.handleSearch}
        onPageChange={list.setPage} onLimitChange={list.setLimit}
        emptyMessage="No work centers found."
      />
    </div>
  );
}
