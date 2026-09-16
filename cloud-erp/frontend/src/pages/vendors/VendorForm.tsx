import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function VendorForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', companyName: '', type: 'company', email: '', phone: '',
    taxId: '', address: '', city: '', state: '', country: 'Indonesia', postal: '',
    currency: 'IDR', paymentTerms: 'Net30', creditLimit: 0, notes: '', status: 'active',
    bankName: '', bankAccountNumber: '', bankAccountName: '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/vendors', data),
    onSuccess: (res) => { toast.success('Vendor created'); navigate(`/vendors/${res.data.data.id}`); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create vendor'),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Vendors', path: '/vendors' }, { label: 'New Vendor' }]}
        title="New Vendor"
        actions={
          <>
            <button type="button" onClick={() => navigate('/vendors')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Cancel</button>
            <button type="submit" form="vendor-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Vendor
            </button>
          </>
        }
      />
      <form id="vendor-form" onSubmit={e => { e.preventDefault(); if (!form.name) { toast.error('Vendor name is required'); return; } mutation.mutate(form); }} className="space-y-4">
        <div className="erp-card">
          <div className="form-section-title">Basic Information</div>
          <div className="form-grid-3">
            <div className="col-span-2">
              <label className="erp-label">Vendor Name *</label>
              <input type="text" className="erp-input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Type</label>
              <select className="erp-select" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
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
              <label className="erp-label">Tax ID (NPWP)</label>
              <input type="text" className="erp-input" value={form.taxId} onChange={e => set('taxId', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title">Address</div>
          <div className="form-grid-3">
            <div className="col-span-3">
              <label className="erp-label">Street Address</label>
              <textarea className="erp-textarea" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">City</label>
              <input type="text" className="erp-input" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">State</label>
              <input type="text" className="erp-input" value={form.state} onChange={e => set('state', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Country</label>
              <input type="text" className="erp-input" value={form.country} onChange={e => set('country', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="form-section-title">Financial & Bank Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Currency</label>
              <select className="erp-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {['IDR', 'USD', 'EUR', 'SGD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Payment Terms</label>
              <select className="erp-select" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                {['Net7', 'Net14', 'Net30', 'Net45', 'Net60', 'COD'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Status</label>
              <select className="erp-select" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div>
              <label className="erp-label">Bank Name</label>
              <input type="text" className="erp-input" value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="e.g. BCA, Mandiri" />
            </div>
            <div>
              <label className="erp-label">Bank Account Number</label>
              <input type="text" className="erp-input" value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value)} />
            </div>
            <div>
              <label className="erp-label">Account Holder Name</label>
              <input type="text" className="erp-input" value={form.bankAccountName} onChange={e => set('bankAccountName', e.target.value)} />
            </div>
            <div className="col-span-3">
              <label className="erp-label">Notes</label>
              <textarea className="erp-textarea" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
