import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';

type PurchaseReportType = 'po-by-customer' | 'po-by-items' | 'purchases-by-customer' | 'purchases-by-items' | 'purchases-by-rep';

const REPORT_TITLES: Record<PurchaseReportType, string> = {
  'po-by-customer': 'Purchase Order by Customer',
  'po-by-items': 'Purchase Order by Items',
  'purchases-by-customer': 'Purchases by Customer',
  'purchases-by-items': 'Purchases by Items',
  'purchases-by-rep': 'Purchases by Rep',
};

export default function PurchaseReports({ type }: { type: PurchaseReportType }) {
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [submitted, setSubmitted] = useState(false);
  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-report', type, filters],
    queryFn: () => api.get(`/api/reports/${type}`, { params: filters }).then(r => r.data.data || []),
    enabled: submitted,
  });

  const title = REPORT_TITLES[type];
  const isByVendor = type === 'po-by-customer' || type === 'purchases-by-customer';
  const isByItem = type === 'po-by-items' || type === 'purchases-by-items';
  const isByRep = type === 'purchases-by-rep';
  const total = (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/reports/purchases-by-customer' }, { label: title }]}
        title={title}
        actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Filter</div>
        <div className="form-grid-3 items-end">
          <div><label className="erp-label">Start Date</label><input type="date" className="erp-input" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} /></div>
          <div><label className="erp-label">End Date</label><input type="date" className="erp-input" value={filters.endDate} onChange={e => setF('endDate', e.target.value)} /></div>
          <div><button type="button" className="btn-primary mt-5" onClick={() => setSubmitted(true)}><Search size={13} /> Run Report</button></div>
        </div>
      </div>
      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}
      {submitted && !isLoading && (
        <div className="erp-card">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th>
                {isByVendor && <><th>Vendor</th><th className="text-right">Transactions</th></>}
                {isByItem && <><th>Item Code</th><th>Item Name</th><th className="text-right">Qty Purchased</th></>}
                {isByRep && <><th>Rep</th><th className="text-right">Orders</th></>}
                <th className="text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No data found.</td></tr>
              ) : data.map((row: any, i: number) => (
                <tr key={i}>
                  <td className="text-slate-400 text-sm">{i + 1}</td>
                  {isByVendor && <><td className="font-medium text-blue-600">{row.vendor_name || row.name}</td><td className="text-right">{row.transaction_count || 0}</td></>}
                  {isByItem && <><td className="font-mono text-xs text-slate-500">{row.item_code}</td><td className="font-medium">{row.item_name || row.name}</td><td className="text-right">{row.total_qty || 0}</td></>}
                  {isByRep && <><td className="font-medium">{row.rep || '—'}</td><td className="text-right">{row.order_count || 0}</td></>}
                  <td className="text-right font-semibold">{formatCurrency(row.total_amount)}</td>
                </tr>
              ))}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                  <td colSpan={isByItem ? 4 : 3} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
