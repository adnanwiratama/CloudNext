import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, User } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function CustomerForm() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  // Edit mode is reached either via /customers/:id/edit or /customers/new?edit=<id>.
  const editId = (routeId && routeId !== 'new') ? routeId : (searchParams.get('edit') || '');
  const isEdit = !!editId;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(true);

  const [form, setForm] = useState({
    name: '', companyName: '', type: 'company', email: '', phone: '', mobile: '',
    taxId: '', billingAddress: '', billingCity: '', billingState: '', billingCountry: 'Indonesia', billingPostal: '',
    currency: 'IDR', paymentTerms: 'Net30', creditLimit: 0, notes: '', status: 'active',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Load existing customer for edit and prefill the form with saved values.
  const { data: existing } = useQuery({
    queryKey: ['customer-edit', editId],
    queryFn: () => api.get(`/api/customers/${editId}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!existing || loaded) return;
    setForm({
      name: existing.name || '', companyName: existing.company_name || '', type: existing.type || 'company',
      email: existing.email || '', phone: existing.phone || '', mobile: existing.mobile || '',
      taxId: existing.tax_id || '', billingAddress: existing.billing_address || '', billingCity: existing.billing_city || '',
      billingState: existing.billing_state || '', billingCountry: existing.billing_country || 'Indonesia', billingPostal: existing.billing_postal || '',
      currency: existing.currency || 'IDR', paymentTerms: existing.payment_terms || 'Net30',
      creditLimit: Number(existing.credit_limit) || 0, notes: existing.notes || '', status: existing.status || 'active',
    });
    setLoaded(true);
  }, [existing, loaded]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/customers/${editId}`, data) : api.post('/api/customers', data),
    onSuccess: (res) => { toast.success(isEdit ? 'Customer updated' : 'Customer created'); navigate(`/customers/${res.data.data?.id || editId}`); },
    onError: (e: any) => toast.error(e.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} customer`),
  });

  const handleSave = () => {
    if (!form.name) { toast.error('Customer name is required'); return; }
    mutation.mutate(form);
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-sky-600 flex items-center justify-center text-white"><User size={15}/></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Customer' : 'Customer'}</span>
              {form.name && <span className="text-xl font-semibold text-slate-500">{form.name}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/customers')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/customers')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
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
                  <div><label className={lbl}>Customer Name <span className="text-red-500">*</span></label>
                    <input className={dis} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name or company name"/></div>
                  <div><label className={lbl}>Company Name</label>
                    <input className={dis} value={form.companyName} onChange={e => set('companyName', e.target.value)}/></div>
                  <div><label className={lbl}>Type</label>
                    <select className={sel} value={form.type} onChange={e => set('type', e.target.value)}>
                      <option value="company">Company</option>
                      <option value="individual">Individual</option>
                    </select></div>
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Email</label>
                    <input type="email" className={dis} value={form.email} onChange={e => set('email', e.target.value)}/></div>
                  <div><label className={lbl}>Phone</label>
                    <input className={dis} value={form.phone} onChange={e => set('phone', e.target.value)}/></div>
                  <div><label className={lbl}>Mobile</label>
                    <input className={dis} value={form.mobile} onChange={e => set('mobile', e.target.value)}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Tax ID (NPWP)</label>
                    <input className={dis} value={form.taxId} onChange={e => set('taxId', e.target.value)}/></div>
                  <div><label className={lbl}>Status</label>
                    <select className={sel} value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="on_hold">On Hold</option>
                    </select></div>
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
                <div className="col-span-3"><label className={lbl}>Street Address</label>
                  <textarea className={`${dis} resize-none`} rows={2} value={form.billingAddress} onChange={e => set('billingAddress', e.target.value)}/></div>
                <div><label className={lbl}>City</label>
                  <input className={dis} value={form.billingCity} onChange={e => set('billingCity', e.target.value)}/></div>
                <div><label className={lbl}>State / Province</label>
                  <input className={dis} value={form.billingState} onChange={e => set('billingState', e.target.value)}/></div>
                <div><label className={lbl}>Country</label>
                  <input className={dis} value={form.billingCountry} onChange={e => set('billingCountry', e.target.value)}/></div>
                <div><label className={lbl}>Postal Code</label>
                  <input className={dis} value={form.billingPostal} onChange={e => set('billingPostal', e.target.value)}/></div>
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
                <div><label className={lbl}>Currency</label>
                  <select className={sel} value={form.currency} onChange={e => set('currency', e.target.value)}>
                    {['IDR', 'USD', 'EUR', 'SGD', 'MYR'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className={lbl}>Payment Terms</label>
                  <select className={sel} value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                    {['Net7', 'Net14', 'Net30', 'Net45', 'Net60', 'COD', 'CIA'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><label className={lbl}>Credit Limit</label>
                  <input type="number" min="0" step="1000" className={dis} value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)}/></div>
                <div className="col-span-3"><label className={lbl}>Notes</label>
                  <textarea className={`${dis} resize-none`} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this customer..."/></div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/customers')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
