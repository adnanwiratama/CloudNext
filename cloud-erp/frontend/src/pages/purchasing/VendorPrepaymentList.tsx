import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency, formatDate } from '../../utils/format';

export default function VendorPrepaymentList() {
  return (
    <TransactionListPage
      title="Vendor Prepayments"
      permissionKey="bill_payment"
      iconBg="bg-violet-600" iconText="$"
      endpoint="/api/purchasing/prepayments"
      newPath="/purchasing/prepayments/new"
      detailPath={r => `/purchasing/prepayments/${r.id}`}
      numberField="prepayment_number"
      dateField="payment_date"
      memoField="vendor_name"
      statusOptions={['- All -', 'unapplied', 'applied', 'voided']}
      columns={[
        { key: 'prepayment_number', label: 'Document Number', render: r => <span className="font-medium text-slate-800">{r.prepayment_number}</span> },
        { key: 'payment_date', label: 'Date', render: r => formatDate(r.payment_date) },
        { key: 'vendor_name', label: 'Vendor' },
        { key: 'payment_method', label: 'Method', render: r => (r.payment_method || '').replace(/_/g, ' ') },
        { key: 'amount', label: 'Amount', align: 'right', render: r => formatCurrency(r.amount) },
        { key: 'amount_applied', label: 'Applied', align: 'right', render: r => formatCurrency(r.amount_applied) },
        { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'applied' ? 'bg-green-100 text-green-700' : status === 'unapplied' ? 'bg-blue-100 text-blue-700' : status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>{status || '-'}</span>;
}
