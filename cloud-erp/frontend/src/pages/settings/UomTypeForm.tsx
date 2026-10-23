import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, Info, Star } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

interface UnitRow {
  id?: string;
  name: string;
  pluralName: string;
  abbreviation: string;
  pluralAbbreviation: string;
  conversionRateToBase: number;
  isBaseUnit: boolean;
}

const blankUnit = (): UnitRow => ({ name: '', pluralName: '', abbreviation: '', pluralAbbreviation: '', conversionRateToBase: 1, isBaseUnit: false });

export default function UomTypeForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [units, setUnits] = useState<UnitRow[]>([{ ...blankUnit(), name: '', isBaseUnit: true, conversionRateToBase: 1 }]);

  const { data: existing } = useQuery({
    queryKey: ['uom-type', id],
    queryFn: () => api.get(`/api/settings/uom-types/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing) return;
    setName(existing.name || '');
    setDescription(existing.description || '');
    setIsActive(existing.is_active !== false);
    if (existing.units?.length) {
      setUnits(existing.units.map((u: any) => ({
        id: u.id, name: u.name || '', pluralName: u.plural_name || '',
        abbreviation: u.abbreviation || u.code || '', pluralAbbreviation: u.plural_abbreviation || '',
        conversionRateToBase: Number(u.conversion_rate_to_base || 0), isBaseUnit: !!u.is_base_unit,
      })));
    }
  }, [existing]);

  const baseIdx = units.findIndex(u => u.isBaseUnit);
  const baseUnit = baseIdx >= 0 ? units[baseIdx] : units[0];

  const setUnit = (idx: number, patch: Partial<UnitRow>) =>
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, ...patch } : u));

  const setBase = (idx: number) =>
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, isBaseUnit: true, conversionRateToBase: 1 } : { ...u, isBaseUnit: false }));

  const addUnit = () => setUnits(prev => [...prev, blankUnit()]);
  const removeUnit = (idx: number) => setUnits(prev => {
    const next = prev.filter((_, i) => i !== idx);
    // Ensure there is always a base unit
    if (next.length > 0 && !next.some(u => u.isBaseUnit)) { next[0] = { ...next[0], isBaseUnit: true, conversionRateToBase: 1 }; }
    return next;
  });

  const save = useMutation({
    mutationFn: (payload: any) => isEdit
      ? api.put(`/api/settings/uom-types/${id}`, payload)
      : api.post('/api/settings/uom-types', payload),
    onSuccess: () => {
      toast.success(isEdit ? 'UOM type updated' : 'UOM type created');
      qc.invalidateQueries({ queryKey: ['uom-types'] });
      navigate('/settings/uom');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save UOM type'),
  });

  const handleSave = () => {
    if (!name.trim()) { toast.error('Type Name is required'); return; }
    const valid = units.filter(u => u.name.trim());
    if (valid.length === 0) { toast.error('Add at least one unit'); return; }
    if (!valid.some(u => u.isBaseUnit)) valid[0].isBaseUnit = true;
    for (const u of valid) {
      if (!u.isBaseUnit && (!u.conversionRateToBase || u.conversionRateToBase <= 0)) {
        toast.error(`Enter a conversion rate for "${u.name}"`); return;
      }
    }
    save.mutate({ name, description, isActive, units: valid });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Lists' }, { label: 'Units of Measure', path: '/settings/uom' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? 'Edit Unit of Measure Type' : 'Create Unit of Measure Type'}
        subtitle="Group related units under one type with a single base unit"
        actions={
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save
            </button>
            <button className="btn-secondary btn-sm" onClick={() => navigate('/settings/uom')}>Cancel</button>
          </div>
        }
      />

      {/* Type header fields */}
      <div className="erp-card mb-4">
        <div className="form-section-title">Type Details</div>
        <div className="form-grid-3">
          <div><label className="erp-label">Type Name *</label><input className="erp-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weight, Length, Volume" /></div>
          <div className="col-span-2"><label className="erp-label">Description</label><input className="erp-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" /></div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id="uomTypeActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <label htmlFor="uomTypeActive" className="erp-label mb-0">Active</label>
          </div>
        </div>
      </div>

      {/* Info panel */}
      <div className="mb-4 flex items-start gap-2 text-sm bg-blue-50 border border-blue-100 rounded p-3 text-blue-800">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Conversion Rate is defined against the Base Unit.</p>
          <p className="text-blue-600 mt-0.5">
            The base unit always has a rate of 1. For other units, enter how many base units equal 1 of that unit
            (e.g. 1 KM = 1000 M, so the base is Meter and KM has rate 1000).
          </p>
        </div>
      </div>

      {/* Unit conversion table */}
      <div className="erp-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="form-section-title mb-0">Unit Conversion {baseUnit?.name ? <span className="text-slate-400 font-normal">— Base Unit: {baseUnit.name}</span> : null}</div>
          <button className="btn-secondary btn-sm" onClick={addUnit}><Plus size={13} /> Add Unit</button>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-16 text-center">Base</th>
                <th>Unit Name *</th>
                <th>Plural Name</th>
                <th>Abbreviation</th>
                <th>Plural Abbreviation</th>
                <th className="text-right">Rate to Base</th>
                <th>Reverse (1 base =)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u, idx) => {
                const rate = Number(u.conversionRateToBase || 0);
                const reverse = rate > 0 ? 1 / rate : 0;
                return (
                  <tr key={u.id || idx} className={u.isBaseUnit ? 'bg-blue-50/40' : ''}>
                    <td className="text-center">
                      <button
                        title={u.isBaseUnit ? 'Base unit' : 'Set as base unit'}
                        onClick={() => setBase(idx)}
                        className={u.isBaseUnit ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}
                      >
                        <Star size={15} fill={u.isBaseUnit ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td><input className="erp-input" value={u.name} onChange={e => setUnit(idx, { name: e.target.value })} placeholder="e.g. Kilogram" /></td>
                    <td><input className="erp-input" value={u.pluralName} onChange={e => setUnit(idx, { pluralName: e.target.value })} /></td>
                    <td><input className="erp-input" value={u.abbreviation} onChange={e => setUnit(idx, { abbreviation: e.target.value })} placeholder="e.g. KG" /></td>
                    <td><input className="erp-input" value={u.pluralAbbreviation} onChange={e => setUnit(idx, { pluralAbbreviation: e.target.value })} /></td>
                    <td>
                      <input
                        type="number" step="0.000001" min="0"
                        className="erp-input text-right"
                        value={u.isBaseUnit ? 1 : (u.conversionRateToBase || '')}
                        disabled={u.isBaseUnit}
                        onChange={e => setUnit(idx, { conversionRateToBase: Number(e.target.value) })}
                      />
                    </td>
                    <td className="font-mono text-xs text-slate-500">
                      {u.isBaseUnit ? '1' : (rate > 0 ? `${reverse.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${u.abbreviation || u.name || ''}` : '—')}
                    </td>
                    <td className="text-center">
                      {units.length > 1 && (
                        <button title="Delete unit" className="btn-ghost btn-sm text-red-600" onClick={() => removeUnit(idx)}><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {baseUnit?.name && (
          <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
            Example: 1 {units.find(u => !u.isBaseUnit && u.conversionRateToBase > 0)?.name || 'unit'} =
            {' '}{units.find(u => !u.isBaseUnit && u.conversionRateToBase > 0)?.conversionRateToBase ?? '—'} {baseUnit.name}
            {(() => {
              const other = units.find(u => !u.isBaseUnit && u.conversionRateToBase > 0);
              if (!other) return null;
              const rev = 1 / Number(other.conversionRateToBase);
              return <> &nbsp;•&nbsp; 1 {baseUnit.name} = {rev.toLocaleString('en-US', { maximumFractionDigits: 6 })} {other.name}</>;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
