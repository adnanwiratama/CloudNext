import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function CustomerForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', companyName: '', type: 'company', email: '', phone: '', mobile: '',
    taxId: '', billingAddress: '', billingCity: '', billingState: '', billingCountry: 'Indonesia', billingPostal: '',
    currency: 'IDR', paymentTerms: 'Net30', creditLimit: 0, notes: '', status: 'active',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/customers', data),
    onSuccess: (res) => { toast.success('Customer created'); navigate(`/customers/${res.data.data.id}`); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create customer'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Customer name is required'); return; }
    mutation.mutate(form);
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Customers', path: '/customers' }, { label: 'New Customer' }]}
        title="New Customer"
        actions={
          <>
            <button type="button" onClick={() => navigate('/customers')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="cust-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Customer
            </button>
          </>
        }
      />
      <form id="cust-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Basic Information</div>
          <div className="form-grid-3">
            <div className="col-span-2">
              <label className="erp-label">Customer Name *</label>
              <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name or company name" required />
            </div>
            <div>
              <label className="erp-label">Type</label>
              <select className="erp-select" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <div>
              <label className="erp-label">Company Name</label>
              <input type="text" className="erp-input" value={form.companyName} onChange={e => set('companyName', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Email</label>
              <input type="email" className="erp-input" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Phone</label>
              <input type="text" className="erp-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Mobile</label>
              <input type="text" className="erp-input" value={form.mobile} onChange={e => set('mobile', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Tax ID (NPWP)</label>
              <input type="text" className="erp-input" value={form.taxId} onChange={e => set('taxId', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Status</label>
              <select className="erp-select" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title">Billing Address</div>
          <div className="form-grid-3">
            <div className="col-span-3">
              <label className="erp-label">Street Address</label>
              <textarea className="erp-textarea" rows={2} value={form.billingAddress} onChange={e => set('billingAddress', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">City</label>
              <input type="text" className="erp-input" value={form.billingCity} onChange={e => set('billingCity', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">State / Province</label>
              <input type="text" className="erp-input" value={form.billingState} onChange={e => set('billingState', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Country</label>
              <input type="text" className="erp-input" value={form.billingCountry} onChange={e => set('billingCountry', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Postal Code</label>
              <input type="text" className="erp-input" value={form.billingPostal} onChange={e => set('billingPostal', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title">Financial Settings</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Currency</label>
              <select className="erp-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {['IDR', 'USD', 'EUR', 'SGD', 'MYR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Payment Terms</label>
              <select className="erp-select" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                {['Net7', 'Net14', 'Net30', 'Net45', 'Net60', 'COD', 'CIA'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Credit Limit</label>
              <input type="number" min="0" step="1000" className="erp-input" value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)} />
            </div>
            <div className="col-span-3">
              <label className="erp-label">Notes</label>
              <textarea className="erp-textarea" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this customer..." />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
