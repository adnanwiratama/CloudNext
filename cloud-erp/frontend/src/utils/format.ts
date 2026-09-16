export function formatCurrency(amount: number | string, currency = 'IDR'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(value: number | string, decimals = 0): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function formatPercent(value: number | string, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return `${num.toFixed(decimals)}%`;
}

export const STATUS_COLORS: Record<string, string> = {
  // Sales
  draft: 'badge-gray',
  submitted: 'badge-blue',
  approved: 'badge-green',
  rejected: 'badge-red',
  converted: 'badge-purple',
  closed: 'badge-gray',
  cancelled: 'badge-red',
  pending_approval: 'badge-yellow',
  pending_fulfillment: 'badge-blue',
  partially_fulfilled: 'badge-orange',
  pending_billing: 'badge-blue',
  partially_billed: 'badge-orange',
  billed: 'badge-green',
  open: 'badge-blue',
  partially_paid: 'badge-orange',
  paid: 'badge-green',
  voided: 'badge-red',
  overdue: 'badge-red',
  // Purchase
  pending_receipt: 'badge-blue',
  partially_received: 'badge-orange',
  fully_received: 'badge-green',
  pending_billing_po: 'badge-blue',
  // Work Orders
  planned: 'badge-gray',
  released: 'badge-blue',
  in_progress: 'badge-orange',
  completed: 'badge-green',
  // General
  active: 'badge-green',
  inactive: 'badge-gray',
  suspended: 'badge-red',
  posted: 'badge-green',
  reversed: 'badge-red',
};

export function getStatusBadgeClass(status: string): string {
  return STATUS_COLORS[status?.toLowerCase()] || 'badge-gray';
}

export function formatStatus(status: string): string {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '-';
}
