import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, CheckCircle, AlertCircle, FileText, Printer } from 'lucide-react';
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

export default function VendorBillDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'related'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['vendor-bill', id] }); }, [justSaved, id, qc]);

  const { data: bill, isLoading } = useQuery({
    queryKey: ['vendor-bill', id],
    queryFn: () => api.get(`/api/purchasing/bills/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!bill) return <div className="p-6 text-red-600">Vendor bill not found.</div>;

  const isOverdue = bill.status !== 'paid' && bill.status !== 'voided' && new Date(bill.due_date) < new Date();
  const daysOverdue = Math.floor((new Date().getTime() - new Date(bill.due_date).getTime()) / (1000 * 60 * 60 * 24));
  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  const handlePrint = () => {
    if (!bill) return;
    print({
      title: 'Vendor Bill',
      number: bill.bill_number,
      status: formatStatus(bill.status),
      partyLabel: 'Vendor',
      partyName: bill.vendor_name,
      partyLines: [bill.vendor_address, bill.vendor_email].filter(Boolean),
      meta: [
        { label: 'Vendor Invoice #', value: bill.vendor_bill_number || bill.vendor_invoice_number || '-' },
        { label: 'PO Reference', value: bill.po_number || '-' },
        { label: 'Bill Date', value: formatDate(bill.bill_date) },
        { label: 'Due Date', value: bill.due_date ? formatDate(bill.due_date) : '-' },
        { label: 'Payment Terms', value: bill.payment_terms || '-' },
        { label: 'Currency', value: bill.currency || '-' },
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
      rows: bill.lines || [],
      totals: [
        { label: 'Subtotal', value: formatCurrency(bill.subtotal) },
        { label: 'Discount', value: formatCurrency(bill.discount_amount) },
        { label: 'Tax', value: formatCurrency(bill.tax_amount) },
        { label: 'Total', value: formatCurrency(bill.total_amount), bold: true },
        ...(bill.amount_paid != null ? [{ label: 'Amount Paid', value: formatCurrency(bill.amount_paid) }] : []),
        ...(bill.amount_due != null ? [{ label: 'Amount Due', value: formatCurrency(bill.amount_due) }] : []),
      ],
      memo: bill.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Vendor Bill</span>
              <span className="text-2xl font-semibold text-slate-500">{bill.bill_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/bills')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_bill')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/purchasing/bills')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {parseFloat(bill.amount_paid || 0) <= 0 && (
            <EditTransactionButton permKey="vendor_bill" to={`/purchasing/bills/${id}/edit`} />
          )}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {bill.po_number && <button onClick={() => navigate(`/purchasing/orders/${bill.po_id}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">View PO: {bill.po_number}</button>}
          <button onClick={() => navigate(`/purchasing/vendor-returns/new?billId=${id}`)}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">
            ↩ Vendor Return
          </button>
          {!['paid','voided'].includes(bill.status) && parseFloat(bill.amount_due)>0 && (
            <button onClick={() => navigate(`/purchasing/payments/new?vendorId=${bill.vendor_id}&billId=${id}&amount=${bill.amount_due}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">
              💳 Create Payment
            </button>
          )}
          <DeleteTransactionButton type="vendor_bill" id={id!} listPath="/purchasing/bills" label={bill.bill_number} />
          <ApprovalBar
            recordType="vendor_bills"
            approvalStatus={bill?.approval_status}
            approvedByName={bill?.approved_by_name}
            approvedAt={bill?.approved_at}
            configuredApproverId={bill?.configured_approver_id}
            configuredApproverName={bill?.configured_approver_name}
            submitUrl={`/api/purchasing/bills/${id}/submit`}
            approveUrl={`/api/purchasing/bills/${id}/approve`}
            rejectUrl={`/api/purchasing/bills/${id}/reject`}
            queryKeys={['vendor-bill', id]}
          />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700 mt-0.5">Vendor Bill successfully saved</p></div></div>}
        {isOverdue && <div className="bg-red-50 border border-red-200 rounded px-4 py-3 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16}/><span className="font-medium">Overdue {daysOverdue} days</span><span className="text-red-600">— Due {formatDate(bill.due_date)}</span></div>}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Bill Number</div><div className="text-sm font-medium text-blue-700 font-mono">{bill.bill_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={bill.vendor_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor Invoice #</label><input readOnly value={bill.vendor_bill_number||bill.vendor_invoice_number||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">PO Reference</label><input readOnly value={bill.po_number||'-'} className={`${dis} ${bill.po_number?'text-blue-700 font-mono':''}`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Bill Date</label><input readOnly value={bill.bill_date?.split('T')[0]||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Due Date</label><input readOnly value={bill.due_date?.split('T')[0]||''} className={`${dis} ${isOverdue?'text-red-600 border-red-300':''}`}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Total Amount</label><input readOnly value={Number(bill.total_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Amount Paid</label><input readOnly value={Number(bill.amount_paid||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Balance Due</label><input readOnly value={Number(bill.amount_due||0).toLocaleString('id-ID',{minimumFractionDigits:2})} className={`${dis} ${parseFloat(bill.amount_due)>0?'text-red-600 font-medium':''}`}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label><input readOnly value={bill.payment_terms||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Currency</label><input readOnly value={bill.currency||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">GL Posted</label><input readOnly value={bill.is_posted?'Yes':'Pending'} className={`${dis} ${bill.is_posted?'text-green-700':''}`}/></div>
                </div>
                <div className="space-y-3">
                  {/* Summary box (fixed top-right, always last in column) */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                    <div className="text-sm">
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Subtotal</span><span>{Number(bill.subtotal||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Discount</span><span className="text-amber-600">{Number(bill.discount_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between px-3 py-1.5 border-b border-slate-100"><span className="text-slate-600">Tax</span><span>{Number(bill.tax_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total</span><span>{Number(bill.total_amount||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={bill.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={bill.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={bill.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items','related','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Items':tab==='related'?'Related Records':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
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
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">UOM</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc %</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Disc Amt</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Disc Account</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Expense Acct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bill.lines||[]).length===0?<tr><td colSpan={14} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                      :(bill.lines||[]).map((l:any,i:number)=>(
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-400">{l.line_number||i+1}</td>
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(l.quantity,2)}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.uom_code||l.uom_name||'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{Number(l.discount_percent)>0?`${l.discount_percent}%`:'-'}</td>
                          <td className="px-3 py-1.5 text-right text-amber-600">{Number(l.discount_amount)>0?Number(l.discount_amount).toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{Number(l.discount_amount)>0?(l.discount_account_code||'-'):'-'}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(l.tax_amount)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(l.amount)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{l.expense_account_code?`${l.expense_account_code} ${l.expense_account_name}`:'-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {activeTab==='related' && (
              (bill.payments||[]).length === 0
                ? <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No related records yet</div>
                : (
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Document #</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.payments.map((p:any) => (
                          <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5">{formatDate(p.payment_date)}</td>
                            <td className="px-3 py-1.5 text-slate-700">Bill Payment</td>
                            <td className="px-3 py-1.5"><TransactionLink number={p.payment_number} id={p.payment_id}/></td>
                            <td className="px-3 py-1.5 text-right font-medium text-emerald-600">{formatCurrency(p.applied_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="vendor_bill" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-blue-50 border border-blue-100 rounded p-3 text-blue-800">
                  <p className="font-medium mb-1">GL Impact (Vendor Bill):</p>
                  <p><strong>Dr. Accrued AP/GR-IR (2110) → Cr. Accounts Payable (2100)</strong></p>
                  <p className="mt-1 text-blue-600">Clears the GR-IR accrual and records the AP liability</p>
                </div>
                {(bill.journalEntries||[]).length > 0 ? (
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
                        {(bill.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button>{je.status === 'non_posting' && <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">Non-Posting</span>}</td>
                            <td className="px-3 py-1.5 font-mono">{l.account_code}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.account_name}</td>
                            <td className="px-3 py-1.5 text-right text-blue-700 font-medium">{parseFloat(l.debit||0)>0?Number(l.debit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-700 font-medium">{parseFloat(l.credit||0)>0?Number(l.credit).toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
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
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/purchasing/bills/${id}/audit`} queryKey={['bill-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
