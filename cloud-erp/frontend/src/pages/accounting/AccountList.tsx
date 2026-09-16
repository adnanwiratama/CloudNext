import { Plus } from 'lucide-react';
import DataTable, { Column } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { useListPage } from '../../hooks/useListPage';
import { formatCurrency } from '../../utils/format';

const typeColors: Record<string, string> = {
  asset: 'badge-blue', liability: 'badge-red', equity: 'badge-purple',
  revenue: 'badge-green', cogs: 'badge-orange', expense: 'badge-yellow',
  other_income: 'badge-green', other_expense: 'badge-yellow',
};

// Normal balance: asset/expense = debit-positive, liability/equity/revenue = credit-positive
function getDisplayBalance(acct: any): { amount: number; isNormal: boolean } {
  const net = parseFloat(acct.net_balance || 0);
  const normalDebit = ['asset', 'cogs', 'expense', 'other_expense'].includes(acct.type);
  if (normalDebit) return { amount: net, isNormal: net >= 0 };
  return { amount: -net, isNormal: -net >= 0 };
}

export default function AccountList() {
  const list = useListPage({ queryKey: 'accounts', endpoint: '/api/accounting/accounts', defaultLimit: 100 });

  const columns: Column[] = [
    { key: 'code', label: 'Code', width: '80px', sortable: true, render: v => <span className="font-mono font-semibold text-slate-800">{v}</span> },
    { key: 'name', label: 'Account Name', sortable: true, render: v => <span className="font-medium">{v}</span> },
    { key: 'type', label: 'Type', width: '110px', sortable: true, render: v => <span className={`badge ${typeColors[v] || 'badge-gray'} text-2xs capitalize`}>{v?.replace(/_/g,' ')}</span> },
    { key: 'subtype', label: 'Sub Type', render: v => v ? <span className="text-xs text-slate-500 capitalize">{v?.replace(/_/g,' ')}</span> : '-' },
    { key: 'currency', label: 'Curr', width: '60px' },
    {
      key: 'net_balance',
      label: 'Balance (Posted)',
      align: 'right',
      width: '150px',
      render: (v, row) => {
        const { amount, isNormal } = getDisplayBalance(row);
        if (amount === 0) return <span className="text-slate-300 text-xs">—</span>;
        return (
          <span className={`font-medium ${isNormal ? 'text-slate-800' : 'text-red-600'}`}>
            {amount < 0 ? '(' : ''}{formatCurrency(Math.abs(amount))}{amount < 0 ? ')' : ''}
          </span>
        );
      },
    },
    {
      key: 'total_debit',
      label: 'Total Dr',
      align: 'right',
      width: '130px',
      render: v => parseFloat(v || 0) > 0 ? <span className="text-xs text-blue-600">{formatCurrency(v)}</span> : <span className="text-slate-200 text-xs">—</span>,
    },
    {
      key: 'total_credit',
      label: 'Total Cr',
      align: 'right',
      width: '130px',
      render: v => parseFloat(v || 0) > 0 ? <span className="text-xs text-emerald-600">{formatCurrency(v)}</span> : <span className="text-slate-200 text-xs">—</span>,
    },
    { key: 'is_active', label: 'Active', width: '65px', render: v => <span className={v ? 'badge badge-green text-2xs' : 'badge badge-gray text-2xs'}>{v ? 'Active' : 'Inactive'}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Accounting' }, { label: 'Chart of Accounts' }]}
        title="Chart of Accounts"
        subtitle={`${list.total} accounts`}
        actions={<button className="btn-primary btn-sm"><Plus size={13} /> New Account</button>}
      />
      <DataTable
        columns={columns}
        data={list.data}
        total={list.total}
        page={list.page}
        limit={list.limit}
        isLoading={list.isLoading}
        search={list.search}
        onSearchChange={list.handleSearch}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        onSort={list.handleSort}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        filters={
          <select className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white" onChange={e => list.handleFilter('type', e.target.value)}>
            <option value="">All Types</option>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="revenue">Revenue</option>
            <option value="cogs">COGS</option>
            <option value="expense">Expense</option>
          </select>
        }
        emptyMessage="No accounts found."
      />
    </div>
  );
}
