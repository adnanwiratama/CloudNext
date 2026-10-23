import { ReactNode } from 'react';
import ReportExportBar from './ReportExportBar';
import { ReportModel } from '../../utils/reportExport';

// Shared chrome for non-financial reports, matching the Financial report layout:
//  - sticky white header (title + optional subtitle + Export/Print bar)
//  - scrollable content area
//  - sticky bottom filter bar (filters + Refresh)
export default function ReportShell({
  title, subtitle, buildModel, exportDisabled, children, filterBar,
}: {
  title: string;
  subtitle?: string;
  buildModel: () => ReportModel | null;
  exportDisabled?: boolean;
  children: ReactNode;
  filterBar?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
            {subtitle && <span className="text-sm text-slate-500">{subtitle}</span>}
          </div>
          <ReportExportBar build={buildModel} disabled={exportDisabled} />
        </div>
      </div>

      <div className="flex-1 p-4 max-w-screen-2xl mx-auto w-full">
        {children}
      </div>

      {filterBar && (
        <div className="sticky bottom-0 bg-slate-100 border-t border-slate-300">
          <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap">
            {filterBar}
          </div>
        </div>
      )}
    </div>
  );
}

// Small shared input styles so report filter bars look consistent.
export const reportFilterInput = 'border border-slate-300 rounded text-sm px-2 py-1 bg-white focus:outline-none focus:border-blue-400';
export const reportFilterLabel = 'text-xs font-medium text-slate-600 uppercase';
