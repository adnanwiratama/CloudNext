import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function CreditMemoList() {
  return (
    <TransactionListPage
      title="Credit Memos"
      permissionKey="credit_memo"
      iconBg="bg-emerald-600" iconText="−"
      endpoint="/api/sales/credit-memos"
      newPath="/sales/credit-memos/new"
      detailPath={r => `/sales/credit-memos/${r.id}`}
      numberField="memo_number"
      dateField="memo_date"
      memoField="customer_name"
      statusOptions={['- All -', 'open', 'applied', 'voided']}
      columns={[
        { key: 'memo_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.memo_number}</span> },
        { key: 'memo_date', label: 'Date', render: r => formatDate(r.memo_date) },
        { key: 'customer_name', label: 'Customer' },
        { key: 'reason', label: 'Reason', render: r => (r.reason || '').replace(/_/g, ' ') || '-' },
        { key: 'total_amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.total_amount) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'applied' ? 'bg-green-100 text-green-700' : status === 'open' ? 'bg-blue-100 text-blue-700' : status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
