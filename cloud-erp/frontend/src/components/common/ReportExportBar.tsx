import { FileSpreadsheet, FileText, FileDown, Printer } from 'lucide-react';
import { ReportModel, exportReportCSV, exportReportExcel, exportReportPDF, printReport } from '../../utils/reportExport';

// Reusable Export (Excel/CSV/PDF) + Print toolbar for financial reports.
// `build` is called lazily so the latest report data is captured on click.
export default function ReportExportBar({ build, disabled }: { build: () => ReportModel | null; disabled?: boolean }) {
  const run = (fn: (m: ReportModel) => void) => {
    const m = build();
    if (m) fn(m);
  };
  const btn = 'flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 disabled:opacity-50';
  return (
    <div className="flex items-center gap-2">
      <button disabled={disabled} onClick={() => run(exportReportExcel)} className={btn} title="Export to Excel"><FileSpreadsheet size={14} className="text-emerald-600"/> Excel</button>
      <button disabled={disabled} onClick={() => run(exportReportCSV)} className={btn} title="Export to CSV"><FileText size={14} className="text-slate-500"/> CSV</button>
      <button disabled={disabled} onClick={() => run(exportReportPDF)} className={btn} title="Export to PDF"><FileDown size={14} className="text-red-600"/> PDF</button>
      <button disabled={disabled} onClick={() => run(printReport)} className={btn} title="Print"><Printer size={14} className="text-slate-500"/> Print</button>
    </div>
  );
}
