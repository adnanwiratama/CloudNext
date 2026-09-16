import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DataTable, { Column, StatusBadge } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { useListPage } from '../../hooks/useListPage';
import TransactionLink from '../../components/common/TransactionLink';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { formatDate } from '../../utils/format';

export default function BOMList() {
  const navigate = useNavigate();
  const list = useListPage({ queryKey: 'boms', endpoint: '/api/manufacturing/boms' });
  const { canAdd } = useAdminGuard();

  const columns: Column[] = [
    { sortable: true, key: 'bom_number', label: 'BOM #', width: '160px', render: (v, row) => <TransactionLink number={v} id={row.id} /> },
    { key: 'name', label: 'BOM Name', render: v => <span className="font-medium">{v}</span> },
    { key: 'item_code', label: 'Finished Good', render: (v, row) => (
      <div><span className="font-mono text-xs text-blue-600">{v}</span><div className="text-xs text-slate-500">{row.item_name}</div></div>
    )},
    { key: 'revision', label: 'Rev', width: '60px' },
    { key: 'effective_date', label: 'Effective', render: v => formatDate(v) },
    { key: 'quantity', label: 'Qty', width: '70px' },
    { key: 'yield_percent', label: 'Yield %', width: '80px', render: v => `${v}%` },
    { key: 'status', label: 'Status', width: '90px', render: v => <StatusBadge status={v} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing' }, { label: 'Bill of Materials' }]}
        title="Bill of Materials"
        subtitle={`${list.total} BOMs`}
        actions={
          <>
            {canAdd && (
              <button className="btn-primary btn-sm" onClick={() => navigate('/manufacturing/boms/new')}><Plus size={13} /> New BOM</button>
            )}
          </>
        }
      />
      <DataTable
        columns={columns} data={list.data} total={list.total} page={list.page} limit={list.limit}
        isLoading={list.isLoading} search={list.search} onSearchChange={list.handleSearch}
        onPageChange={list.setPage} onLimitChange={list.setLimit}
        onSort={list.handleSort} sortBy={list.sortBy} sortDir={list.sortDir}
        onRowClick={row => navigate(`/manufacturing/boms/${row.id}`)}
        emptyMessage="No BOMs found."
      />
    </div>
  );
}
