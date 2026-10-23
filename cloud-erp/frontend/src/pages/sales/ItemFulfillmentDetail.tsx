import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, FileText, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatDate, formatNumber, formatCurrency, formatStatus } from '../../utils/format';
import { StatusBadge } from '../../components/common/DataTable';
import TransactionLink from '../../components/common/TransactionLink';
import TransactionFilesTab from '../../components/transaction/TransactionFilesTab';
import TransactionSysInfoTab from '../../components/transaction/TransactionSysInfoTab';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';

export default function ItemFulfillmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const justSaved = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'items'|'files'|'gl'|'sysinfo'>('items');

  useEffect(() => { if (justSaved && id) qc.invalidateQueries({ queryKey: ['fulfillment', id] }); }, [justSaved, id, qc]);

  const { data: ff, isLoading } = useQuery({
    queryKey: ['fulfillment', id],
    queryFn: () => api.get(`/api/sales/fulfillments/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  // Live per-location stock (Available / On Hand) for the fulfillment's location — mirrors the input form
  const [stockMap, setStockMap] = useState<Record<string, { onHand: number; available: number }>>({});
  const ffItemKey = (ff?.lines || []).map((l: any) => l.item_id).filter(Boolean).join(',');
  useEffect(() => {
    const ids = Array.from(new Set((ff?.lines || []).map((l: any) => l.item_id).filter(Boolean)));
    if (ids.length === 0) { setStockMap({}); return; }
    const params: any = { itemIds: ids.join(',') };
    if (ff?.location_id) params.locationId = ff.location_id;
    api.get('/api/sales/stock', { params })
      .then(r => setStockMap(r.data.data || {}))
      .catch(() => setStockMap({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ffItemKey, ff?.location_id]);

  const { print } = usePrintDocument();
  const handlePrint = () => {
    if (!ff) return;
    print({
      title: 'Item Fulfillment',
      number: ff.fulfillment_number,
      status: formatStatus(ff.status),
      partyLabel: 'Customer',
      partyName: ff.customer_name,
      partyLines: [ff.shipping_address].filter(Boolean),
      meta: [
        { label: 'Fulfillment Date', value: formatDate(ff.fulfillment_date) },
        { label: 'Sales Order', value: ff.so_number || '-' },
        { label: 'Carrier', value: ff.carrier || '-' },
        { label: 'Tracking #', value: ff.tracking_number || '-' },
        { label: 'Warehouse', value: ff.warehouse_name || '-' },
      ],
      columns: [
        { label: 'Item', value: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim() },
        { label: 'Description', value: (r: any) => r.description || '' },
        { label: 'Qty Fulfilled', align: 'right', value: (r: any) => formatNumber(r.quantity, 2) },
        { label: 'Unit', value: (r: any) => r.uom_code || '' },
      ],
      rows: ff.lines || [],
      memo: ff.memo,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!ff) return <div className="p-6 text-red-600">Fulfillment not found.</div>;

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white font-bold text-xs">FF</div>
              <span className="text-2xl font-bold text-slate-800">Item Fulfillment</span>
              <span className="text-2xl font-semibold text-slate-500">{ff.fulfillment_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/fulfillments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=item_fulfillment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => navigate('/sales/fulfillments')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50"><Printer size={13}/> Print</button>
          {ff.so_id && <button onClick={() => navigate(`/sales/orders/${ff.so_id}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">View SO</button>}
          {ff.status !== 'invoiced' && <button onClick={() => navigate(`/sales/invoices/new?soId=${ff.so_id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"><FileText size={13}/> Create Invoice</button>}
          <DeleteTransactionButton type="item_fulfillment" id={id!} listPath="/sales/fulfillments" label={ff.fulfillment_number} />
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {justSaved && <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5"/><div><p className="text-sm font-semibold text-green-800">Confirmation</p><p className="text-sm text-green-700">Item Fulfillment successfully saved</p></div></div>}

        {/* Primary */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                {/* Column 1 — mirrors the fulfillment form's left column */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Sales Order</label>
                    <div className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50">
                      <button onClick={()=>navigate(`/sales/orders/${ff.so_id}`)} className="text-blue-600 hover:underline font-mono">{ff.so_number||'-'}</button>
                    </div>
                  </div>
                  <div><label className="block text-xs text-slate-500 mb-1">Customer</label><input readOnly value={ff.customer_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Fulfillment Date</label><input readOnly value={ff.fulfillment_date?.split('T')[0]||''} className={dis}/></div>
                </div>
                {/* Column 2 — Carrier / Tracking / Memo */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Carrier / Shipping Method</label><input readOnly value={ff.carrier||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Tracking Number</label><input readOnly value={ff.tracking_number||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><textarea readOnly value={ff.memo||''} rows={3} className={`${dis} resize-none`}/></div>
                </div>
                {/* Column 3 — Status / Warehouse / Ship To Address */}
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Status</label><div className="py-1"><StatusBadge status={ff.status}/></div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Warehouse</label><input readOnly value={ff.warehouse_name||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Ship To Address</label><textarea readOnly value={ff.shipping_address||''} rows={2} className={`${dis} resize-none`}/></div>
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
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={ff.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={ff.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={ff.location_name||''} className={dis}/></div>
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
                {tab==='items'?'Items Shipped':tab==='files'?'Files':tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab==='items' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Item Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Item Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Available</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">On Hand</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty Shipped</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-14">UOM</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Lot/Serial</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Bin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ff.lines||[]).length===0?<tr><td colSpan={10} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                    :(ff.lines||[]).map((l:any,i:number)=>{
                      const s = stockMap[l.item_id];
                      // Stock is stored in base units; show it in the line's unit (base qty / rate).
                      const rate = Number(l.uom_rate) > 0 ? Number(l.uom_rate) : 1;
                      return (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{l.item_code}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-700">{l.item_name}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description||'-'}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600">{formatNumber(s ? s.available / rate : 0,2)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{formatNumber(s ? s.onHand / rate : 0,2)}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{formatNumber(l.quantity,0)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.uom_code||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.lot_number||l.serial_number||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.bin_code||'-'}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab==='files' && <TransactionFilesTab sourceType="item_fulfillment" sourceId={id!}/>}
            {activeTab==='gl' && (
              <div>
                <div className="mb-3 text-xs bg-blue-50 border border-blue-100 rounded p-3 text-blue-800">
                  <p className="font-medium mb-1">GL Impact (Item Fulfillment — COGS Entry):</p>
                  <p><strong>Dr. COGS (Cost of Goods Sold) → Cr. Inventory Account</strong></p>
                </div>
                {(ff.journalEntries||[]).length > 0 ? (
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
                        {(ff.journalEntries||[]).flatMap((je:any)=>(je.lines||[]).map((l:any,i:number)=>(
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
                ) : <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded">No GL entries — COGS posted when item is fulfilled</div>}
              </div>
            )}
            {activeTab==='sysinfo' && <TransactionSysInfoTab auditEndpoint={`/api/sales/fulfillments/${id}/audit`} queryKey={['ff-audit',id!]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}
