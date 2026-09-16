import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';

function CashFlowRow({ label, amount, indent = 0, bold = false, isTotal = false }: {
  label: string; amount: number; indent?: number; bold?: boolean; isTotal?: boolean;
}) {
  return (
    <tr className={isTotal ? 'bg-slate-50 border-t-2 border-slate-300' : ''}>
      <td className={`px-3 py-1.5 text-sm ${bold ? 'font-semibold' : ''}`} style={{ paddingLeft: `${12 + indent * 20}px` }}>{label}</td>
      <td className={`px-3 py-1.5 text-right text-sm ${bold || isTotal ? 'font-bold' : ''} ${amount < 0 ? 'text-red-600' : amount > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
        {amount !== 0 ? formatCurrency(amount) : '—'}
      </td>
    </tr>
  );
}

export default function CashFlowReport() {
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', filters],
    queryFn: () => api.get('/api/accounting/reports/cash-flow', { params: filters }).then(r => r.data.data),
    enabled: submitted,
  });

  const setF = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const d = data || {};
  const operating = d.operating || {};
  const investing = d.investing || {};
  const financing = d.financing || {};

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Reports', path: '/accounting/reports/profit-loss' }, { label: 'Cash Flow' }]}
        title="Cash Flow Statement"
        subtitle="Indirect method — operating, investing, and financing activities"
        actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}><Download size={13} /> Export</button>}
      />
      <div className="erp-card mb-4">
        <div className="form-section-title">Period</div>
        <div className="form-grid-3 items-end">
          <div>
            <label className="erp-label">Start Date</label>
            <input type="date" className="erp-input" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} />
          </div>
          <div>
            <label className="erp-label">End Date</label>
            <input type="date" className="erp-input" value={filters.endDate} onChange={e => setF('endDate', e.target.value)} />
          </div>
          <div>
            <button type="button" className="btn-primary mt-5" onClick={() => setSubmitted(true)}><Search size={13} /> Run Report</button>
          </div>
        </div>
      </div>

      {isLoading && <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>}

      {submitted && !isLoading && data && (
        <div className="erp-card no-print">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-erp-subnav text-white">
                <th className="px-3 py-2.5 text-left text-sm font-semibold">Cash Flow Statement</th>
                <th className="px-3 py-2.5 text-right text-sm font-semibold">Amount (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {/* Operating */}
              <CashFlowRow label="OPERATING ACTIVITIES" amount={0} bold />
              <CashFlowRow label="Net Income" amount={operating.netIncome || 0} indent={1} />
              <CashFlowRow label="Adjustments:" amount={0} indent={1} bold />
              <CashFlowRow label="Depreciation & Amortization" amount={operating.depreciation || 0} indent={2} />
              <CashFlowRow label="Changes in Accounts Receivable" amount={operating.changeAR || 0} indent={2} />
              <CashFlowRow label="Changes in Inventory" amount={operating.changeInventory || 0} indent={2} />
              <CashFlowRow label="Changes in Accounts Payable" amount={operating.changeAP || 0} indent={2} />
              <CashFlowRow label="Changes in Other Current Assets" amount={operating.changeOtherCA || 0} indent={2} />
              <CashFlowRow label="Net Cash from Operating Activities" amount={operating.total || 0} isTotal bold />

              {/* Investing */}
              <CashFlowRow label="" amount={0} />
              <CashFlowRow label="INVESTING ACTIVITIES" amount={0} bold />
              <CashFlowRow label="Purchase of Fixed Assets" amount={investing.purchaseFixedAssets || 0} indent={1} />
              <CashFlowRow label="Sale of Fixed Assets" amount={investing.saleFixedAssets || 0} indent={1} />
              <CashFlowRow label="Net Cash from Investing Activities" amount={investing.total || 0} isTotal bold />

              {/* Financing */}
              <CashFlowRow label="" amount={0} />
              <CashFlowRow label="FINANCING ACTIVITIES" amount={0} bold />
              <CashFlowRow label="Loan Proceeds" amount={financing.loanProceeds || 0} indent={1} />
              <CashFlowRow label="Loan Repayments" amount={financing.loanRepayments || 0} indent={1} />
              <CashFlowRow label="Owner Equity / Capital" amount={financing.equity || 0} indent={1} />
              <CashFlowRow label="Dividends Paid" amount={financing.dividends || 0} indent={1} />
              <CashFlowRow label="Net Cash from Financing Activities" amount={financing.total || 0} isTotal bold />

              {/* Net Change */}
              <CashFlowRow label="" amount={0} />
              <tr className="bg-blue-50 border-t-2 border-blue-300">
                <td className="px-3 py-2.5 text-sm font-bold text-blue-800">Net Increase / (Decrease) in Cash</td>
                <td className={`px-3 py-2.5 text-right font-bold text-base ${(d.netCashChange || 0) < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                  {formatCurrency(d.netCashChange || 0)}
                </td>
              </tr>
              <CashFlowRow label="Opening Cash Balance" amount={d.openingCash || 0} bold />
              <tr className="bg-emerald-50 border-t border-emerald-200">
                <td className="px-3 py-2.5 text-sm font-bold text-emerald-800">Closing Cash Balance</td>
                <td className="px-3 py-2.5 text-right font-bold text-base text-emerald-700">{formatCurrency(d.closingCash || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
