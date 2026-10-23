import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Truck } from 'lucide-react';
import { useState } from 'react';
import api from '../../services/api';
import { formatNumber, formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

// Item Fulfillment-style form for a Vendor Return: review the lines being shipped
// back to the vendor, then Confirm Shipment to reduce inventory on hand.
export default function VendorReturnFulfillForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [primaryOpen, setPrimaryOpen] = useState(true);

  const { data: vr, isLoading } = useQuery({
    queryKey: ['vendor-return', id],
    queryFn: () => api.get(`/api/purchasing/vendor-returns/${id}`).then(r => r.data.data),
    enabled: !!id, staleTime: 0, refetchOnMount: true,
  });

  const fulfillMutation = useMutation({
    mutationFn: () => api.post(`/api/purchasing/vendor-returns/${id}/fulfill`),
    onSuccess: () => { toast.success('Return fulfilled; inventory reduced'); navigate(`/purchasing/vendor-returns/${id}`, { state: { justSaved: true } }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to fulfill'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!vr) return <div className="p-6 text-red-600">Vendor return not found.</div>;

  if (vr.status === 'fulfilled') {
    return (
      <div className="p-6 max-w-screen-xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-amber-800 text-sm">This vendor return is already fulfilled.</div>
        <button onClick={() => navigate(`/purchasing/vendor-returns/${id}`)} className="mt-3 px-3 py-1.5 border border-slate-300 bg-white text-sm rounded hover:bg-slate-50">Back to Return</button>
      </div>
    );
  }

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-700 flex items-center justify-center text-white"><Truck size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Item Fulfillment</span>
              <span className="text-sm text-slate-500">for Vendor Return {vr.return_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate(`/purchasing/vendor-returns/${id}`)} className="hover:underline">Return</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={() => navigate(`/purchasing/vendor-returns/${id}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <button onClick={() => fulfillMutation.mutate()} disabled={fulfillMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {fulfillMutation.isPending ? <Loader2 size={13} className="animate-spin"/> : <Truck size={13}/>} Confirm Shipment
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        <div className="bg-blue-50 border border-blue-100 rounded px-4 py-2.5 text-xs text-blue-800">
          Confirming shipment ships these items back to the vendor and reduces inventory On Hand at the return location.
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Vendor</label><input readOnly value={vr.vendor_name || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Return Number</label><input readOnly value={vr.return_number || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Return Date</label><input readOnly value={vr.return_date?.split('T')[0] || ''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={vr.location_name || ''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={vr.department_name || ''} className={dis}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-800">Items to Ship Back</div>
          <div className="p-4">
            <div className="border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-xs min-w-max">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56">Item</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Description</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Location</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty to Ship</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Unit Price</th>
                </tr></thead>
                <tbody>
                  {(vr.lines || []).length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No items</td></tr>
                    : (vr.lines || []).map((l: any) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5"><span className="font-mono text-xs text-blue-600">{l.item_code}</span><div className="text-xs text-slate-600">{l.item_name}</div></td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{l.description || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name || vr.location_name || '-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatNumber(l.qty, 2)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(l.unit_price)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => fulfillMutation.mutate()} disabled={fulfillMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {fulfillMutation.isPending ? <Loader2 size={13} className="animate-spin"/> : <Truck size={13}/>} Confirm Shipment
          </button>
          <button onClick={() => navigate(`/purchasing/vendor-returns/${id}`)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
