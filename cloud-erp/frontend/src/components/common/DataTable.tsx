import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Loader2, Download } from 'lucide-react';
import { formatStatus, getStatusBadgeClass } from '../../utils/format';

export interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  total: number;
  page: number;
  limit: number;
  isLoading?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onRowClick?: (row: any) => void;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  emptyMessage?: string;
}

export default function DataTable({
  columns, data, total, page, limit, isLoading,
  search, onSearchChange, onPageChange, onLimitChange,
  onSort, sortBy, sortDir, onRowClick, actions, filters, emptyMessage,
}: DataTableProps) {
  const totalPages = Math.ceil(total / limit);

  const handleSort = (key: string) => {
    if (!onSort) return;
    const newDir = sortBy === key && sortDir === 'asc' ? 'desc' : 'asc';
    onSort(key, newDir);
  };

  return (
    <div className="erp-card">
      {/* Table Controls */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 flex-wrap">
        {onSearchChange && (
          <div className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1.5 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20">
            <Search size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search || ''}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="text-sm outline-none bg-transparent w-48 placeholder-slate-400"
            />
          </div>
        )}
        {filters}
        <div className="flex-1" />
        {actions}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="erp-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`${col.align === 'right' ? 'text-right' : ''} ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    {col.sortable && sortBy === col.key && (
                      sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-slate-400">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-slate-400 text-sm">
                  {emptyMessage || 'No records found'}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {columns.map(col => (
                    <td key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total.toLocaleString()} records
          </span>
          {onLimitChange && (
            <select
              value={limit}
              onChange={e => onLimitChange(parseInt(e.target.value))}
              className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white"
            >
              {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p = i + 1;
            if (totalPages > 5 && page > 3) p = page - 2 + i;
            if (p > totalPages) return null;
            return (
              <button
                key={p}
                onClick={() => onPageChange?.(p)}
                className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 text-slate-600'}`}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Status Badge component
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={getStatusBadgeClass(status)}>
      {formatStatus(status)}
    </span>
  );
}
