import { useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import DataTable, { Column, StatusBadge } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { useListPage } from '../../hooks/useListPage';
import { formatCurrency, formatDate } from '../../utils/format';
import TransactionLink from '../../components/common/TransactionLink';

export default function JournalList() {
  const navigate = useNavigate();
  const list = useListPage({ queryKey: 'journals', endpoint: '/api/accounting/journals' });

  const columns: Column[] = [
    { sortable: true, key: 'journal_number', label: 'Journal #', width: '150px', render: (v, row) => <TransactionLink number={v} id={row.id} /> },
    { key: 'entry_date', label: 'Date', width: '110px', render: v => formatDate(v) },
    { key: 'type', label: 'Type', width: '100px', render: v => <span className="capitalize text-xs">{v?.replace(/_/g,' ')}</span> },
    { key: 'source_type', label: 'Source', width: '120px', render: v => <span className="capitalize text-xs text-slate-500">{v?.replace(/_/g,' ')||'-'}</span> },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name',   label: 'Location' },
    { key: 'memo', label: 'Memo', render: v => <span className="text-slate-600 truncate max-w-xs block">{v||'-'}</span> },
    { key: 'total_debit', label: 'Total Debit', align: 'right', render: v => <span className="font-medium text-blue-700">{formatCurrency(v)}</span> },
    { key: 'total_credit', label: 'Total Credit', align: 'right', render: v => <span className="font-medium text-emerald-700">{formatCurrency(v)}</span> },
    { key: 'status', label: 'Status', width: '100px', render: v => <StatusBadge status={v} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'Journal Entries' }]}
        title="Journal Entries"
        subtitle={`${list.total.toLocaleString()} entries`}
        actions={
          <>
            <button className="btn-secondary btn-sm"><Download size={13}/> Export</button>
            <button className="btn-primary btn-sm" onClick={() => navigate('/accounting/journals/new')}><Plus size={13}/> New Journal Entry</button>
          </>
        }
      />
      <DataTable
        columns={columns} data={list.data} total={list.total} page={list.page} limit={list.limit}
        isLoading={list.isLoading} search={list.search} onSearchChange={list.handleSearch}
        onPageChange={list.setPage} onLimitChange={list.setLimit}
        onSort={list.handleSort} sortBy={list.sortBy} sortDir={list.sortDir}
        onRowClick={row => navigate(`/accounting/journals/${row.id}`)}
        filters={
          <div className="flex items-center gap-2">
            <select className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white" onChange={e => list.handleFilter('type', e.target.value)}>
              <option value="">All Types</option>
              <option value="system">System</option>
              <option value="manual">Manual</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <select className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white" onChange={e => list.handleFilter('status', e.target.value)}>
              <option value="">All Status</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>
        }
        emptyMessage="No journal entries found."
      />
    </div>
  );
}
