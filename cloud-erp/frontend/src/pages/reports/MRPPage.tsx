import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Play, Loader2, TrendingUp, ShoppingCart, Factory } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

export default function MRPPage() {
  const [horizon, setHorizon] = useState('30');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mrp', horizon],
    queryFn: () => api.get('/api/reports/mrp/run', { params: { horizon } }).then(r => r.data.data),
  });

  const summary = data?.summary || {};
  const recs = data?.recommendations || [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing' }, { label: 'MRP' }]}
        title="Material Requirements Planning"
        subtitle={data ? `Run Date: ${data.runDate} · ${summary.total} recommendations` : 'Calculate material & production requirements'}
        actions={
          <button onClick={() => refetch()} disabled={isLoading} className="btn-primary btn-sm">
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run MRP
          </button>
        }
      />

      {/* Controls */}
      <div className="erp-card mb-4 p-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Planning Horizon:</label>
        <select value={horizon} onChange={e => setHorizon(e.target.value)} className="erp-select w-32">
          <option value="7">7 Days</option>
          <option value="14">14 Days</option>
          <option value="30">30 Days</option>
          <option value="60">60 Days</option>
          <option value="90">90 Days</option>
        </select>
        <button onClick={() => refetch()} className="btn-primary btn-sm">Calculate</button>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="erp-card p-3 border-l-4 border-blue-500">
            <div className="flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /><span className="text-xs text-slate-500">Total Recommendations</span></div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{summary.total || 0}</div>
          </div>
          <div className="erp-card p-3 border-l-4 border-amber-500">
            <div className="flex items-center gap-2"><ShoppingCart size={16} className="text-amber-500" /><span className="text-xs text-slate-500">Purchase Orders</span></div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{summary.purchaseRecommendations || 0}</div>
          </div>
          <div className="erp-card p-3 border-l-4 border-emerald-500">
            <div className="flex items-center gap-2"><Factory size={16} className="text-emerald-500" /><span className="text-xs text-slate-500">Work Orders</span></div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{summary.workOrderRecommendations || 0}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 erp-card">
          <div className="text-center">
            <Loader2 size={24} className="animate-spin text-blue-500 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Running MRP calculation...</p>
          </div>
        </div>
      ) : recs.length > 0 ? (
        <div className="erp-card">
          <div className="erp-card-header">
            <h3 className="text-sm font-semibold">MRP Recommendations</h3>
            <span className="text-xs text-slate-500">{recs.length} items require action</span>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Action</th>
                <th className="text-right">Demand</th>
                <th className="text-right">Available</th>
                <th className="text-right">On Order</th>
                <th className="text-right">Recommended Qty</th>
                <th>Required Date</th>
                <th>Suggested Date</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recs.map((rec: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono text-blue-600 font-medium">{rec.itemCode}</td>
                  <td className="font-medium">{rec.itemName}</td>
                  <td>
                    <span className={`badge text-2xs ${rec.type === 'purchase' ? 'badge-orange' : 'badge-blue'}`}>
                      {rec.type === 'purchase' ? '🛒 Purchase' : '⚙️ Work Order'}
                    </span>
                  </td>
                  <td className="text-right">{formatNumber(rec.demandQty, 0)}</td>
                  <td className={`text-right ${rec.available < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatNumber(rec.available, 0)}</td>
                  <td className="text-right text-blue-600">{formatNumber(rec.onOrder, 0)}</td>
                  <td className="text-right font-bold text-slate-800">{formatNumber(rec.recommendedQty, 0)}</td>
                  <td>{formatDate(rec.requiredDate)}</td>
                  <td>{formatDate(rec.suggestedDate)}</td>
                  <td><span className="text-xs text-slate-500 capitalize">{rec.reason?.replace(/_/g,' ') || 'demand'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <div className="erp-card p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-base font-semibold text-slate-700">No Action Required</h3>
          <p className="text-sm text-slate-500 mt-1">All items have sufficient stock for the next {horizon} days.</p>
        </div>
      ) : null}
    </div>
  );
}
