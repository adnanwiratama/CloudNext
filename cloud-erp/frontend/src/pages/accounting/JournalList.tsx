import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';

export default function JournalList() {
  const columns: ListColumn[] = [
    { key: 'journal_number', label: 'Journal #', render: r => <span className="font-mono text-blue-600 font-medium">{r.journal_number}</span> },
    { key: 'entry_date', label: 'Date', render: r => formatDate(r.entry_date) },
    { key: 'type', label: 'Type', render: r => <span className="capitalize">{r.type?.replace(/_/g, ' ') || '-'}</span> },
    { key: 'source_type', label: 'Source', render: r => <span className="capitalize text-slate-500">{r.source_type?.replace(/_/g, ' ') || '-'}</span> },
    { key: 'memo', label: 'Memo', render: r => <span className="text-slate-600 truncate max-w-xs block">{r.memo || '-'}</span> },
    { key: 'total_debit', label: 'Total Debit', align: 'right', render: r => <span className="font-medium text-blue-700">{formatCurrency(r.total_debit)}</span> },
    { key: 'total_credit', label: 'Total Credit', align: 'right', render: r => <span className="font-medium text-emerald-700">{formatCurrency(r.total_credit)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <TransactionListPage
      title="Journal Entries"
      permissionKey="journal_entry"
      iconBg="bg-indigo-600"
      iconText="JE"
      endpoint="/api/accounting/journals?limit=500"
      newPath="/accounting/journals/new"
      detailPath={r => `/accounting/journals/${r.id}`}
      columns={columns}
      numberField="journal_number"
      dateField="entry_date"
      memoField="memo"
      statusOptions={['- All -', 'draft', 'posted', 'reversed']}
      extraFilter={{
        label: 'Type',
        field: 'type',
        options: [
          { value: '', label: '- All -' },
          { value: 'system', label: 'System' },
          { value: 'manual', label: 'Manual' },
        ],
      }}
    />
  );
}
