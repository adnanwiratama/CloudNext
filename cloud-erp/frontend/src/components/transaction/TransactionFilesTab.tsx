/**
 * TransactionFilesTab — reusable Files tab for all transaction detail pages
 * Shows uploaded files, allows attach/download/delete
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { downloadFile, previewFile } from '../../services/api';

interface Props {
  sourceType: string;  // 'bank_check' | 'sales_order' | 'invoice' | etc.
  sourceId:   string;
}

const EXT_COLORS: Record<string, string> = {
  pdf: 'bg-red-500', png: 'bg-green-500', jpg: 'bg-green-500',
  jpeg: 'bg-green-500', gif: 'bg-green-500', webp: 'bg-green-500',
  doc: 'bg-blue-500', docx: 'bg-blue-500',
  xls: 'bg-emerald-500', xlsx: 'bg-emerald-500', csv: 'bg-emerald-500',
};

export default function TransactionFilesTab({ sourceType, sourceId }: Props) {
  const qc = useQueryClient();

  const { data: filesRaw, refetch } = useQuery({
    queryKey: ['txn-files', sourceType, sourceId],
    queryFn:  () => api.get(`/api/files?sourceType=${sourceType}&sourceId=${sourceId}`).then(r => r.data.data || []),
    enabled:  !!sourceId,
    staleTime: 0,
  });
  const files: any[] = filesRaw || [];

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    const fd = new FormData();
    fd.append('sourceType', sourceType);
    fd.append('sourceId', sourceId);
    selected.forEach(f => { fd.append('files', f); fd.append('titles', f.name); fd.append('descriptions', ''); });
    fd.append('folder', 'Attachments');
    try {
      await api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      refetch();
      qc.invalidateQueries({ queryKey: ['txn-files', sourceType, sourceId] });
    } catch (err: any) { alert('Upload failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDelete = async (f: any) => {
    if (!confirm(`Delete "${f.original_name}"?`)) return;
    await api.delete(`/api/files/${f.id}`);
    refetch();
  };

  return (
    <div>
      {/* Attach button */}
      <div className="mb-3 flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 border border-blue-300 text-blue-700 text-xs font-medium rounded hover:bg-blue-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Attach File
          <input type="file" multiple className="hidden" onChange={handleAttach}/>
        </label>
        <span className="text-xs text-slate-400">Max 50MB. PDF, Word, Excel, Image, ZIP supported.</span>
      </div>

      {/* Files table */}
      <div className="border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">File Name</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Title</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Folder</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Size</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Uploaded By</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Date</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400 italic">No files attached. Click "Attach File" to upload.</td></tr>
            ) : files.map((f: any, i: number) => {
              const ext = (f.file_ext || '').toLowerCase();
              const color = EXT_COLORS[ext] || 'bg-slate-500';
              return (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{i+1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold flex-shrink-0 ${color}`}>
                        {ext.toUpperCase().slice(0,3)||'?'}
                      </span>
                      <button onClick={() => previewFile(f.id).catch(() => alert('Failed to open file'))}
                        className="text-blue-600 hover:underline truncate max-w-xs text-left">{f.original_name}</button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{f.title||'-'}</td>
                  <td className="px-3 py-2 text-slate-500">{f.folder||'Attachments'}</td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {f.file_size > 1024*1024 ? `${(f.file_size/1024/1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.file_size/1024))} KB`}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{f.uploaded_by_name||'-'}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {new Date(f.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => downloadFile(f.id, f.original_name).catch(() => alert('Failed to download'))}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                        title="Download">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                      </button>
                      <button onClick={() => handleDelete(f)} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
