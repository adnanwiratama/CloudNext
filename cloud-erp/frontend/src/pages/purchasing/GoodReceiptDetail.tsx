import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Package, FileText, CheckCircle2, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatDate, formatNumber, formatCurrency, formatStatus } from '../../utils/format';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import toast from 'react-hot-toast';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';

export default function GoodReceiptDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['good-receipt', id] }); }, [justSaved, id, qc]);

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['good-receipt', id],
    queryFn: () => api.get(`/api/purchasing/receipts/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const { print } = usePrintDocument();

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!receipt) return <div className="p-6 text-red-600">Good receipt not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';
  const totalValue = (receipt.lines||[]).reduce((s:number,l:any)=>{
    const recvQty = parseFloat(l.quantity)||0;
    const gross = recvQty*parseFloat(l.unit_cost||0);
    const poQty = parseFloat(l.po_qty||0);
    const poDisc = parseFloat(l.po_discount||0);
    const lineDisc = (poDisc>0 && poQty>0) ? Math.round((poDisc*(recvQty/poQty))*100)/100 : 0;
    return s + (gross - lineDisc);
  }, 0);

  const handlePrint = () => {
    if (!receipt) return;
    print({
      title: 'Goods Receipt',
      number: receipt.receipt_number,
      status: formatStatus(receipt.status),
      partyLabel: 'Vendor',
      partyName: receipt.vendor_name,
      meta: [
        { label: 'PO Number', value: receipt.po_number || '-' },
        { label: 'Receipt Date', value: formatDate(receipt.receipt_date) },
        { label: 'Location', value: receipt.location_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty Received', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || '' },
      ],
      rows: receipt.lines || [],
      memo: receipt.memo,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white"><Package size={15}/></div>
              <span className="text-2xl font-bold text-slate-800">Item Receipt</span>
              <span className="text-2xl font-semibold text-slate-500">{receipt.receipt_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/receipts')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=item_receipt')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/purchasing/receipts')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          {!(receipt.bills_count > 0) && (
            <EditTransactionButton permKey="item_receipt" to={`/purchasing/receipts/${id}/edit`} />
          )}
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          <button onClick={() => navigate(`/purchasing/orders/${receipt.po_id}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">View PO</button>
          {!['fully_billed','closed'].includes(receipt.po_status) && (
            <button onClick={() => navigate(`/purchasing/bills/new?poId=${receipt.po_id}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800">
              <FileText size={13}/> Create Bill
            </button>
          )}
          <DeleteTransactionButton type="item_receipt" id={id!} listPath="/purchasing/receipts" label={receipt.receipt_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Good Receipt successfully saved</p></div></div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500 mb-0.5">Receipt Number</div><div className="text-sm font-medium text-blue-700 font-mono">{receipt.receipt_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">PO Number</label><div className="text-sm text-blue-600 cursor-pointer hover:underline" onClick={()=>navigate(`/purchasing/orders/${receipt.po_id}`)}>{receipt.po_number}</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={receipt.vendor_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Receipt Date</label><input readOnly value={receipt.receipt_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={receipt.location_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={receipt.department_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Inventory Value</label><input readOnly value={totalValue.toLocaleString('id-ID',{minimumFractionDigits:2})} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><input readOnly value={receipt.status?.replace(/_/g,' ')||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={receipt.memo||''} className={dis}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={receipt.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={receipt.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={receipt.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="border-b border-slate-200 px-4 flex">
            {(['items','files','gl','sysinfo'] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='items'?'Received Items':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='items' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Item Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Item Name</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Qty Received</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-14">UOM</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Discount</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total Value</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(receipt.lines||[]).length===0?<tr><td colSpan={10} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                    :(receipt.lines||[]).map((l:any,i:number)=>{
                      const recvQty = parseFloat(l.quantity)||0;
                      const gross = recvQty * parseFloat(l.unit_cost||0);
                      const poQty = parseFloat(l.po_qty||0);
                      const poDisc = parseFloat(l.po_discount||0);
                      const lineDisc = (poDisc>0 && poQty>0) ? Math.round((poDisc*(recvQty/poQty))*100)/100 : 0;
                      return (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{l.item_code}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-700">{l.item_name}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{formatNumber(l.quantity,0)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.uom_code||'-'}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_cost)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{lineDisc>0?formatCurrency(lineDisc):'-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(gross - lineDisc)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="item_receipt" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-teal-50 border border-teal-100 rounded p-3 text-teal-800">
                  <p className="font-medium mb-1">GL Impact (Goods Receipt):</p>
                  <p><strong>Dr. Inventory Account → Cr. Accrued AP / GR-IR (2110)</strong></p>
                  <p className="mt-1 text-teal-600">Will be cleared when Vendor Bill is created: Dr. Accrued AP → Cr. Accounts Payable</p>
                </div>
                {(receipt.journalEntries||[]).length > 0 ? (
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
                        {(receipt.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
                          <tr key={`${je.id}-${i}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5"><button onClick={()=>navigate(`/accounting/journals/${je.id}`)} className="text-blue-600 hover:underline font-mono text-xs">{je.journal_number}</button></td>
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
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries yet — may still be pending</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/purchasing/receipts/${id}/audit`} queryKey={['receipt-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
