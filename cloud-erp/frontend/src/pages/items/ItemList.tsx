import TransactionListPage from '../../components/transaction/TransactionListPage';
import { formatCurrency } from '../../utils/format';

export default function ItemList() {
  return (
    <TransactionListPage
      title="Items"
      iconBg="bg-indigo-600" iconText="I"
      endpoint="/api/items"
      newPath="/items/new"
      detailPath={r => `/items/${r.id}`}
      numberField="item_code"
      dateField="created_at"
      memoField="name"
      columns={[
        { key: 'item_code', label: 'Item Code', render: r => <span className="font-mono text-blue-600 font-medium">{r.item_code}</span> },
        { key: 'name', label: 'Item Name', render: r => (
          <div>
            <div className="font-medium text-slate-800">{r.name}</div>
            {r.sku && <div className="text-xs text-slate-500">SKU: {r.sku}</div>}
          </div>
        ) },
        { key: 'type', label: 'Type', render: r => <span className="text-slate-600 capitalize">{(r.type || '').replace(/_/g, ' ')}</span> },
        { key: 'category_name', label: 'Category', render: r => r.category_name || '-' },
        { key: 'uom_code', label: 'UOM', render: r => r.uom_code || '-' },
        { key: 'standard_cost', label: 'Std Cost', align: 'right', render: r => formatCurrency(r.standard_cost) },
        { key: 'sales_price', label: 'Sales Price', align: 'right', render: r => formatCurrency(r.sales_price) },
        { key: 'is_active', label: 'Active', render: r => (
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
            {r.is_active ? 'Active' : 'Inactive'}
          </span>
        ) },
      ]}
    />
  );
}
