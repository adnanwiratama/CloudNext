import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

// "Receive Orders" worklist — every purchase order awaiting receipt lands here.
// Clicking "Receive" (or selecting rows + Submit) opens the New Receipt form for
// that PO at /purchasing/receipts/new?poId=<id>.
const PENDING_STATUSES = ['pending_receipt', 'partially_received'];

// Month options for the Posting Period dropdown (current year ± surrounding months).
function postingPeriods(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 6; i >= -6; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) });
  }
  return out;
}

export default function ReceiveOrdersWorklist() {
  const navigate = useNavigate();
  const { vendors } = useFormOptions();
  const [vendorId, setVendorId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [orderSearch, setOrderSearch] = useState('');
  const [marked, setMarked] = useState<Set<string>>(new Set());

  // Load POs awaiting receipt (one call per pending status, then merge).
  const { data, isLoading } = useQuery({
    queryKey: ['receive-worklist', vendorId],
    queryFn: async () => {
      const calls = PENDING_STATUSES.map(status =>
        api.get('/api/purchasing/orders', { params: { status, limit: 500, ...(vendorId ? { vendorId } : {}) } }).then(r => r.data.data || []));
      const results = await Promise.all(calls);
      return results.flat();
    },
  });

  const rows = useMemo(() => {
    let list: any[] = data || [];
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      list = list.filter(po => String(po.po_number || '').toLowerCase().includes(q) || String(po.vendor_name || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => String(a.order_date).localeCompare(String(b.order_date)));
  }, [data, orderSearch]);

  const toggle = (id: string) => setMarked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const markAll = () => setMarked(new Set(rows.map(r => r.id)));
  const unmarkAll = () => setMarked(new Set());

  const receive = (poId: string) => navigate(`/purchasing/receipts/new?poId=${poId}`);

  // Submit = process the first marked order (the receipt form handles one PO at a
  // time); the rest remain in the worklist to be received next.
  const submit = () => {
    const first = rows.find(r => marked.has(r.id));
    if (first) receive(first.id);
  };

  const btn = 'px-3 py-1.5 text-sm font-medium rounded';
  const field = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 bg-white';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-3">Receive Orders</h1>

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={submit} disabled={marked.size === 0} className={`${btn} bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50`}>Submit</button>
          <button onClick={markAll} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>Mark All</button>
          <button onClick={unmarkAll} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>Unmark All</button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 mb-4 max-w-4xl">
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Vendor <span className="text-red-500">*</span></label>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={field}>
              <option value="">- All -</option>
              {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Posting Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className={field}>
              {postingPeriods().map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Select Order Number</label>
            <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Filter by PO # or vendor" className={field} />
          </div>
        </div>

        {/* Worklist table */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-16">Receive</th>
                <th className="px-3 py-2 text-left w-24">Process</th>
                <th className="px-3 py-2 text-left">Transaction Type</th>
                <th className="px-3 py-2 text-left w-28">Date</th>
                <th className="px-3 py-2 text-left">PO #</th>
                <th className="px-3 py-2 text-left">Vendor Name</th>
                <th className="px-3 py-2 text-left">Memo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 size={22} className="animate-spin text-blue-500 mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No orders pending receipt</td></tr>
              ) : rows.map(po => (
                <tr key={po.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={marked.has(po.id)} onChange={() => toggle(po.id)} className="w-4 h-4" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => receive(po.id)} className="text-blue-600 hover:underline font-medium">Receive</button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">Purchase Order</td>
                  <td className="px-3 py-2 text-blue-600">{formatDate(po.order_date)}</td>
                  <td className="px-3 py-2 font-mono text-blue-600">{po.po_number}</td>
                  <td className="px-3 py-2 text-slate-700">{po.vendor_name}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{po.memo || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
