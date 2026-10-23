import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

// "Fulfill Orders" worklist — every sales order awaiting fulfillment lands here.
// Clicking "Fulfill" (or selecting rows + Submit) opens the New Fulfillment form
// for that SO at /sales/fulfillments/new?soId=<id>.
const PENDING_STATUSES = ['pending_fulfillment', 'partially_fulfilled'];

function postingPeriods(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 6; i >= -6; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) });
  }
  return out;
}

export default function FulfillOrdersWorklist() {
  const navigate = useNavigate();
  const { customers } = useFormOptions();
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [orderSearch, setOrderSearch] = useState('');
  const [marked, setMarked] = useState<Set<string>>(new Set());

  // Load SOs awaiting fulfillment (one call per pending status, then merge).
  const { data, isLoading } = useQuery({
    queryKey: ['fulfill-worklist', customerId],
    queryFn: async () => {
      const calls = PENDING_STATUSES.map(status =>
        api.get('/api/sales/orders', { params: { status, limit: 500, ...(customerId ? { customerId } : {}) } }).then(r => r.data.data || []));
      const results = await Promise.all(calls);
      return results.flat();
    },
  });

  const rows = useMemo(() => {
    let list: any[] = data || [];
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      list = list.filter(so => String(so.so_number || '').toLowerCase().includes(q) || String(so.customer_name || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => String(a.order_date).localeCompare(String(b.order_date)));
  }, [data, orderSearch]);

  const toggle = (id: string) => setMarked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const markAll = () => setMarked(new Set(rows.map(r => r.id)));
  const unmarkAll = () => setMarked(new Set());

  const fulfill = (soId: string) => navigate(`/sales/fulfillments/new?soId=${soId}`);

  // Submit = process the first marked order (the fulfillment form handles one SO
  // at a time); the rest remain in the worklist.
  const submit = () => {
    const first = rows.find(r => marked.has(r.id));
    if (first) fulfill(first.id);
  };

  const btn = 'px-3 py-1.5 text-sm font-medium rounded';
  const field = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 bg-white';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-3">Fulfill Orders</h1>

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={submit} disabled={marked.size === 0} className={`${btn} bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50`}>Submit</button>
          <button onClick={markAll} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>Mark All</button>
          <button onClick={unmarkAll} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>Unmark All</button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 mb-4 max-w-4xl">
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Customer <span className="text-red-500">*</span></label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={field}>
              <option value="">- All -</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Posting Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className={field}>
              {postingPeriods().map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Select Order Number</label>
            <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Filter by SO # or customer" className={field} />
          </div>
        </div>

        {/* Worklist table */}
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-16">Fulfill</th>
                <th className="px-3 py-2 text-left w-24">Process</th>
                <th className="px-3 py-2 text-left">Transaction Type</th>
                <th className="px-3 py-2 text-left w-28">Date</th>
                <th className="px-3 py-2 text-left">Order #</th>
                <th className="px-3 py-2 text-left">Customer Name</th>
                <th className="px-3 py-2 text-left">Memo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 size={22} className="animate-spin text-blue-500 mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No orders pending fulfillment</td></tr>
              ) : rows.map(so => (
                <tr key={so.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={marked.has(so.id)} onChange={() => toggle(so.id)} className="w-4 h-4" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => fulfill(so.id)} className="text-blue-600 hover:underline font-medium">Fulfill</button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">Sales Order</td>
                  <td className="px-3 py-2 text-blue-600">{formatDate(so.order_date)}</td>
                  <td className="px-3 py-2 font-mono text-blue-600">{so.so_number}</td>
                  <td className="px-3 py-2 text-slate-700">{so.customer_name}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{so.memo || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
