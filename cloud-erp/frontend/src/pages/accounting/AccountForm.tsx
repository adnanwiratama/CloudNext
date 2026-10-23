import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface AccountType { value: string; label: string; category: string; }

const CATEGORY_LABEL: Record<string, string> = {
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
  income: 'Income', cost_of_goods: 'Cost of Goods Sold', expense: 'Expense', other: 'Other',
};
const CATEGORY_ORDER = ['asset', 'liability', 'equity', 'income', 'cost_of_goods', 'expense', 'other'];

export default function AccountForm({ mode }: { mode?: 'view' | 'edit' | 'new' } = {}) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const readOnly = mode === 'view';

  const [types, setTypes] = useState<AccountType[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('bank');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [isSummary, setIsSummary] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [tRes, aRes] = await Promise.all([
          api.get('/api/accounting/account-types'),
          api.get('/api/accounting/accounts', { params: { showInactive: 1 } }),
        ]);
        setTypes(tRes.data.data || []);
        setAccounts((aRes.data.data || []).filter((a: any) => !id || a.id !== id));
        if (isEdit) {
          const acc = await api.get(`/api/accounting/accounts/${id}`);
          const d = acc.data.data;
          setCode(d.code || '');
          setName(d.name || '');
          setAccountType(d.account_type || 'other_current_asset');
          setParentId(d.parent_id || '');
          setDescription(d.description || '');
          setIsSummary(!!d.is_summary);
          setIsInactive(!d.is_active);
          setBankName(d.bank_name || '');
          setBankAccountNumber(d.bank_account_number || '');
        }
      } catch (e: any) {
        setError(e.response?.data?.error || 'Failed to load account');
      } finally { setLoading(false); }
    })();
  }, [id]);

  // Group the type options by high-level category for the dropdown (NetSuite style).
  const grouped = useMemo(() => {
    const g: Record<string, AccountType[]> = {};
    for (const t of types) { (g[t.category] ||= []).push(t); }
    return CATEGORY_ORDER.filter(c => g[c]?.length).map(c => ({ category: c, label: CATEGORY_LABEL[c] || c, items: g[c] }));
  }, [types]);

  const isBank = accountType === 'bank';

  const save = async () => {
    if (!code.trim()) { toast.error('Number is required'); return; }
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { code, name, accountType, parentId: parentId || null, description, isSummary, isInactive, bankName, bankAccountNumber };
      if (isEdit) {
        await api.put(`/api/accounting/accounts/${id}`, payload);
        toast.success('Account updated');
      } else {
        await api.post('/api/accounting/accounts', payload);
        toast.success('Account created');
      }
      navigate('/accounting/accounts');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save account');
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;

  const inputCls = `w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400 ${readOnly ? 'bg-slate-50 text-slate-700 cursor-default' : ''}`;
  const labelCls = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Account</h1>
          <div className="flex items-center gap-5 text-sm text-blue-600">
            <span className="hover:underline cursor-pointer" onClick={() => navigate('/accounting/accounts')}>List</span>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          {readOnly ? (
            <>
              <button onClick={() => navigate(`/accounting/accounts/${id}/edit`)}
                className="px-5 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Edit</button>
              <button onClick={() => navigate('/accounting/accounts')}
                className="px-4 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
            </>
          ) : (
            <>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} Save
              </button>
              <button onClick={() => navigate('/accounting/accounts')}
                className="px-4 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="p-6 max-w-screen-xl mx-auto">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        <div className="bg-white border border-slate-200 rounded shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4">
            {/* Column 1 */}
            <div className="space-y-4">
              <div>
                <label className={labelCls}>NUMBER <span className="text-red-500">*</span></label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>NAME <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>SUBACCOUNT OF</label>
                <select value={parentId} onChange={e => setParentId(e.target.value)} disabled={readOnly} className={inputCls + (readOnly ? '' : ' bg-white')}>
                  <option value="">&lt;None&gt;</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>TYPE <span className="text-red-500">*</span></label>
                <select value={accountType} onChange={e => setAccountType(e.target.value)} disabled={readOnly} className={inputCls + (readOnly ? '' : ' bg-white')}>
                  {grouped.map(g => (
                    <optgroup key={g.category} label={g.label}>
                      {g.items.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={isSummary} onChange={e => setIsSummary(e.target.checked)} disabled={readOnly} /> SUMMARY
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={isInactive} onChange={e => setIsInactive(e.target.checked)} disabled={readOnly} /> INACTIVE
              </label>
              {isBank && (
                <>
                  <div>
                    <label className={labelCls}>BANK NAME</label>
                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} disabled={readOnly} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>BANK ACCOUNT NUMBER</label>
                    <input type="text" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} disabled={readOnly} className={inputCls} />
                  </div>
                </>
              )}
            </div>

            {/* Column 3 */}
            <div className="space-y-4">
              <div>
                <label className={labelCls}>DESCRIPTION</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} disabled={readOnly} className={inputCls} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
