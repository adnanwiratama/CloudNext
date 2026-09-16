/**
 * Hook for currency/number input with auto-formatting.
 * Displays formatted number (e.g. 1.000.000) while storing raw numeric value.
 */
import { useState, useCallback } from 'react';

function formatIDR(value: number | string): string {
  const num = parseFloat(String(value).replace(/[^\d.]/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseRaw(display: string): number {
  const cleaned = display.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

export function useCurrencyInput(initialValue: number = 0) {
  const [display, setDisplay] = useState(initialValue > 0 ? formatIDR(initialValue) : '');
  const [raw, setRaw] = useState(initialValue);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    // Allow only digits and dots (thousands separator)
    const digits = input.replace(/[^\d]/g, '');
    const num = parseFloat(digits) || 0;
    setRaw(num);
    setDisplay(num > 0 ? formatIDR(num) : '');
  }, []);

  const handleBlur = useCallback(() => {
    setDisplay(raw > 0 ? formatIDR(raw) : '');
  }, [raw]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // Show plain number on focus for easy editing
    e.target.select();
  }, []);

  const reset = useCallback((val: number = 0) => {
    setRaw(val);
    setDisplay(val > 0 ? formatIDR(val) : '');
  }, []);

  return { display, raw, handleChange, handleBlur, handleFocus, reset };
}
