import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Loader2, Trash2, Plus } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/DataTable';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import toast from 'react-hot-toast';

export default function BOMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAdminGuard();
  const { data: bom, isLoading } = useQuery({
    queryKey: ['bom', id],
    queryFn: () => api.get(`/api/manufacturing/boms/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500" /></div>;
  if (!bom) return <div className="text-center py-12 text-slate-500">BOM not found</div>;

  const totalMaterialCost = (bom.components || []).reduce((sum: number, c: any) =>
    sum + (parseFloat(c.quantity) * parseFloat(c.standard_cost || c.average_cost || 0)), 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Manufacturing' }, { label: 'BOM', path: '/manufacturing/boms' }, { label: bom.bom_number }]}
        title={bom.name}
        subtitle={`${bom.item_code} · Rev ${bom.revision}`}
        status={<StatusBadge status={bom.status} />}
        actions={<>
          <button onClick={() => navigate('/manufacturing/boms')} className="btn-secondary btn-sm"><ArrowLeft size={13} /> Back</button>
          {canEdit && <button className="btn-secondary btn-sm"><Edit size={13} /> Edit</button>}
          {canDelete && (
            <button className="btn-danger btn-sm" onClick={() => {
              if (confirm(`Delete BOM "${bom.name}"?`)) {
                api.delete(`/api/manufacturing/boms/${id}`)
                  .then(() => { toast.success('BOM deleted'); navigate('/manufacturing/boms'); })
                  .catch((e: any) => toast.error(e.response?.data?.error || 'Cannot delete'));
              }
            }}><Trash2 size={13} /> Delete</button>
          )}
          {canEdit && <button className="btn-primary btn-sm" onClick={() => navigate('/manufacturing/work-orders/new')}><Plus size={13} /> Create WO</button>}
        </>}
      />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="erp-card">
            <div className="form-section-title">BOM Information</div>
            <div className="form-grid-3">
              <div><label className="erp-label">BOM Number</label><div className="text-sm font-mono text-blue-600">{bom.bom_number}</div></div>
              <div><label className="erp-label">Finished Good</label><div className="text-sm font-medium">{bom.item_name}</div><div className="text-xs text-slate-500">{bom.item_code}</div></div>
              <div><label className="erp-label">Revision</label><div className="text-sm">{bom.revision}</div></div>
              <div><label className="erp-label">Effective Date</label><div className="text-sm">{formatDate(bom.effective_date)}</div></div>
              <div><label className="erp-label">Expiry Date</label><div className="text-sm">{formatDate(bom.expiry_date) || 'No expiry'}</div></div>
              <div><label className="erp-label">Base Quantity</label><div className="text-sm">{formatNumber(bom.quantity)} {bom.uom_code}</div></div>
              <div><label className="erp-label">Yield %</label><div className="text-sm">{bom.yield_percent}%</div></div>
            </div>
            {bom.description && <div className="px-4 pb-4"><label className="erp-label">Description</label><div className="text-sm">{bom.description}</div></div>}
          </div>

          {/* Components */}
          <div className="erp-card">
            <div className="erp-card-header">
              <span className="text-sm font-semibold">BOM Components</span>
              <span className="text-xs text-slate-500">{(bom.components || []).length} components</span>
            </div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th className="text-right">Qty / Unit</th>
                  <th>UOM</th>
                  <th className="text-right">Scrap %</th>
                  <th>Supply Type</th>
                  <th className="text-right">Std Cost</th>
                  <th className="text-right">Line Cost</th>
                </tr>
              </thead>
              <tbody>
                {(bom.components || []).map((comp: any) => {
                  const stdCost = parseFloat(comp.standard_cost || comp.average_cost || 0);
                  const lineCost = parseFloat(comp.quantity) * stdCost;
                  return (
                    <tr key={comp.id}>
                      <td className="text-slate-400">{comp.sequence}</td>
                      <td><span className="font-mono text-xs text-blue-600">{comp.item_code}</span></td>
                      <td className="font-medium">{comp.item_name}</td>
                      <td className="text-right">{formatNumber(comp.quantity, 4)}</td>
                      <td>{comp.uom_code}</td>
                      <td className="text-right">{comp.scrap_percent > 0 ? `${comp.scrap_percent}%` : '-'}</td>
                      <td><span className="badge badge-blue text-2xs capitalize">{comp.supply_type}</span></td>
                      <td className="text-right">{formatCurrency(stdCost)}</td>
                      <td className="text-right font-medium">{formatCurrency(lineCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={8} className="px-3 py-2 text-sm font-semibold text-right text-slate-700">Total Material Cost per Unit:</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(totalMaterialCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Cost Summary</div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-xs text-slate-500">Material Cost / Unit</span>
                <span className="text-sm font-semibold">{formatCurrency(totalMaterialCost)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-xs text-slate-500">Components</span>
                <span className="text-sm">{(bom.components || []).length}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-xs text-slate-500">Yield %</span>
                <span className="text-sm">{bom.yield_percent}%</span>
              </div>
            </div>
          </div>
          <div className="erp-card">
            <div className="form-section-title">System Info</div>
            <div className="p-4 space-y-2">
              <div><label className="erp-label">Created</label><div className="text-sm">{formatDate(bom.created_at)}</div></div>
              <div><label className="erp-label">Last Updated</label><div className="text-sm">{formatDate(bom.updated_at)}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
