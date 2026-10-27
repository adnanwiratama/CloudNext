import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, DollarSign, Printer, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate, formatNumber, formatStatus } from '../../utils/format';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import ApprovalBar from '../../components/transaction/ApprovalBar';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['invoice', id] }); }, [justSaved, id, qc]);

  const { data: inv, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/api/sales/invoices/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!inv) return;
    print({
      title: 'Invoice',
      number: inv.invoice_number,
      status: formatStatus(inv.status),
      partyLabel: 'Customer',
      partyName: inv.customer_name,
      partyLines: [inv.billing_address, inv.customer_email].filter(Boolean),
      meta: [
        { label: 'Invoice Date', value: formatDate(inv.invoice_date) },
        { label: 'Due Date', value: inv.due_date ? formatDate(inv.due_date) : '-' },
        { label: 'Payment Terms', value: inv.payment_terms || '-' },
        { label: 'Currency', value: inv.currency || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || r.uom_name || '' },
        { label: 'Unit Price', align: 'right', value: (r: any) => formatCurrency(r.unit_price) },
        { label: 'Tax', align: 'right', value: (r: any) => (Number(r.tax_amount) > 0 ? formatCurrency(r.tax_amount) : '-') },
        { label: 'Amount', align: 'right', value: (r: any) => formatCurrency(r.amount) },
      ],
      rows: inv.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(inv.subtotal) },
        { label: 'Tax', value: formatCurrency(inv.tax_amount || (inv.lines || []).reduce((s: number, l: any) => s + Number(l.tax_amount || 0), 0)) },
        { label: 'Total', value: formatCurrency(inv.total_amount), bold: true },
        ...(inv.amount_paid != null ? [{ label: 'Amount Paid', value: formatCurrency(inv.amount_paid) }] : []),
        ...(inv.amount_due != null ? [{ label: 'Amount Due', value: formatCurrency(inv.amount_due) }] : []),
      ],
      memo: inv.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!inv) return <div className="p-6 text-red-600">Invoice not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const totalTax = (inv.lines||[]).reduce((s:number,l:any)=>s+Number(l.tax_amount||0),0);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Invoice</span>
              <span className="text-2xl font-semibold text-slate-500">{inv.invoice_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/invoices')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=invoice')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/sales/invoices')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="invoice" to={`/sales/invoices/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {!['paid','voided'].includes(inv.status) && parseFloat(inv.amount_due)>0 && (
            <button onClick={() => navigate(`/sales/payments/new?customerId=${inv.customer_id}&invoiceId=${id}&amount=${inv.amount_due}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">
              <DollarSign size={13}/> Create Payment
            </button>
          )}
          <DeleteTransactionButton type="invoice" id={id!} listPath="/sales/invoices" label={inv.invoice_number} />
          <ApprovalBar
            recordType="invoices"
            approvalStatus={inv?.approval_status}
            approvedByName={inv?.approved_by_name}
            approvedAt={inv?.approved_at}
            configuredApproverId={inv?.configured_approver_id}
            configuredApproverName={inv?.configured_approver_name}
            submitUrl={`/api/sales/invoices/${id}/submit`}
            approveUrl={`/api/sales/invoices/${id}/approve`}
            rejectUrl={`/api/sales/invoices/${id}/reject`}
            queryKeys={['invoice', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Invoice successfully saved</p></div>
          </div>
        )}

        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                {/* Column 1 */}
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Invoice Number</div><div className="text-sm font-medium text-blue-700 font-mono">{inv.invoice_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={inv.customer_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Invoice Date</label><input readOnly value={inv.invoice_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Due Date</label><input readOnly value={inv.due_date?.split('T')[0]||''} className={`${dis} ${new Date(inv.due_date)<new Date()&&inv.status!=='paid'?'text-red-600 border-red-300':''}`}/></div>
                </div>
                {/* Column 2 */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount Paid</label><input readOnly value={Number(inv.amount_paid||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Balance Due</label><input readOnly value={Number(inv.amount_due||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} ${parseFloat(inv.amount_due)>0?'text-red-600 font-medium':''}`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label><input readOnly value={inv.payment_terms||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={inv.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={inv.memo||''} className={dis}/></div>
                </div>
                {/* Column 3 — Summary */}
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{formatCurrency(inv.discount_amount)}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{formatCurrency(inv.tax_amount || totalTax)}</span></div>
                      {Number(inv.shipping_amount) > 0 && <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Shipping</span><span>{formatCurrency(inv.shipping_amount)}</span></div>}
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{formatCurrency(inv.total_amount)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={inv.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={inv.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={inv.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Items':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='items' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.lines||[]).length===0 ? <tr><td colSpan={11} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      : (inv.lines||[]).map((l:any,i:number)=>(
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-400">{l.line_number||i+1}</td>
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,2)}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.uom_code||l.uom_name||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.tax_code||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.tax_amount)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {(inv.lines||[]).length>0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={8} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(inv.total_amount)}</td>
                          <td colSpan={2}/>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {/* Payment history */}
                {inv.payments?.length>0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">Payment Applications</div>
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr><th className="px-3 py-2 text-left font-semibold">Payment #</th><th className="px-3 py-2 text-left font-semibold">Date</th><th className="px-3 py-2 text-right font-semibold">Applied</th></tr>
                        </thead>
                        <tbody>
                          {inv.payments.map((p:any)=>(
                            <tr key={p.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5"><TransactionLink number={p.payment_number} id={p.payment_id}/></td>
                              <td className="px-3 py-1.5">{formatDate(p.payment_date)}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(p.applied_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="invoice" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-blue-50 border border-blue-100 rounded p-3 text-blue-700">
                  <span className="font-medium text-blue-800">GL Impact: </span>
                  <strong>Dr. Accounts Receivable (1200) → Cr. Revenue per line item + Cr. Tax Payable (PPN)</strong>
                </div>
                {(inv.journalEntries||[]).length > 0 ? (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Journal #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Credit</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr></thead>
                      <tbody>
                        {(inv.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button>{je.status === 'non_posting' && <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">Non-Posting</span>}</td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries posted yet</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/sales/invoices/${id}/audit`} queryKey={['invoice-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
