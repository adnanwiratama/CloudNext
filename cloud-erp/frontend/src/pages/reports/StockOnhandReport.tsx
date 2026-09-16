import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

export default function StockOnhandReport() {
  const { locations } = useFormOptions();
  const [filters, setFilters] = useState({ locationId: '', itemCode: '', asOfDate: new Date().toISOString().split('T')[0] });
  const [submitted, setSubmitted] = useState(false);
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['stock-onhand', filters],
    queryFn: () => api.get('/api/reports/stock-onhand', { params: filters }).then(r => r.data.data || []),
    enabled: submitted,
  });

  const totalValue = (data || []).reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/reports/stock-onhand' }, { label: 'Stock On Hand' }]}
        title="Stock On Hand"
        subtitle="Available and on-hand stock by location"
        actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Filter</div>
        <div className="form-grid-3 items-end">
          <div><label className="erp-label">As Of Date</label><input type="date" className="erp-input" value={filters.asOfDate} onChange={e => setF('asOfDate', e.target.value)} /></div>
          <div>
            <label className="erp-label">Location</label>
            <select className="erp-select" value={filters.locationId} onChange={e => setF('locationId', e.target.value)}>
              <option value="">All Locations</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div><label className="erp-label">Item Code / Name</label><input type="text" className="erp-input" value={filters.itemCode} onChange={e => setF('itemCode', e.target.value)} placeholder="Search item..." /></div>
          <div className="col-span-3"><button type="button" className="btn-primary" onClick={() => setSubmitted(true)}><Search size={13} /> Run Report</button></div>
        </div>
      </div>
      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}
      {submitted && !isLoading && (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr><th>Item Code</th><th>Item Name</th><th>Location</th><th className="text-right">On Hand</th><th className="text-right">Available</th><th className="text-right">Committed</th><th className="text-right">On Order</th><th className="text-right">Unit Cost</th><th className="text-right">Total Value</th></tr>
            </thead>
            <tbody>
              {(!data || data.length === 0)
                ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">No stock data found.</td></tr>
                : data.map((row: any, i: number) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-blue-600">{row.item_code}</td>
                    <td className="font-medium">{row.item_name}</td>
                    <td className="text-slate-500 text-sm">{row.location_name}</td>
                    <td className="text-right font-semibold">{formatNumber(row.qty_on_hand)}</td>
                    <td className={`text-right font-semibold ${Number(row.qty_available) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatNumber(row.qty_available)}</td>
                    <td className="text-right text-amber-600">{formatNumber(row.qty_committed || 0)}</td>
                    <td className="text-right text-blue-500">{formatNumber(row.qty_on_order || 0)}</td>
                    <td className="text-right text-slate-500">{formatCurrency(row.unit_cost || 0)}</td>
                    <td className="text-right font-semibold">{formatCurrency(row.total_value || 0)}</td>
                  </tr>
                ))}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                  <td colSpan={8} className="px-3 py-2 text-right">Total Inventory Value</td>
                  <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(totalValue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
