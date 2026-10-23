import { useState, useEffect } from 'react';

interface Props {
  value: number | string;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  decimals?: number;         // max decimal places allowed (default 2)
  min?: number;
  disabled?: boolean;
}

// Formats a numeric value with id-ID thousands separators (e.g. 1.234.567,89)
function format(v: number, decimals: number): string {
  if (v == null || isNaN(v)) return '';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(v);
}

// Parse an id-ID formatted string back to a number.
// Thousands sep = '.', decimal sep = ','
function parse(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * A numeric text input that shows thousands separators while typing
 * and reports a plain number via onChange.
 */
export default function NumberInput({ value, onChange, className, placeholder, decimals = 2, min, disabled }: Props) {
  const numeric = typeof value === 'string' ? parseFloat(value) || 0 : (value || 0);
  const [text, setText] = useState<string>(numeric ? format(numeric, decimals) : '');

  // Sync from external value changes (e.g. loading an item in edit mode)
  useEffect(() => {
    const parsedCurrent = parse(text);
    if (parsedCurrent !== numeric) {
      setText(numeric ? format(numeric, decimals) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric]);

  const handleChange = (raw: string) => {
    // allow only digits, one comma (decimal), and dots (thousands)
    const filtered = raw.replace(/[^0-9.,]/g, '');
    const n = parse(filtered);
    // Keep the user's raw text (so the caret / partial input feels natural),
    // but re-inject thousands separators on the integer part.
    const [intPart, decPart] = filtered.replace(/\./g, '').split(',');
    const intFmt = intPart ? new Intl.NumberFormat('id-ID').format(parseInt(intPart, 10) || 0) : '';
    setText(decPart !== undefined ? `${intFmt},${decPart.slice(0, decimals)}` : intFmt);
    onChange(min != null && n < min ? min : n);
  };

  const handleBlur = () => {
    const n = parse(text);
    setText(n ? format(n, decimals) : '');
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={e => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  );
}
