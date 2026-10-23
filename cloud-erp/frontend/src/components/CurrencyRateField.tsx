import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

/**
 * Reusable Currency + Exchange Rate selector for transaction forms.
 * - Lists active currencies (from /api/settings/currencies).
 * - When currency or date changes, auto-looks-up the rate as-of the transaction
 *   date (units of base currency per 1 selected currency) and calls onChange.
 * - Base currency => rate forced to 1 and the rate input is read-only.
 *
 * Captures "the rate at that time" so downstream GL postings convert to base.
 */
export default function CurrencyRateField({
  currency, exchangeRate, date, onChange, disabled = false, compact = false,
}: {
  currency: string;
  exchangeRate: number | string;
  date: string;                 // transaction date (YYYY-MM-DD) used for the rate as-of
  onChange: (next: { currency: string; exchangeRate: number }) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { data: currencies = [] } = useQuery<any[]>({
    queryKey: ['currencies', false],
    queryFn: () => api.get('/api/settings/currencies').then(r => r.data.data || []),
  });

  const baseIso = currencies.find((c: any) => c.is_base)?.iso_code || 'IDR';
  const effCurrency = currency || baseIso;
  const isBase = effCurrency === baseIso;

  // Track the last auto-filled (currency|date) so we don't clobber a manual rate edit.
  const lastLookup = useRef<string>('');

  useEffect(() => {
    if (!currencies.length) return;
    if (isBase) {
      if (Number(exchangeRate) !== 1) onChange({ currency: effCurrency, exchangeRate: 1 });
      lastLookup.current = `${effCurrency}|${date}`;
      return;
    }
    const key = `${effCurrency}|${date}`;
    if (lastLookup.current === key) return;
    lastLookup.current = key;
    api.get('/api/settings/exchange-rate-lookup', { params: { base: baseIso, source: effCurrency, asOf: date } })
      .then(r => {
        const rate = r.data?.data?.rate;
        if (rate != null) onChange({ currency: effCurrency, exchangeRate: Number(rate) });
      })
      .catch(() => { /* leave current rate */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effCurrency, date, isBase, currencies.length]);

  const inp = 'border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className={compact ? 'flex items-end gap-3' : 'grid grid-cols-2 gap-x-6 gap-y-3'}>
      <div className={compact ? 'w-40' : ''}>
        <label className={lbl}>Currency</label>
        <select
          className={`${inp} bg-white w-full`}
          value={effCurrency}
          disabled={disabled}
          onChange={e => onChange({ currency: e.target.value, exchangeRate: Number(exchangeRate) || 1 })}
        >
          {currencies.map((c: any) => (
            <option key={c.id} value={c.iso_code}>{c.iso_code} — {c.name}</option>
          ))}
        </select>
      </div>
      <div className={compact ? 'w-40' : ''}>
        <label className={lbl}>Exchange Rate{!isBase && <span className="text-slate-400"> (per 1 {effCurrency} → {baseIso})</span>}</label>
        <input
          type="number"
          step="any"
          className={`${inp} w-full ${isBase ? 'bg-slate-50 text-slate-500' : ''}`}
          value={exchangeRate}
          readOnly={isBase || disabled}
          onChange={e => onChange({ currency: effCurrency, exchangeRate: parseFloat(e.target.value) || 0 })}
        />
      </div>
    </div>
  );
}
