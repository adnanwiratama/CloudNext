import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

export default function StockLedgerReport() {
  const { items, locations } = useFormOptions();
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    itemId: '',
    locationId: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['stock-ledger', filters],
    queryFn: () => api.get('/api/reports/stock-ledger', { params: filters }).then(r => r.data.data || []),
    enabled: submitted,
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/reports/stock-ledger' }, { label: 'Stock Ledger' }]}
        title="Stock Ledger"
        subtitle="Detailed stock movement with beginning and ending balance"
        actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Filter</div>
        <div className="form-grid-3 items-end">
          <div><label className="erp-label">Start Date</label><input type="date" className="erp-input" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} /></div>
          <div><label className="erp-label">End Date</label><input type="date" className="erp-input" value={filters.endDate} onChange={e => setF('endDate', e.target.value)} /></div>
          <div>
            <label className="erp-label">Item</label>
            <select className="erp-select" value={filters.itemId} onChange={e => setF('itemId', e.target.value)}>
              <option value="">All Items</option>
              {items.map((it: any) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
            </select>
          </div>
          <div>
            <label className="erp-label">Location</label>
            <select className="erp-select" value={filters.locationId} onChange={e => setF('locationId', e.target.value)}>
              <option value="">All Locations</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><button type="button" className="btn-primary mt-5" onClick={() => setSubmitted(true)}><Search size={13} /> Run Report</button></div>
        </div>
      </div>
      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}
      {submitted && !isLoading && data && data.map((group: any) => (
        <div key={group.item_id} className="erp-card mb-4">
          <div className="px-4 py-2.5 bg-slate-50 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">{group.item_code} — {group.item_name}</span>
            <div className="flex gap-6 text-sm">
              <span className="text-slate-500">Opening: <strong>{formatNumber(group.opening_qty)}</strong> | {formatCurrency(group.opening_value)}</span>
              <span className="text-slate-500">Closing: <strong className="text-blue-600">{formatNumber(group.closing_qty)}</strong> | {formatCurrency(group.closing_value)}</span>
            </div>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>Date</th><th>Document</th><th>Type</th><th>Location</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance Qty</th><th className="text-right">Unit Cost</th><th className="text-right">Balance Value</th></tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50/50 text-xs font-medium">
                <td colSpan={4} className="px-3 py-1.5 text-slate-600">Opening Balance</td>
                <td></td><td></td>
                <td className="px-3 py-1.5 text-right font-semibold">{formatNumber(group.opening_qty)}</td>
                <td></td>
                <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(group.opening_value)}</td>
              </tr>
              {(group.lines || []).map((line: any, i: number) => (
                <tr key={i}>
                  <td className="text-xs">{formatDate(line.transaction_date)}</td>
                  <td className="font-mono text-xs text-blue-600">{line.document_number}</td>
                  <td><span className="badge badge-gray text-2xs">{line.transaction_type}</span></td>
                  <td className="text-slate-500 text-xs">{line.location_name}</td>
                  <td className="text-right text-emerald-600 font-medium">{line.qty_in > 0 ? formatNumber(line.qty_in) : ''}</td>
                  <td className="text-right text-red-600 font-medium">{line.qty_out > 0 ? formatNumber(line.qty_out) : ''}</td>
                  <td className="text-right font-semibold">{formatNumber(line.balance_qty)}</td>
                  <td className="text-right text-slate-500">{formatCurrency(line.unit_cost || 0)}</td>
                  <td className="text-right font-semibold">{formatCurrency(line.balance_value || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {submitted && !isLoading && (!data || data.length === 0) && (
        <div className="erp-card p-8 text-center text-slate-400">No stock movements found.</div>
      )}
    </div>
  );
}
