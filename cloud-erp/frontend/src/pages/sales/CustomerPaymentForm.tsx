import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

export default function CustomerPaymentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { customers, accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || a.subtype === 'bank' || a.subtype === 'cash' || ['1010','1020','1025'].includes(a.code));
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const preCustomerId = searchParams.get('customerId') || '';
  const preInvoiceId  = searchParams.get('invoiceId')  || '';
  const preAmount     = parseFloat(searchParams.get('amount') || '0');

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'invoices'|'files'>('invoices');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    customerId: preCustomerId, paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer', reference: '', currency: 'IDR',
    amount: preAmount, bankAccountId: '', locationId: '', departmentId: '', subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [applications, setApplications] = useState<{ invoiceId: string; amount: number }[]>(
    preInvoiceId && preAmount > 0 ? [{ invoiceId: preInvoiceId, amount: preAmount }] : []
  );
  const [creditApps, setCreditApps] = useState<{ creditType: 'customer_deposit'|'customer_payment'; creditId: string; amount: number }[]>([]);

  // Open invoices for the customer
  const { data: openInvoices = [] } = useQuery({
    queryKey: ['open-invoices', form.customerId],
    queryFn: () => api.get('/api/sales/invoices', { params: { customerId: form.customerId, limit: 100 } })
      .then(r => (r.data.data || []).filter((inv: any) =>
        ['open', 'partially_paid'].includes(inv.status) || applications.some(a => a.invoiceId === inv.id))),
    enabled: !!form.customerId,
  });

  // Available customer credits (deposits + unapplied payments)
  const { data: customerCredits = { deposits: [], payments: [] } } = useQuery({
    queryKey: ['customer-credits', form.customerId, id],
    queryFn: () => api.get('/api/sales/customer-credits', { params: { customerId: form.customerId, excludePaymentId: isEdit ? id : undefined } })
      .then(r => r.data.data || { deposits: [], payments: [] }),
    enabled: !!form.customerId,
  });
  const depositCredits: any[] = customerCredits.deposits || [];
  const paymentCredits: any[] = customerCredits.payments || [];

  // EDIT MODE: load existing payment
  const { data: existingPayment } = useQuery({
    queryKey: ['customer-payment-edit', id],
    queryFn: () => api.get(`/api/sales/payments/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  useEffect(() => {
    if (!isEdit || !existingPayment || paymentLoaded) return;
    setForm(f => ({
      ...f,
      customerId: existingPayment.customer_id || '', paymentDate: existingPayment.payment_date?.split('T')[0] || f.paymentDate,
      paymentMethod: existingPayment.payment_method || f.paymentMethod, reference: existingPayment.reference || '',
      currency: existingPayment.currency || f.currency, amount: parseFloat(existingPayment.amount) || 0,
      bankAccountId: existingPayment.bank_account_id || '', locationId: existingPayment.location_id || '',
      departmentId: existingPayment.department_id || '', subsidiaryId: existingPayment.subsidiary_id || '',
      memo: existingPayment.memo || '',
    }));
    setApplications((existingPayment.applications || []).map((a: any) => ({ invoiceId: a.invoice_id, amount: parseFloat(a.applied_amount) || 0 })));
    setCreditApps((existingPayment.creditApplications || []).map((c: any) => ({ creditType: c.credit_type, creditId: c.credit_id, amount: parseFloat(c.applied_amount) || 0 })));
    setPaymentLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPayment, isEdit, paymentLoaded]);

  const selectedBank = accounts.find((a: any) => a.id === form.bankAccountId);
  const bankBalance = selectedBank ? Number(selectedBank.net_balance || 0) : null;

  const totalApplied = applications.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalCredits = creditApps.reduce((s, c) => s + Number(c.amount || 0), 0);
  const settlementPower = Number(form.amount) + totalCredits;
  const unapplied = settlementPower - totalApplied;
  const netBankCash = Number(form.amount);

  const addApplication = (invoiceId: string, amountDue: number) => {
    if (applications.find(a => a.invoiceId === invoiceId)) return;
    const remaining = settlementPower - totalApplied;
    setApplications(prev => [...prev, { invoiceId, amount: Math.min(amountDue, remaining > 0 ? remaining : amountDue) }]);
  };

  const creditNeed = (excludeCreditId?: string): number => {
    const otherCredits = creditApps.reduce((s, c) => s + (c.creditId === excludeCreditId ? 0 : Number(c.amount || 0)), 0);
    return Math.max(0, totalApplied - Number(form.amount) - otherCredits);
  };
  const addCredit = (creditType: 'customer_deposit'|'customer_payment', creditId: string, remaining: number) => {
    if (creditApps.find(c => c.creditId === creditId)) return;
    const capped = Math.min(Number(remaining), creditNeed());
    setCreditApps(prev => [...prev, { creditType, creditId, amount: capped }]);
  };
  const setCreditAmount = (creditId: string, value: number, available: number) => {
    const capped = Math.min(Number(value), Number(available), creditNeed(creditId));
    setCreditApps(prev => prev.map(c => c.creditId === creditId ? { ...c, amount: Math.max(0, capped) } : c));
  };
  const removeCredit = (creditId: string) => setCreditApps(prev => prev.filter(c => c.creditId !== creditId));

  // Auto-clamp credits so total settlement never exceeds invoices applied (skip until edit loads)
  useEffect(() => {
    if (isEdit && !paymentLoaded) return;
    const cash = Number(form.amount) || 0;
    let allowed = Math.max(0, totalApplied - cash);
    let changed = false;
    const next = creditApps.map(c => {
      const allow = Math.min(Number(c.amount || 0), Math.max(0, allowed));
      allowed -= allow;
      if (Math.abs(allow - Number(c.amount || 0)) > 0.009) changed = true;
      return { ...c, amount: allow };
    });
    if (changed) setCreditApps(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalApplied, form.amount]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/sales/payments', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'customer_payment', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(`Payment ${res.data.data.payment_number || ''} posted`);
      navigate(`/sales/payments/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record payment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    if (Number(form.amount) > 0 && !form.bankAccountId) { toast.error('Bank/Cash account is required'); return; }
    if (unapplied < -0.009) { toast.error('Harus isi Amount'); return; }
    if (Number(form.amount) <= 0 && totalCredits <= 0 && totalApplied <= 0) { toast.error('Harus isi Amount'); return; }
    mutation.mutate({
      ...form, amount: Number(form.amount),
      locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null,
      applications: applications.map(a => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })),
      creditApplications: creditApps.map(c => ({ creditType: c.creditType, creditId: c.creditId, amount: Number(c.amount) })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">$</div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Customer Payment' : 'Customer Payment'}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/payments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=customer_payment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="cpay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="cpay-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e=>{set('customerId',e.target.value);setApplications([]);setCreditApps([]);}} className={dis} required>
                        <option value="">-- Select Customer --</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                      <select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} className={dis}>
                        <option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="check">Check / Giro</option><option value="credit_card">Credit Card</option>
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Amount</label>
                      <NumberInput value={form.amount} min={0} onChange={v=>set('amount',v)} className={`${dis} text-right font-medium`}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Deposit To (Bank Account)</label>
                      <select value={form.bankAccountId} onChange={e=>set('bankAccountId',e.target.value)} className={dis}>
                        <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                      {selectedBank && (
                        <div className="mt-1 text-xs flex items-center justify-between px-1">
                          <span className="text-slate-500">Available Balance</span>
                          <span className={`font-semibold ${(bankBalance ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(bankBalance ?? 0)}</span>
                        </div>
                      )}
                    </div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference / Cheque No.</label>
                      <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer ref, cheque no"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e=>set('currency',e.target.value)} className={dis}>
                        <option value="IDR">IDR</option><option value="USD">USD</option><option value="EUR">EUR</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <input value={form.memo} onChange={e=>set('memo',e.target.value)} className={dis}/></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={dis}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}><option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                </div>
              </div>
            )}
          </div>

          {/* Apply to Invoices + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['invoices','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='invoices'?'Apply to Invoices':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='invoices' && (
                <div>
                  <div className="flex items-center gap-6 text-sm mb-3 px-1 flex-wrap">
                    <span>Cash Amount: <strong>{netBankCash.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span>Credits: <strong className="text-violet-600">{totalCredits.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span>Settlement Power: <strong>{settlementPower.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span>Applied to Invoices: <strong className="text-blue-600">{totalApplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span className={unapplied < 0 ? 'text-red-600' : 'text-slate-600'}>Unapplied: <strong>{unapplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                  </div>
                  {form.customerId && openInvoices.length > 0 ? (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Invoice #</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Reff No</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Invoice Date</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Due Date</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600">Orig. Amt.</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600">Balance Due</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Apply Amount</th>
                            <th className="px-3 py-2 w-20"/>
                          </tr>
                        </thead>
                        <tbody>
                          {openInvoices.map((inv: any) => {
                            const app = applications.find(a => a.invoiceId === inv.id);
                            return (
                              <tr key={inv.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{inv.invoice_number}</td>
                                <td className="px-3 py-1.5 text-slate-600">{inv.reference || inv.so_number || '-'}</td>
                                <td className="px-3 py-1.5">{formatDate(inv.invoice_date)}</td>
                                <td className="px-3 py-1.5">{formatDate(inv.due_date)}</td>
                                <td className="px-3 py-1.5 text-right text-slate-600">{formatCurrency(inv.total_amount)}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-emerald-600">{formatCurrency(inv.amount_due)}</td>
                                <td className="px-1.5 py-1 text-right">
                                  {app ? (
                                    <NumberInput value={app.amount} min={0}
                                      onChange={v=>setApplications(prev=>prev.map(a=>a.invoiceId===inv.id?{...a,amount:Math.min(v,parseFloat(inv.amount_due))}:a))}
                                      className="w-32 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-1.5">
                                  {app
                                    ? <button type="button" onClick={()=>setApplications(prev=>prev.filter(a=>a.invoiceId!==inv.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                    : <button type="button" onClick={()=>addApplication(inv.id,parseFloat(inv.amount_due))} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><Plus size={11}/> Apply</button>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded">
                      {form.customerId ? 'No open invoices for this customer.' : 'Select a customer to see open invoices.'}
                    </div>
                  )}

                  {/* Apply Customer Credits (Deposits / Unapplied Payments) */}
                  {form.customerId && (depositCredits.length > 0 || paymentCredits.length > 0) && (
                    <div className="mt-5">
                      <div className="text-xs font-semibold text-violet-700 mb-1.5 flex items-center gap-1">
                        Apply Customer Credits
                        <span className="font-normal text-slate-400">(reduces cash received)</span>
                      </div>
                      <div className="border border-violet-200 rounded overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-violet-50 border-b border-violet-200">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-600">Document #</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-600">Available</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Apply Amount</th>
                              <th className="px-3 py-2 w-20"/>
                            </tr>
                          </thead>
                          <tbody>
                            {depositCredits.map((p: any) => {
                              const c = creditApps.find(x => x.creditId === p.id);
                              return (
                                <tr key={p.id} className="border-t border-slate-100">
                                  <td className="px-3 py-1.5"><span className="inline-flex px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-2xs font-medium">Deposit</span></td>
                                  <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{p.deposit_number}</td>
                                  <td className="px-3 py-1.5">{formatDate(p.deposit_date)}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-violet-600">{formatCurrency(p.remaining)}</td>
                                  <td className="px-1.5 py-1 text-right">
                                    {c ? (
                                      <NumberInput value={c.amount} min={0}
                                        onChange={v=>setCreditAmount(p.id, v, Number(p.remaining))}
                                        className="w-32 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {c
                                      ? <button type="button" onClick={()=>removeCredit(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                      : <button type="button" onClick={()=>addCredit('customer_deposit', p.id, Number(p.remaining))} className="text-xs text-violet-600 hover:underline flex items-center gap-0.5"><Plus size={11}/> Apply</button>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                            {paymentCredits.map((p: any) => {
                              const c = creditApps.find(x => x.creditId === p.id);
                              return (
                                <tr key={p.id} className="border-t border-slate-100">
                                  <td className="px-3 py-1.5"><span className="inline-flex px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-2xs font-medium">Payment Credit</span></td>
                                  <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{p.payment_number}</td>
                                  <td className="px-3 py-1.5">{formatDate(p.payment_date)}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-violet-600">{formatCurrency(p.unapplied_amount)}</td>
                                  <td className="px-1.5 py-1 text-right">
                                    {c ? (
                                      <NumberInput value={c.amount} min={0}
                                        onChange={v=>setCreditAmount(p.id, v, Number(p.unapplied_amount))}
                                        className="w-32 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {c
                                      ? <button type="button" onClick={()=>removeCredit(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                      : <button type="button" onClick={()=>addCredit('customer_payment', p.id, Number(p.unapplied_amount))} className="text-xs text-violet-600 hover:underline flex items-center gap-0.5"><Plus size={11}/> Apply</button>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {totalCredits > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Net cash to bank: <strong className="text-emerald-600">{formatCurrency(netBankCash)}</strong>
                          {' '}· Credits applied: <strong className="text-violet-600">{formatCurrency(totalCredits)}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 rounded border border-emerald-200 bg-emerald-50/30 p-3 text-xs text-emerald-800">
                    <strong>GL Impact:</strong> Dr. Bank/Cash {totalCredits>0 ? '+ Dr. Customer Deposit (2210) ' : ''}→ Cr. Accounts Receivable
                  </div>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="cpay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
