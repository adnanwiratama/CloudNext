import { useNavigate } from 'react-router-dom';

/**
 * Maps a transaction number prefix to its route path.
 * Click navigates to the transaction detail page.
 */
function resolveRoute(number: string, sourceType?: string, sourceId?: string): string | null {
  if (!number && !sourceType) return null;

  // Direct source_type mapping (most reliable)
  if (sourceType && sourceId) {
    const map: Record<string, string> = {
      'bank_check'        : `/bank/checks/${sourceId}`,
      'bank_deposit'      : `/bank/deposits-list`,
      'bank_transfer'     : `/bank/transfers-list`,
      'invoice'           : `/sales/invoices/${sourceId}`,
      'sales_order'       : `/sales/orders/${sourceId}`,
      'purchase_order'    : `/purchasing/orders/${sourceId}`,
      'vendor_bill'       : `/purchasing/bills/${sourceId}`,
      'bill_payment'      : `/purchasing/payments/${sourceId}`,
      'customer_payment'  : `/sales/payments/${sourceId}`,
      'goods_receipt'     : `/purchasing/receipts/${sourceId}`,
      'item_fulfillment'  : `/sales/fulfillments/${sourceId}`,
      'work_order'        : `/manufacturing/work-orders/${sourceId}`,
      'vendor_credit'     : `/purchasing/vendor-credits`,
      'customer_deposit'  : `/sales/deposits`,
      'credit_memo'       : `/sales/credit-memos`,
      'customer_refund'   : `/sales/refunds`,
      'inventory_adjustment': `/inventory/adjustments`,
    };
    if (map[sourceType]) return map[sourceType];
  }

  if (!number) return null;
  const n = number.toUpperCase();
  if (n.startsWith('CH/') || n.startsWith('JE-CHK-')) return sourceId ? `/bank/checks/${sourceId}` : '/bank/checks-list';
  if (n.startsWith('SO-'))    return `/sales/orders`;
  if (n.startsWith('INV-'))   return `/sales/invoices`;
  if (n.startsWith('RCPT-'))  return `/sales/payments`;
  if (n.startsWith('PO-'))    return `/purchasing/orders`;
  if (n.startsWith('BILL-'))  return `/purchasing/bills`;
  if (n.startsWith('PYMT-'))  return `/purchasing/payments`;
  if (n.startsWith('GRN-'))   return `/purchasing/receipts`;
  if (n.startsWith('IF-'))    return `/sales/fulfillments`;
  if (n.startsWith('JE-'))    return `/accounting/journals`;
  if (n.startsWith('WO-'))    return `/manufacturing/work-orders`;
  if (n.startsWith('BOM-'))   return `/manufacturing/boms`;
  if (n.startsWith('PR-'))    return `/purchasing/requisitions`;
  if (n.startsWith('QT-'))    return `/sales/quotations`;
  return null;
}

interface TransactionLinkProps {
  number: string;
  id?: string;
  sourceType?: string;
  currentNumber?: string;
  className?: string;
}

export default function TransactionLink({ number, id, sourceType, currentNumber, className }: TransactionLinkProps) {
  const navigate = useNavigate();

  if (currentNumber && number === currentNumber) {
    return <span className={`font-mono font-medium ${className || 'text-slate-800'}`}>{number}</span>;
  }

  const path = resolveRoute(number, sourceType, id);

  if (!path) {
    return <span className={`font-mono ${className || 'text-slate-600'}`}>{number}</span>;
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); navigate(path); }}
      className={`font-mono text-blue-600 hover:text-blue-800 hover:underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 ${className || ''}`}
      title={`Go to ${number}`}
    >
      {number}
    </button>
  );
}
