import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import { StatusBadge } from '../../components/common/DataTable';
import ReportShell, { reportFilterInput, reportFilterLabel } from '../../components/common/ReportShell';
import { ReportModel } from '../../utils/reportExport';

export default function ManufacturingReport() {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mfg-report', dateFrom, dateTo],
    queryFn: () => api.get('/api/reports/manufacturing', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const summary = data?.summary || {};
  const workOrders: any[] = data?.workOrders || [];

  const buildModel = (): ReportModel | null => {
    if (!workOrders.length) return null;
    return {
      title: 'Manufacturing Report',
      subtitle: `${dateFrom} to ${dateTo}`,
      columns: [
        { label: 'WO #' }, { label: 'Item Code' }, { label: 'Item Name' }, { label: 'Start Date' },
        { label: 'Planned', align: 'right' }, { label: 'Completed', align: 'right' },
        { label: 'Est. Cost', align: 'right' }, { label: 'Act. Cost', align: 'right' }, { label: 'Variance', align: 'right' },
        { label: 'Status' },
      ],
      rows: workOrders.map(wo => {
        const variance = parseFloat(wo.variance_amount || 0);
        return {
          cells: [
            wo.wo_number, wo.item_code, wo.item_name, formatDate(wo.planned_start_date),
            formatNumber(wo.planned_quantity, 0), formatNumber(wo.completed_quantity, 0),
            formatCurrency(wo.estimated_total_cost), formatCurrency(wo.actual_total_cost),
            variance !== 0 ? (variance > 0 ? '+' : '') + formatCurrency(variance) : '-',
            wo.status,
          ],
        };
      }),
    };
  };

  const filterBar = (
    <>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>Start Date</span>
        <input type="date" className={reportFilterInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
      <div className="flex items-center gap-2"><span className={reportFilterLabel}>End Date</span>
        <input type="date" className={reportFilterInput} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
      <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
    </>
  );

  return (
    <ReportShell title="Manufacturing Report" subtitle="Work order production and cost variance" buildModel={buildModel} exportDisabled={!workOrders.length} filterBar={filterBar}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total WOs', val: summary.totalWOs || 0, color: 'text-slate-800' },
          { label: 'Completed', val: summary.completed || 0, color: 'text-emerald-600' },
          { label: 'In Progress', val: summary.inProgress || 0, color: 'text-blue-600' },
          { label: 'Planned', val: summary.planned || 0, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded shadow-sm p-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">WO #</th><th className="px-3 py-1.5 text-left">Item</th><th className="px-3 py-1.5 text-left">Start Date</th>
                <th className="px-3 py-1.5 text-right">Planned</th><th className="px-3 py-1.5 text-right">Completed</th>
                <th className="px-3 py-1.5 text-right">Est. Cost</th><th className="px-3 py-1.5 text-right">Act. Cost</th><th className="px-3 py-1.5 text-right">Variance</th>
                <th className="px-3 py-1.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">No work orders in this period</td></tr>
                : workOrders.map((wo: any) => {
                  const variance = parseFloat(wo.variance_amount || 0);
                  return (
                    <tr key={wo.wo_number} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono text-xs text-blue-600 font-medium">{wo.wo_number}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-xs text-blue-600">{wo.item_code}</span>
                        <div className="text-xs text-slate-600">{wo.item_name}</div>
                      </td>
                      <td className="px-3 py-1.5">{formatDate(wo.planned_start_date)}</td>
                      <td className="px-3 py-1.5 text-right">{formatNumber(wo.planned_quantity, 0)}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600">{formatNumber(wo.completed_quantity, 0)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(wo.estimated_total_cost)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(wo.actual_total_cost)}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {variance !== 0 ? (variance > 0 ? '+' : '') + formatCurrency(variance) : '-'}
                      </td>
                      <td className="px-3 py-1.5"><StatusBadge status={wo.status} /></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}
