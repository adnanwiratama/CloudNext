import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, User } from 'lucide-react';
import api from '../../services/api';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import TransactionLink from '../../components/common/TransactionLink';
import toast from 'react-hot-toast';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/api/customers/${id}`).then(r => r.data.data),
    enabled: !!id && id !== 'new',
  });

  const { data: txData } = useQuery({
    queryKey: ['customer-transactions', id],
    queryFn: () => api.get(`/api/customers/${id}/transactions`).then(r => r.data.data).catch(() => null),
    enabled: !!id && id !== 'new',
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!customer) return <div className="text-center py-12 text-slate-500">Customer not found</div>;

  const handleDelete = () => {
    if (confirm(`Delete customer "${customer.name}"? This cannot be undone.`)) {
      api.delete(`/api/customers/${id}`)
        .then(() => { toast.success('Customer deleted'); navigate('/customers'); })
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
              <div className="w-8 h-8 rounded bg-sky-600 flex items-center justify-center text-white"><User size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Customer</span>
              <span className="text-xl font-semibold text-slate-500">{customer.name}</span>
              <StatusBadge status={customer.status} />
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/customers')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/customers')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {canEdit && <button onClick={() => navigate(`/customers/new?edit=${id}`)} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Edit</button>}
          <button onClick={() => navigate('/sales/orders/new')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">New SO</button>
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
                  <Field label="Customer Number" value={<span className="font-mono text-blue-600">{customer.customer_number}</span>} />
                  <Field label="Customer Name" value={customer.name} />
                  <Field label="Company Name" value={customer.company_name} />
                  <Field label="Type" value={<span className="capitalize">{customer.type}</span>} />
                </div>
                <div className="space-y-3">
                  <Field label="Email" value={customer.email} />
                  <Field label="Phone" value={customer.phone} />
                  <Field label="Mobile" value={customer.mobile} />
                </div>
                <div className="space-y-3">
                  <Field label="Tax ID (NPWP)" value={customer.tax_id} />
                  <Field label="Status" value={<span className="capitalize">{customer.status}</span>} />
                  <Field label="Subsidiary" value={customer.subsidiary_name} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Billing Address */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setAddressOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {addressOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Billing Address
          </button>
          {addressOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="col-span-3"><label className={lbl}>Street Address</label><div className={`${dis} whitespace-pre-line`}>{customer.billing_address || '-'}</div></div>
                <Field label="City" value={customer.billing_city} />
                <Field label="State / Province" value={customer.billing_state} />
                <Field label="Country" value={customer.billing_country} />
                <Field label="Postal Code" value={customer.billing_postal} />
              </div>
            </div>
          )}
        </div>

        {/* Financial Settings */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setFinancialOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {financialOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Financial Settings
          </button>
          {financialOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <Field label="Currency" value={customer.currency} />
                <Field label="Payment Terms" value={customer.payment_terms} />
                <Field label="Credit Limit" value={formatCurrency(customer.credit_limit || 0)} />
                <div className="col-span-3"><label className={lbl}>Notes</label><div className={`${dis} whitespace-pre-line`}>{customer.notes || '-'}</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Account Summary + System Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-white border border-slate-200 rounded shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">Account Summary</div>
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-xs text-slate-500">Total Billed</div><div className="text-sm font-semibold">{formatCurrency(customer.stats?.total_billed || 0)}</div></div>
              <div><div className="text-xs text-slate-500">Outstanding Balance</div><div className="text-sm font-semibold text-red-600">{formatCurrency(customer.stats?.total_outstanding || 0)}</div></div>
              <div><div className="text-xs text-slate-500">Total Invoices</div><div className="text-sm font-semibold">{customer.stats?.total_invoices || 0}</div></div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">System Info</div>
            <div className="space-y-2">
              <div><div className="text-xs text-slate-500">Created</div><div className="text-sm">{formatDate(customer.created_at)}</div></div>
              <div><div className="text-xs text-slate-500">Last Updated</div><div className="text-sm">{formatDate(customer.updated_at)}</div></div>
            </div>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setActivityOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <span className="flex items-center gap-2">{activityOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Recent Invoices</span>
            <Link to={`/sales/invoices?customerId=${id}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline font-normal">View all</Link>
          </button>
          {activityOpen && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Invoice #</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Due Date</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Balance</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(txData?.invoices || []).slice(0, 10).map((inv: any) => (
                    <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/invoices/${inv.id}`)}>
                      <td className="px-3 py-2"><TransactionLink number={inv.invoice_number} id={inv.id} /></td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(inv.invoice_date)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${parseFloat(inv.amount_due) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(inv.amount_due)}</td>
                      <td className="px-3 py-2"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                  {(!txData?.invoices || txData.invoices.length === 0) && (
                    <tr><td colSpan={6} className="text-center py-4 text-slate-400 text-sm">No invoices</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
