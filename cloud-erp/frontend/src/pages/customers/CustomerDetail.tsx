import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Plus, FileText, DollarSign, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import TransactionLink from '../../components/common/TransactionLink';
import toast from 'react-hot-toast';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canEdit, canDelete } = useAdminGuard();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/api/customers/${id}`).then(r => r.data.data),
    enabled: !!id && id !== 'new',
  });

  const { data: txData } = useQuery({
    queryKey: ['customer-transactions', id],
    queryFn: () => api.get(`/api/customers/${id}/transactions`).then(r => r.data.data),
    enabled: !!id && id !== 'new',
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-500" />
    </div>
  );

  if (!customer) return <div className="text-center py-12 text-slate-500">Customer not found</div>;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Customers', path: '/customers' }, { label: customer.customer_number }]}
        title={customer.name}
        subtitle={customer.company_name}
        status={<StatusBadge status={customer.status} />}
        actions={
          <>
            <button onClick={() => navigate('/customers')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Back</button>
            {canEdit && <button onClick={() => navigate(`/customers/new?edit=${id}`)} className="btn-secondary btn-sm"><Edit size={13} /> Edit</button>}
            {canDelete && (
              <button className="btn-danger btn-sm" onClick={() => {
                if (confirm(`Delete customer "${customer.name}"? This cannot be undone.`)) {
                  api.delete(`/api/customers/${id}`)
                    .then(() => { toast.success('Customer deleted'); navigate('/customers'); })
                    .catch((e: any) => toast.error(e.response?.data?.error || 'Failed to delete'));
                }
              }}><Trash2 size={13} /> Delete</button>
            )}
            <button className="btn-primary btn-sm" onClick={() => navigate('/sales/orders/new')}><FileText size={13} /> New SO</button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {/* Left: Main Info */}
        <div className="col-span-2 space-y-4">
          {/* Overview */}
          <div className="erp-card">
            <div className="form-section-title">Customer Information</div>
            <div className="form-grid-2">
              <div><label className="erp-label">Customer Number</label><div className="text-sm font-mono text-blue-600">{customer.customer_number}</div></div>
              <div><label className="erp-label">Type</label><div className="text-sm capitalize">{customer.type}</div></div>
              <div><label className="erp-label">Email</label><div className="text-sm">{customer.email || '-'}</div></div>
              <div><label className="erp-label">Phone</label><div className="text-sm">{customer.phone || '-'}</div></div>
              <div><label className="erp-label">Tax ID</label><div className="text-sm">{customer.tax_id || '-'}</div></div>
              <div><label className="erp-label">Currency</label><div className="text-sm">{customer.currency}</div></div>
              <div><label className="erp-label">Payment Terms</label><div className="text-sm">{customer.payment_terms || '-'}</div></div>
              <div><label className="erp-label">Credit Limit</label><div className="text-sm font-medium">{formatCurrency(customer.credit_limit)}</div></div>
              <div><label className="erp-label">Sales Rep</label><div className="text-sm">{customer.sales_rep_name || '-'}</div></div>
              <div><label className="erp-label">Subsidiary</label><div className="text-sm">{customer.subsidiary_name || '-'}</div></div>
            </div>
          </div>

          {/* Addresses */}
          <div className="erp-card">
            <div className="form-section-title">Addresses</div>
            <div className="form-grid-2">
              <div>
                <label className="erp-label">Billing Address</label>
                <div className="text-sm text-slate-700 whitespace-pre-line">
                  {[customer.billing_address, customer.billing_city, customer.billing_country].filter(Boolean).join('\n') || '-'}
                </div>
              </div>
              <div>
                <label className="erp-label">Shipping Address</label>
                <div className="text-sm text-slate-700 whitespace-pre-line">
                  {[customer.shipping_address, customer.shipping_city, customer.shipping_country].filter(Boolean).join('\n') || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* Contacts */}
          {customer.contacts?.length > 0 && (
            <div className="erp-card">
              <div className="form-section-title">Contacts</div>
              <table className="erp-table">
                <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th></tr></thead>
                <tbody>
                  {customer.contacts.map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-medium">{c.name} {c.is_primary && <span className="badge badge-blue ml-1">Primary</span>}</td>
                      <td>{c.title || '-'}</td>
                      <td>{c.email || '-'}</td>
                      <td>{c.phone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Invoices */}
          <div className="erp-card">
            <div className="erp-card-header">
              <span className="text-sm font-semibold">Recent Invoices</span>
              <Link to={`/sales/invoices?customerId=${id}`} className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
            <table className="erp-table">
              <thead><tr><th>Invoice #</th><th>Date</th><th>Due Date</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {(txData?.invoices || []).slice(0, 5).map((inv: any) => (
                  <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/sales/invoices/${inv.id}`)}>
                    <td><TransactionLink number={inv.invoice_number} id={inv.id} /></td>
                    <td>{formatDate(inv.invoice_date)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td className="text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                    <td className={`text-right font-medium ${parseFloat(inv.amount_due) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(inv.amount_due)}</td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
                {(!txData?.invoices || txData.invoices.length === 0) && (
                  <tr><td colSpan={6} className="text-center py-4 text-slate-400 text-sm">No invoices</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Stats */}
        <div className="space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Account Summary</div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Total Billed</span>
                <span className="text-sm font-semibold">{formatCurrency(customer.stats?.total_billed || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Outstanding Balance</span>
                <span className="text-sm font-semibold text-red-600">{formatCurrency(customer.stats?.total_outstanding || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-slate-500">Total Invoices</span>
                <span className="text-sm font-semibold">{customer.stats?.total_invoices || 0}</span>
              </div>
            </div>
          </div>

          <div className="erp-card">
            <div className="form-section-title">System Info</div>
            <div className="p-4 space-y-2">
              <div><label className="erp-label">Created</label><div className="text-sm">{formatDate(customer.created_at)}</div></div>
              <div><label className="erp-label">Last Updated</label><div className="text-sm">{formatDate(customer.updated_at)}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
