import { useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import DataTable, { Column, StatusBadge } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { useListPage } from '../../hooks/useListPage';
import TransactionLink from '../../components/common/TransactionLink';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

export default function WorkOrderList() {
  const navigate = useNavigate();
  const list = useListPage({ queryKey: 'work-orders', endpoint: '/api/manufacturing/work-orders' });
  const { canAdd } = useAdminGuard();

  const columns: Column[] = [
    { sortable: true, key: 'wo_number', label: 'WO #', width: '150px', render: (v, row) => <TransactionLink number={v} id={row.id} /> },
    { key: 'item_code', label: 'Item', render: (v, row) => (
      <div><span className="font-mono text-xs text-blue-600">{v}</span><div className="text-xs font-medium text-slate-700">{row.item_name}</div></div>
    )},
    { key: 'planned_quantity', label: 'Planned', align: 'right', render: v => formatNumber(v, 0) },
    { key: 'completed_quantity', label: 'Completed', align: 'right', render: (v, row) => (
      <span className={parseFloat(v) >= parseFloat(row.planned_quantity) ? 'text-emerald-600 font-medium' : 'text-slate-600'}>
        {formatNumber(v, 0)}
      </span>
    )},
    { key: 'planned_start_date', label: 'Start Date', render: v => formatDate(v) },
    { key: 'planned_end_date',   label: 'End Date',   render: v => formatDate(v) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name',   label: 'Location' },
    { key: 'status', label: 'Status', width: '120px', render: v => <StatusBadge status={v} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing' }, { label: 'Work Orders' }]}
        title="Work Orders"
        subtitle={`${list.total.toLocaleString()} work orders`}
        actions={
          <>
            <button className="btn-secondary btn-sm"><Download size={13} /> Export</button>
            {canAdd && <button className="btn-primary btn-sm" onClick={() => navigate('/manufacturing/work-orders/new')}><Plus size={13} /> New WO</button>}
          </>
        }
      />
      <DataTable
        columns={columns} data={list.data} total={list.total} page={list.page} limit={list.limit}
        isLoading={list.isLoading} search={list.search} onSearchChange={list.handleSearch}
        onPageChange={list.setPage} onLimitChange={list.setLimit}
        onSort={list.handleSort} sortBy={list.sortBy} sortDir={list.sortDir}
        onRowClick={row => navigate(`/manufacturing/work-orders/${row.id}`)}
        filters={
          <select className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white" onChange={e => list.handleFilter('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="planned">Planned</option>
            <option value="released">Released</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
        emptyMessage="No work orders found."
      />
    </div>
  );
}
