import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Building2 } from 'lucide-react';
import api from '../../services/api';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import TransactionLink from '../../components/common/TransactionLink';
import toast from 'react-hot-toast';

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);

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

  const handleDelete = () => {
    if (confirm(`Delete vendor "${vendor.name}"?`)) {
      api.delete(`/api/vendors/${id}`)
        .then(() => { toast.success('Vendor deleted'); navigate('/vendors'); })
        .catch((e: any) => toast.error(e.response?.data?.error || 'Failed to delete'));
    }
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 min-h-[34px]';
  const lbl = 'block text-xs text-slate-500 mb-1';
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div><label className={lbl}>{label}</label><div className={dis}>{value !== undefined && value !== null && value !== '' ? value : '-'}</div></div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center text-white"><Building2 size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Vendor</span>
              <span className="text-xl font-semibold text-slate-500">{vendor.name}</span>
              <StatusBadge status={vendor.status} />
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/vendors')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/vendors')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {canEdit && <button onClick={() => navigate(`/vendors/new?edit=${id}`)} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Edit</button>}
          {canEdit && <button onClick={() => navigate('/purchasing/orders/new')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">New PO</button>}
          {canDelete && <button onClick={handleDelete} className="px-3 py-1.5 border border-red-300 bg-white text-sm text-red-600 rounded hover:bg-red-50">Delete</button>}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <Field label="Vendor Number" value={<span className="font-mono text-blue-600">{vendor.vendor_number}</span>} />
                  <Field label="Vendor Name" value={vendor.name} />
                  <Field label="Type" value={<span className="capitalize">{vendor.type}</span>} />
                  <Field label="Tax ID (NPWP)" value={vendor.tax_id} />
                </div>
                <div className="space-y-3">
                  <Field label="Email" value={vendor.email} />
                  <Field label="Phone" value={vendor.phone} />
                  <Field label="Status" value={<span className="capitalize">{vendor.status}</span>} />
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Notes</label><div className={`${dis} whitespace-pre-line`}>{vendor.notes || '-'}</div></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Address */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setAddressOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {addressOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Address
          </button>
          {addressOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="col-span-3"><label className={lbl}>Street Address</label><div className={`${dis} whitespace-pre-line`}>{vendor.address || '-'}</div></div>
                <Field label="City" value={vendor.city} />
                <Field label="State / Province" value={vendor.state} />
                <Field label="Country" value={vendor.country} />
              </div>
            </div>
          )}
        </div>

        {/* Financial & Bank Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setFinancialOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {financialOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Financial & Bank Information
          </button>
          {financialOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <Field label="Currency" value={vendor.currency} />
                <Field label="Payment Terms" value={vendor.payment_terms} />
                <Field label="Credit Limit" value={formatCurrency(vendor.credit_limit || 0)} />
                <Field label="Bank Name" value={vendor.bank_name} />
                <Field label="Bank Account Number" value={vendor.bank_account_number} />
                <Field label="Account Holder Name" value={vendor.bank_account_name} />
              </div>
            </div>
          )}
        </div>

        {/* Account Summary + System Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-white border border-slate-200 rounded shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">Account Summary</div>
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-xs text-slate-500">Total Billed</div><div className="text-sm font-semibold">{formatCurrency(vendor.stats?.total_billed || 0)}</div></div>
              <div><div className="text-xs text-slate-500">Outstanding</div><div className="text-sm font-semibold text-red-600">{formatCurrency(vendor.stats?.total_outstanding || 0)}</div></div>
              <div><div className="text-xs text-slate-500">Total Bills</div><div className="text-sm font-semibold">{vendor.stats?.total_bills || 0}</div></div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">System Info</div>
            <div className="space-y-2">
              <div><div className="text-xs text-slate-500">Created</div><div className="text-sm">{formatDate(vendor.created_at)}</div></div>
              <div><div className="text-xs text-slate-500">Last Updated</div><div className="text-sm">{formatDate(vendor.updated_at)}</div></div>
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        {(txData?.purchaseOrders?.length > 0 || txData?.bills?.length > 0) && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button onClick={() => setActivityOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {activityOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Recent Transactions
            </button>
            {activityOpen && (
              <div className="border-t border-slate-100 p-4 space-y-5">
                {txData?.purchaseOrders?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">Purchase Orders</div>
                    <div className="overflow-x-auto border border-slate-200 rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">PO #</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Date</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Total</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                        </tr></thead>
                        <tbody>
                          {txData.purchaseOrders.slice(0, 10).map((po: any) => (
                            <tr key={po.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/purchasing/orders/${po.id}`)}>
                              <td className="px-3 py-2"><TransactionLink number={po.po_number} id={po.id} /></td>
                              <td className="px-3 py-2 text-slate-600">{formatDate(po.order_date)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCurrency(po.total_amount)}</td>
                              <td className="px-3 py-2"><StatusBadge status={po.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {txData?.bills?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">Bills</div>
                    <div className="overflow-x-auto border border-slate-200 rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Bill #</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Date</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Total</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Due</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                        </tr></thead>
                        <tbody>
                          {txData.bills.slice(0, 10).map((b: any) => (
                            <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-2"><TransactionLink number={b.bill_number} id={b.id} /></td>
                              <td className="px-3 py-2 text-slate-600">{formatDate(b.bill_date)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCurrency(b.total_amount)}</td>
                              <td className="px-3 py-2 text-right text-red-600">{formatCurrency(b.amount_due)}</td>
                              <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
