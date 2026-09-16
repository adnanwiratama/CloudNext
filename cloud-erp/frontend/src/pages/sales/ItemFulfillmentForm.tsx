import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save, Loader2, Truck, Package } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatDate, formatNumber } from '../../utils/format';
import toast from 'react-hot-toast';

export default function ItemFulfillmentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const soId = searchParams.get('soId');

  const [fulfillmentDate, setFulfillmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [memo, setMemo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [lines, setLines] = useState<Array<{ soLineId: string; itemId: string; quantity: number; maxQty: number; itemCode: string; itemName: string; uomCode: string }>>([]);

  // Load SO detail
  const { data: so, isLoading } = useQuery({
    queryKey: ['so-for-fulfillment', soId],
    queryFn: () => api.get(`/api/sales/orders/${soId}`).then(r => r.data.data),
    enabled: !!soId,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['options-locations'],
    queryFn: () => api.get('/api/settings/locations').then(r => r.data.data || []),
    staleTime: 60000,
  });

  // Auto-populate lines from SO
  useEffect(() => {
    if (so?.lines) {
      setLocationId(so.location_id || '');
      setLines(
        so.lines
          .filter((l: any) => {
            const remaining = parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0);
            return remaining > 0;
          })
          .map((l: any) => ({
            soLineId: l.id,
            itemId: l.item_id,
            quantity: parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0),
            maxQty: parseFloat(l.quantity) - parseFloat(l.qty_fulfilled || 0),
            itemCode: l.item_code,
            itemName: l.item_name,
            uomCode: l.uom_code || 'EA',
          }))
      );
    }
  }, [so]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post(`/api/sales/orders/${soId}/fulfill`, data),
    onSuccess: (res) => {
      toast.success(`Item Fulfillment ${res.data.data.fulfillment_number} created successfully`);
      navigate(`/sales/fulfillments/${res.data.data.id}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create fulfillment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!soId) { toast.error('No Sales Order selected'); return; }
    const validLines = lines.filter(l => l.quantity > 0);
    if (validLines.length === 0) { toast.error('At least one item with quantity > 0 is required'); return; }
    mutation.mutate({
      fulfillmentDate, locationId, trackingNumber: trackingNumber || undefined,
      carrier: carrier || undefined, memo: memo || undefined,
      lines: validLines.map(l => ({ soLineId: l.soLineId, itemId: l.itemId, quantity: l.quantity })),
    });
  };

  if (!soId) return (
    <div className="text-center py-20 text-slate-500">
      <Package size={40} className="mx-auto mb-3 opacity-30" />
      <p>No Sales Order specified. Please navigate from a Sales Order.</p>
      <button onClick={() => navigate('/sales/orders')} className="btn-primary btn-sm mt-4">Go to Sales Orders</button>
    </div>
  );

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!so) return <div className="text-center py-12 text-slate-500">Sales order not found</div>;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', path: '/' },
          { label: 'Sales Orders', path: '/sales/orders' },
          { label: so.so_number, path: `/sales/orders/${soId}` },
          { label: 'New Item Fulfillment' },
        ]}
        title="New Item Fulfillment"
        subtitle={`${so.so_number} — ${so.customer_name}`}
        actions={
          <>
            <button type="button" onClick={() => navigate(`/sales/orders/${soId}`)} className="btn-secondary btn-sm">
              <ArrowLeft size={13} /> Back to SO
            </button>
            <button type="submit" form="ff-form" disabled={mutation.isPending} className="btn-primary btn-sm">
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Truck size={13} />}
              Create Fulfillment
            </button>
          </>
        }
      />

      <form id="ff-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Header Info */}
        <div className="erp-card">
          <div className="form-section-title">Fulfillment Information</div>
          <div className="form-grid-3">
            <div>
              <label className="erp-label">Sales Order</label>
              <div className="erp-input bg-slate-50 text-slate-600 font-mono">{so.so_number}</div>
            </div>
            <div>
              <label className="erp-label">Customer</label>
              <div className="erp-input bg-slate-50 text-slate-600">{so.customer_name}</div>
            </div>
            <div>
              <label className="erp-label">Fulfillment Date *</label>
              <input type="date" className="erp-input" value={fulfillmentDate} onChange={e => setFulfillmentDate(e.target.value)} required />
            </div>
            <div>
              <label className="erp-label">Ship From Location</label>
              <select className="erp-select" value={locationId} onChange={e => setLocationId(e.target.value)}>
                <option value="">-- Select Location --</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Carrier / Shipping Method</label>
              <input type="text" className="erp-input" value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="e.g. JNE, TIKI, SiCepat" />
            </div>
            <div>
              <label className="erp-label">Tracking Number</label>
              <input type="text" className="erp-input" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Tracking / Resi number" />
            </div>
          </div>

          {/* Shipping Address */}
          {so.shipping_address && (
            <div className="px-4 pb-4">
              <label className="erp-label">Ship To Address</label>
              <div className="text-sm text-slate-600 bg-slate-50 rounded p-2">{so.shipping_address}</div>
            </div>
          )}

          <div className="px-4 pb-4">
            <label className="erp-label">Memo / Notes</label>
            <textarea className="erp-textarea" rows={2} value={memo} onChange={e => setMemo(e.target.value)} placeholder="Shipping notes, special instructions..." />
          </div>
        </div>

        {/* Items to Fulfill */}
        <div className="erp-card">
          <div className="form-section-title flex items-center justify-between">
            <span>Items to Ship</span>
            <span className="text-xs text-slate-500">{lines.length} line(s) pending fulfillment</span>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th className="w-32">Item Code</th>
                  <th>Item Name</th>
                  <th className="w-28 text-right">Ordered Qty</th>
                  <th className="w-28 text-right">Already Shipped</th>
                  <th className="w-32 text-right">Ship Now *</th>
                  <th className="w-20">UOM</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const soLine = so.lines?.find((l: any) => l.id === line.soLineId);
                  const alreadyFulfilled = soLine ? parseFloat(soLine.quantity) - line.maxQty : 0;
                  return (
                    <tr key={line.soLineId}>
                      <td className="text-slate-400">{idx + 1}</td>
                      <td className="font-mono text-xs text-blue-600">{line.itemCode}</td>
                      <td className="font-medium">{line.itemName}</td>
                      <td className="text-right text-slate-600">{formatNumber(soLine?.quantity || 0, 0)}</td>
                      <td className="text-right text-slate-500">{formatNumber(alreadyFulfilled, 0)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={line.maxQty}
                          step="0.01"
                          className="erp-input text-right"
                          value={line.quantity}
                          onChange={e => {
                            const val = Math.min(parseFloat(e.target.value) || 0, line.maxQty);
                            setLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                          }}
                        />
                      </td>
                      <td className="text-slate-500">{line.uomCode}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">All items already fulfilled</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* GL Info */}
        <div className="erp-card border-blue-200 bg-blue-50/30">
          <div className="p-4 flex items-start gap-3">
            <div className="text-blue-500 mt-0.5">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm text-blue-800">
              <p className="font-medium">GL Impact at Fulfillment</p>
              <p className="text-xs text-blue-600 mt-1">
                <strong>Dr. COGS → Cr. Finished Goods Inventory</strong><br />
                Cost of goods akan di-recognize saat fulfillment dibuat (bukan di Invoice).
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
