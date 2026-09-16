/**
 * TransactionGLTab — reusable GL Impact tab for all transaction detail pages
 */
interface GLRow {
  lineNum:     number;
  accountCode: string;
  accountName: string;
  debit:       number;
  credit:      number;
  dept?:       string;
  loc?:        string;
  memo?:       string;
  type?:       string;
}

interface Props {
  rows:              GLRow[];
  journalEntry?:     { id: string; journal_number: string; status: string } | null;
  onClickJournal?:   (id: string) => void;
}

export default function TransactionGLTab({ rows, journalEntry, onClickJournal }: Props) {
  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const isBalanced  = rows.length > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div>
      {/* Posting field */}
      <div className="mb-3 flex items-center gap-4">
        <span className="text-xs text-slate-500 font-medium">Posting:</span>
        {journalEntry ? (
          <button onClick={() => onClickJournal?.(journalEntry.id)}
            className="text-xs text-blue-600 hover:underline font-medium">
            {journalEntry.journal_number}
          </button>
        ) : <span className="text-xs text-slate-400">Not posted</span>}
        {isBalanced
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">✓ Balanced</span>
          : rows.length > 0
            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-medium">⚠ Unbalanced</span>
            : null
        }
      </div>

      <div className="border border-slate-200 rounded overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-12">#</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Code</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Debit</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Credit</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400 italic text-xs">No GL entries. Save the transaction to generate GL impact.</td></tr>
            ) : rows.map(r => (
              <tr key={r.lineNum} className={`border-t border-slate-100 ${r.type==='bank'?'bg-blue-50/40':r.type==='tax'?'bg-amber-50/40':''}`}>
                <td className="px-3 py-1.5 text-slate-400">{r.lineNum}</td>
                <td className="px-3 py-1.5 font-mono text-slate-500">{r.accountCode||'-'}</td>
                <td className="px-3 py-1.5 font-medium text-slate-700">{r.accountName}</td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-800">
                  {r.debit>0 ? r.debit.toLocaleString('id-ID',{minimumFractionDigits:2}) : ''}
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-800">
                  {r.credit>0 ? r.credit.toLocaleString('id-ID',{minimumFractionDigits:2}) : ''}
                </td>
                <td className="px-3 py-1.5 text-slate-500">{r.dept||'-'}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.loc||'-'}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.memo||'-'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td colSpan={3} className="px-3 py-2 text-right text-slate-600 text-xs">TOTAL</td>
                <td className="px-3 py-2 text-right text-slate-800">{totalDebit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                <td className="px-3 py-2 text-right text-slate-800">{totalCredit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
