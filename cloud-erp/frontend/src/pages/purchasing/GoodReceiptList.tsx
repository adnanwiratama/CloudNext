import TransactionListPage, { ListColumn } from '../../components/transaction/TransactionListPage';
import { StatusBadge } from '../../components/common/DataTable';
import { formatDate } from '../../utils/format';

export default function GoodReceiptList() {
  const columns: ListColumn[] = [
    { key: 'receipt_number', label: 'GRN #', render: r => <span className="font-mono text-blue-600 font-medium">{r.receipt_number}</span> },
    { key: 'po_number', label: 'PO #', render: r => <span className="font-mono text-xs">{r.po_number || '-'}</span> },
    { key: 'vendor_name', label: 'Vendor', render: r => <span className="font-medium">{r.vendor_name}</span> },
    { key: 'receipt_date', label: 'Receipt Date', render: r => formatDate(r.receipt_date) },
    { key: 'department_name', label: 'Department' },
    { key: 'location_name', label: 'Location', render: r => r.location_name || '-' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'is_posted', label: 'GL Posted', render: r => (
      <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${r.is_posted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
        {r.is_posted ? 'Posted' : 'Pending'}
      </span>
    ) },
  ];

  return (
    <TransactionListPage
      title="Item Receipts"
      iconBg="bg-amber-600"
      iconText="IR"
      endpoint="/api/purchasing/receipts"
      newPath="/purchasing/receipts/new"
      detailPath={r => `/purchasing/receipts/${r.id}`}
      columns={columns}
      numberField="receipt_number"
      dateField="receipt_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'received', 'partial', 'cancelled']}
    />
  );
}
