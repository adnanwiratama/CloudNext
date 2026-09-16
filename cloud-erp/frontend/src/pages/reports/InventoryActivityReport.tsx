import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatNumber, formatDate } from '../../utils/format';
import { useFormOptions } from '../../hooks/useFormOptions';

export default function InventoryActivityReport() {
  const { items, locations } = useFormOptions();
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    itemId: '',
    locationId: '',
    txnType: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-activity', filters],
    queryFn: () => api.get('/api/reports/inventory-activity', { params: filters }).then(r => r.data.data || []),
    enabled: submitted,
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/reports/inventory-activity' }, { label: 'Inventory Activity Detail' }]}
        title="Inventory Activity Detail"
        subtitle="Detailed stock in and out movements by item"
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
          <div>
            <label className="erp-label">Transaction Type</label>
            <select className="erp-select" value={filters.txnType} onChange={e => setF('txnType', e.target.value)}>
              <option value="">All Types</option>
              <option value="receipt">Items Receipt (PO)</option>
              <option value="fulfillment">Item Fulfillment (SO)</option>
              <option value="adjustment">Inventory Adjustment</option>
              <option value="transfer">Transfer</option>
              <option value="assembly">Assembly Build</option>
              <option value="return">Return</option>
            </select>
          </div>
          <div><button type="button" className="btn-primary mt-5" onClick={() => setSubmitted(true)}><Search size={13} /> Run Report</button></div>
        </div>
      </div>
      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}
      {submitted && !isLoading && (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr><th>Date</th><th>Item Code</th><th>Item Name</th><th>Transaction Type</th><th>Document #</th><th>Location</th><th className="text-right">Qty In</th><th className="text-right">Qty Out</th><th className="text-right">Net</th></tr>
            </thead>
            <tbody>
              {(!data || data.length === 0)
                ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">No activity found.</td></tr>
                : data.map((row: any, i: number) => (
                  <tr key={i}>
                    <td className="text-xs">{formatDate(row.transaction_date)}</td>
                    <td className="font-mono text-xs text-blue-600">{row.item_code}</td>
                    <td className="font-medium">{row.item_name}</td>
                    <td><span className="badge badge-gray text-2xs">{row.transaction_type}</span></td>
                    <td className="font-mono text-xs text-slate-500">{row.document_number}</td>
                    <td className="text-slate-500 text-xs">{row.location_name}</td>
                    <td className="text-right text-emerald-600 font-medium">{row.qty_in > 0 ? formatNumber(row.qty_in) : ''}</td>
                    <td className="text-right text-red-600 font-medium">{row.qty_out > 0 ? formatNumber(row.qty_out) : ''}</td>
                    <td className={`text-right font-semibold ${Number(row.qty_in) - Number(row.qty_out) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatNumber(Number(row.qty_in) - Number(row.qty_out))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
