import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import { StatusBadge } from '../../components/common/DataTable';

export default function ManufacturingReport() {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mfg-report', dateFrom, dateTo],
    queryFn: () => api.get('/api/reports/manufacturing', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const summary = data?.summary || {};

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports' }, { label: 'Manufacturing' }]}
        title="Manufacturing Report"
        actions={<>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">Refresh</button>
          <button className="btn-secondary btn-sm"><Download size={13} /> Export</button>
        </>}
      />

      <div className="erp-card mb-4 p-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Period:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="erp-input w-36" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="erp-input w-36" />
        <button onClick={() => refetch()} className="btn-primary btn-sm">Apply</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total WOs', val: summary.totalWOs || 0, color: 'text-slate-800' },
          { label: 'Completed', val: summary.completed || 0, color: 'text-emerald-600' },
          { label: 'In Progress', val: summary.inProgress || 0, color: 'text-blue-600' },
          { label: 'Planned', val: summary.planned || 0, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="erp-card p-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr>
                <th>WO #</th>
                <th>Item</th>
                <th>Start Date</th>
                <th className="text-right">Planned</th>
                <th className="text-right">Completed</th>
                <th className="text-right">Est. Cost</th>
                <th className="text-right">Act. Cost</th>
                <th className="text-right">Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.workOrders || []).map((wo: any) => {
                const variance = parseFloat(wo.variance_amount || 0);
                return (
                  <tr key={wo.wo_number}>
                    <td className="font-mono text-blue-600 font-medium">{wo.wo_number}</td>
                    <td>
                      <span className="font-mono text-xs text-blue-600">{wo.item_code}</span>
                      <div className="text-xs">{wo.item_name}</div>
                    </td>
                    <td>{formatDate(wo.planned_start_date)}</td>
                    <td className="text-right">{formatNumber(wo.planned_quantity, 0)}</td>
                    <td className="text-right text-emerald-600">{formatNumber(wo.completed_quantity, 0)}</td>
                    <td className="text-right">{formatCurrency(wo.estimated_total_cost)}</td>
                    <td className="text-right font-medium">{formatCurrency(wo.actual_total_cost)}</td>
                    <td className={`text-right font-medium ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {variance !== 0 ? (variance > 0 ? '+' : '') + formatCurrency(variance) : '-'}
                    </td>
                    <td><StatusBadge status={wo.status} /></td>
                  </tr>
                );
              })}
              {(!data?.workOrders || data.workOrders.length === 0) && (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">No work orders in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
