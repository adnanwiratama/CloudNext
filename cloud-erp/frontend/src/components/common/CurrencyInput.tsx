import { useState, useCallback } from 'react';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  disabled?: boolean;
}

function formatNumber(n: number): string {
  if (!n || isNaN(n)) return '';
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parseNumber(s: string): number {
  // Remove thousand separators (.) and replace comma decimal
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Auto-formatted currency/number input.
 * Displays: 1.500.000 (Indonesian locale)
 * Stores: 1500000 (raw number)
 */
export default function CurrencyInput({ value, onChange, placeholder = '0', className = '', min = 0, disabled }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [displayVal, setDisplayVal] = useState('');

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    // Show raw number on focus, remove formatting
    setDisplayVal(value > 0 ? String(value) : '');
    setTimeout(() => e.target.select(), 0);
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    setDisplayVal('');
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayVal(raw);
    const num = parseFloat(raw.replace(/[^\d.]/g, '')) || 0;
    onChange(num);
  }, [onChange]);

  const displayValue = focused ? displayVal : (value > 0 ? formatNumber(value) : '');

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`erp-input text-right ${className}`}
      value={displayValue}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
    />
  );
}
