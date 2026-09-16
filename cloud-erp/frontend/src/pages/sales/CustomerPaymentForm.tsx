import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import CurrencyInput from '../../components/common/CurrencyInput';
import { useFormOptions } from '../../hooks/useFormOptions';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

export default function CustomerPaymentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customers, accounts } = useFormOptions();

  // Pre-fill from Invoice detail page
  const preCustomerId = searchParams.get('customerId') || '';
  const preInvoiceId  = searchParams.get('invoiceId')  || '';
  const preAmount     = parseFloat(searchParams.get('amount') || '0');

  const [form, setForm] = useState({
    customerId: preCustomerId,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer', reference: '', currency: 'IDR',
    amount: preAmount, bankAccountId: '', memo: '',
  });
  const [applications, setApplications] = useState<{ invoiceId: string; amount: number }[]>(
    preInvoiceId && preAmount > 0 ? [{ invoiceId: preInvoiceId, amount: preAmount }] : []
  );

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Load open invoices for selected customer
  const { data: openInvoices } = useQuery({
    queryKey: ['open-invoices', form.customerId],
    queryFn: () => api.get('/api/sales/invoices', {
      params: { customerId: form.customerId, status: 'open', limit: 100 }
    }).then(r => r.data.data || []),
    enabled: !!form.customerId,
  });

  const bankAccounts = accounts.filter((a: any) => a.is_bank || a.subtype === 'bank' || a.subtype === 'cash');
  const totalApplied = applications.reduce((s, a) => s + Number(a.amount || 0), 0);
  const unapplied = Number(form.amount) - totalApplied;

  const addApplication = (invoiceId: string, invoiceAmountDue: number) => {
    if (applications.find(a => a.invoiceId === invoiceId)) return;
    const remaining = Number(form.amount) - totalApplied;
    setApplications(prev => [...prev, { invoiceId, amount: Math.min(invoiceAmountDue, remaining) }]);
  };

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/sales/payments', data),
    onSuccess: () => {
      toast.success('Payment recorded and GL posted');
      navigate('/sales/invoices');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record payment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    if (!form.paymentDate) { toast.error('Payment Date is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.bankAccountId) { toast.error('Bank/Cash Account is required for GL posting'); return; }
    mutation.mutate({ ...form, amount: Number(form.amount), applications });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Sales', path: '/sales/invoices' }, { label: 'New Customer Payment' }]}
        title="Customer Payment"
        actions={
          <>
            <button type="button" onClick={() => navigate('/sales/invoices')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="pay-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Post Payment
            </button>
          </>
        }
      />
      <form id="pay-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Payment Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Customer *</label>
              <select className="erp-select" value={form.customerId} onChange={e => { set('customerId', e.target.value); setApplications([]); }} required>
                <option value="">-- Select Customer --</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Payment Date *</label>
              <input type="date" className="erp-input" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Payment Method</label>
              <select className="erp-select" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="credit_card">Credit Card</option>
                <option value="giro">Giro</option>
              </select>
            </div>
            <div>
              <label className="erp-label">Amount *</label>
              <input type="number" min="0" step="0.01" className="erp-input" value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Bank / Cash Account</label>
              <select className="erp-select" value={form.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}>
                <option value="">-- Select Account --</option>
                {bankAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Reference / Cheque No</label>
              <input type="text" className="erp-input" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="Transfer ref, cheque number" />
            </div>
            <div className="col-span-3">
              <label className="erp-label">Memo</label>
              <input type="text" className="erp-input" value={form.memo} onChange={e => set('memo', e.target.value)} />
            </div>
          </div>
        </div>

        {form.customerId && openInvoices && openInvoices.length > 0 && (
          <div className="erp-card">
            <div className="form-section-title">Apply to Open Invoices</div>
            <div className="p-4 mb-2 flex items-center gap-6 text-sm bg-slate-50 border-b border-slate-100">
              <span>Payment Amount: <strong>{formatCurrency(form.amount)}</strong></span>
              <span>Applied: <strong className="text-blue-600">{formatCurrency(totalApplied)}</strong></span>
              <span>Unapplied: <strong className={unapplied < 0 ? 'text-red-600' : 'text-slate-600'}>{formatCurrency(unapplied)}</strong></span>
            </div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th className="text-right">Balance Due</th>
                  <th className="text-right">Apply Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv: any) => {
                  const app = applications.find(a => a.invoiceId === inv.id);
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs text-blue-600">{inv.invoice_number}</td>
                      <td className="text-xs">{inv.invoice_date}</td>
                      <td className="text-xs">{inv.due_date}</td>
                      <td className="text-right font-medium">{formatCurrency(inv.amount_due)}</td>
                      <td className="text-right">
                        {app ? (
                          <input
                            type="number" min="0" step="0.01"
                            className="erp-input text-right text-xs w-32"
                            value={app.amount}
                            onChange={e => setApplications(prev => prev.map(a => a.invoiceId === inv.id ? { ...a, amount: Number(e.target.value) } : a))}
                          />
                        ) : '-'}
                      </td>
                      <td>
                        {app
                          ? <button type="button" onClick={() => setApplications(prev => prev.filter(a => a.invoiceId !== inv.id))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                          : <button type="button" onClick={() => addApplication(inv.id, inv.amount_due)} className="btn-secondary btn-sm"><Plus size={11} /> Apply</button>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="erp-card border-emerald-200 bg-emerald-50/30">
          <div className="p-4 flex items-start gap-3">
            <div className="text-emerald-600 mt-0.5">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm text-emerald-800">
              <p className="font-medium">GL Posting (Auto)</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                <strong>Dr. Bank/Cash Account → Cr. Accounts Receivable</strong><br />
                GL entry akan dibuat otomatis saat payment di-save.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
