/**
 * TransactionFileUploadRow — reusable multi-row file picker used in Entry Forms
 * before the record is saved. Files are uploaded after save via onUpload callback.
 */
export interface FileRow {
  id:          string;
  file:        File | null;
  title:       string;
  description: string;
  folder:      string;
}

interface Props {
  rows:    FileRow[];
  setRows: React.Dispatch<React.SetStateAction<FileRow[]>>;
}

const FOLDERS = ['Attachments','Invoices','Receipts','Contracts','Other'];

const extColor = (type: string) =>
  /pdf/.test(type)         ? 'bg-red-500'     :
  /image/.test(type)       ? 'bg-green-500'   :
  /word|doc/.test(type)    ? 'bg-blue-500'    :
  /excel|sheet|xls/.test(type) ? 'bg-emerald-500' : 'bg-slate-500';

export default function TransactionFileUploadRow({ rows, setRows }: Props) {
  const addRow = () =>
    setRows(r => [...r, { id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const removeRow = (id: string) => setRows(r => r.filter(x => x.id !== id));

  const update = (id: string, key: keyof FileRow, val: any) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [key]: val } : x));

  return (
    <div>
      {/* Attach button */}
      <div className="mb-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 border border-blue-300 text-blue-700 text-xs font-medium rounded hover:bg-blue-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Attach File
          <input type="file" multiple className="hidden" onChange={e => {
            Array.from(e.target.files || []).forEach(f => {
              setRows(r => [...r, { id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`, file: f, title: f.name, description: '', folder: 'Attachments' }]);
            });
          }}/>
        </label>
        <span className="text-xs text-slate-400">Max 50MB. PDF, Word, Excel, Image, ZIP.</span>
      </div>

      <div className="border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">File</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Title</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Description</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Folder</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Size</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-12">Del</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">No files. Click "Attach File" to add.</td></tr>
            ) : rows.map((row, idx) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-400">{idx+1}</td>
                <td className="px-3 py-1.5">
                  {row.file ? (
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold flex-shrink-0 ${extColor(row.file.type)}`}>
                        {row.file.name.split('.').pop()?.toUpperCase().slice(0,3)||'?'}
                      </span>
                      <span className="text-slate-700 truncate max-w-[180px]">{row.file.name}</span>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1 cursor-pointer text-blue-600 hover:text-blue-800">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Choose file...
                      <input type="file" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) update(row.id, 'file', f);
                        if (f && !row.title) update(row.id, 'title', f.name);
                      }}/>
                    </label>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input value={row.title} onChange={e => update(row.id, 'title', e.target.value)}
                    className="w-full border border-slate-200 rounded px-2 py-0.5 text-xs" placeholder="Title..."/>
                </td>
                <td className="px-3 py-1.5">
                  <input value={row.description} onChange={e => update(row.id, 'description', e.target.value)}
                    className="w-full border border-slate-200 rounded px-2 py-0.5 text-xs" placeholder="Description..."/>
                </td>
                <td className="px-3 py-1.5">
                  <select value={row.folder} onChange={e => update(row.id, 'folder', e.target.value)}
                    className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs bg-white">
                    {FOLDERS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right text-slate-500">
                  {row.file ? (row.file.size>1024*1024?`${(row.file.size/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(row.file.size/1024))} KB`) : '-'}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow}
        className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Row
      </button>
    </div>
  );
}

// Helper: upload all pending file rows after save
export async function uploadFileRows(
  rows: FileRow[],
  sourceType: string,
  sourceId: string,
  apiPost: (url: string, data: any, config?: any) => Promise<any>
): Promise<void> {
  const toUpload = rows.filter(r => r.file);
  if (!toUpload.length) return;
  const fd = new FormData();
  fd.append('sourceType', sourceType);
  fd.append('sourceId', sourceId);
  toUpload.forEach(r => {
    fd.append('files', r.file!);
    fd.append('titles', r.title || r.file!.name);
    fd.append('descriptions', r.description || '');
    fd.append('folder', r.folder || 'Attachments');
  });
  await apiPost('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
}
