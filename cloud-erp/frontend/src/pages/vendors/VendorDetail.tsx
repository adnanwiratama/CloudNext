import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import TransactionLink from '../../components/common/TransactionLink';
import toast from 'react-hot-toast';

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => api.get(`/api/vendors/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const { data: txData } = useQuery({
    queryKey: ['vendor-transactions', id],
    queryFn: () => api.get(`/api/vendors/${id}/transactions`).then(r => r.data.data).catch(() => null),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!vendor) return <div className="text-center py-12 text-slate-500">Vendor not found</div>;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Vendors', path: '/vendors' }, { label: vendor.vendor_number }]}
        title={vendor.name}
        status={<StatusBadge status={vendor.status} />}
        actions={<>
          <button onClick={() => navigate('/vendors')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Back</button>
          {canEdit && <button onClick={() => navigate(`/vendors/new?edit=${id}`)} className="btn-secondary btn-sm"><Edit size={13} /> Edit</button>}
          {canDelete && (
            <button className="btn-danger btn-sm" onClick={() => {
              if (confirm(`Delete vendor "${vendor.name}"?`)) {
                api.delete(`/api/vendors/${id}`)
                  .then(() => { toast.success('Vendor deleted'); navigate('/vendors'); })
                  .catch((e: any) => toast.error(e.response?.data?.error || 'Failed to delete'));
              }
            }}><Trash2 size={13} /> Delete</button>
          )}
          {canEdit && <button className="btn-primary btn-sm" onClick={() => navigate('/purchasing/orders/new')}>New PO</button>}
        </>}
      />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Vendor Information</div>
            <div className="form-grid-2">
              <div><label className="erp-label">Vendor Number</label><div className="text-sm font-mono text-blue-600">{vendor.vendor_number}</div></div>
              <div><label className="erp-label">Type</label><div className="text-sm capitalize">{vendor.type}</div></div>
              <div><label className="erp-label">Email</label><div className="text-sm">{vendor.email || '-'}</div></div>
              <div><label className="erp-label">Phone</label><div className="text-sm">{vendor.phone || '-'}</div></div>
              <div><label className="erp-label">Tax ID</label><div className="text-sm">{vendor.tax_id || '-'}</div></div>
              <div><label className="erp-label">Currency</label><div className="text-sm">{vendor.currency}</div></div>
              <div><label className="erp-label">Payment Terms</label><div className="text-sm">{vendor.payment_terms || '-'}</div></div>
              <div><label className="erp-label">Address</label><div className="text-sm">{[vendor.address, vendor.city, vendor.country].filter(Boolean).join(', ') || '-'}</div></div>
            </div>
          </div>

          {/* Recent Purchase Orders */}
          {txData?.purchaseOrders?.length > 0 && (
            <div className="erp-card">
              <div className="form-section-title">Recent Purchase Orders</div>
              <table className="erp-table">
                <thead><tr><th>PO #</th><th>Date</th><th className="text-right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {txData.purchaseOrders.slice(0, 10).map((po: any) => (
                    <tr key={po.id} className="cursor-pointer" onClick={() => navigate(`/purchasing/orders/${po.id}`)}>
                      <td><TransactionLink number={po.po_number} id={po.id} /></td>
                      <td className="text-xs text-slate-500">{formatDate(po.order_date)}</td>
                      <td className="text-right font-medium">{formatCurrency(po.total_amount)}</td>
                      <td><StatusBadge status={po.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Bills */}
          {txData?.bills?.length > 0 && (
            <div className="erp-card">
              <div className="form-section-title">Recent Bills</div>
              <table className="erp-table">
                <thead><tr><th>Bill #</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Due</th><th>Status</th></tr></thead>
                <tbody>
                  {txData.bills.slice(0, 10).map((b: any) => (
                    <tr key={b.id}>
                      <td><TransactionLink number={b.bill_number} id={b.id} /></td>
                      <td className="text-xs text-slate-500">{formatDate(b.bill_date)}</td>
                      <td className="text-right font-medium">{formatCurrency(b.total_amount)}</td>
                      <td className="text-right text-red-600">{formatCurrency(b.amount_due)}</td>
                      <td><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {vendor.contacts?.length > 0 && (
            <div className="erp-card">
              <div className="form-section-title">Contacts</div>
              <table className="erp-table">
                <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th></tr></thead>
                <tbody>
                  {vendor.contacts.map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-medium">{c.name}</td>
                      <td>{c.title || '-'}</td>
                      <td>{c.email || '-'}</td>
                      <td>{c.phone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Account Summary</div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Total Billed</span>
                <span className="text-sm font-semibold">{formatCurrency(vendor.stats?.total_billed || 0)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-xs text-slate-500">Outstanding</span>
                <span className="text-sm font-semibold text-red-600">{formatCurrency(vendor.stats?.total_outstanding || 0)}</span>
              </div>
            </div>
          </div>
          <div className="erp-card">
            <div className="form-section-title">System Info</div>
            <div className="p-4 space-y-2">
              <div><label className="erp-label">Created</label><div className="text-sm">{formatDate(vendor.created_at)}</div></div>
              <div><label className="erp-label">Last Updated</label><div className="text-sm">{formatDate(vendor.updated_at)}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
