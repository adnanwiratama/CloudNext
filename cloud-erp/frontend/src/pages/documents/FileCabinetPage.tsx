import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, FolderOpen, Download, Trash2, Search } from 'lucide-react';
import api, { downloadFile, previewFile } from '../../services/api';
import toast from 'react-hot-toast';

const EXT_COLORS: Record<string, string> = {
  pdf: 'bg-red-500', png: 'bg-green-500', jpg: 'bg-green-500', jpeg: 'bg-green-500', gif: 'bg-green-500', webp: 'bg-green-500',
  doc: 'bg-blue-500', docx: 'bg-blue-500', xls: 'bg-emerald-500', xlsx: 'bg-emerald-500', csv: 'bg-emerald-500',
  zip: 'bg-amber-500', rar: 'bg-amber-500', txt: 'bg-slate-500',
};
const fmtSize = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function FileCabinetPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [sourceType, setSourceType] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['file-cabinet', folder, sourceType],
    queryFn: () => api.get('/api/files/cabinet', { params: { folder: folder || undefined, sourceType: sourceType || undefined } }).then(r => r.data),
  });

  const files: any[] = (data?.data || []).filter((f: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(f.original_name || '').toLowerCase().includes(q)
      || String(f.title || '').toLowerCase().includes(q)
      || String(f.source_number || '').toLowerCase().includes(q);
  });
  const folders: string[] = data?.folders || [];
  const sourceTypes: string[] = data?.sourceTypes || [];

  const totalSize = files.reduce((s, f) => s + Number(f.file_size || 0), 0);

  const handleDelete = async (f: any) => {
    if (!confirm(`Delete "${f.original_name}"? This removes it from the originating transaction too.`)) return;
    try {
      await api.delete(`/api/files/${f.id}`);
      toast.success('File deleted');
      qc.invalidateQueries({ queryKey: ['file-cabinet'] });
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed to delete'); }
  };

  const labelize = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><FolderOpen size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">File Cabinet</h1>
            <span className="text-sm text-slate-500">All attachments across transactions</span>
          </div>
        </div>
        {/* Toolbar */}
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap border-t border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search file / title / document #"
              className="bg-transparent text-sm outline-none w-64" />
          </div>
          <select value={folder} onChange={e => setFolder(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white">
            <option value="">All Folders</option>
            {folders.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={sourceType} onChange={e => setSourceType(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1 bg-white">
            <option value="">All Transaction Types</option>
            {sourceTypes.map(s => <option key={s} value={s}>{labelize(s)}</option>)}
          </select>
          <button onClick={() => refetch()} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">Refresh</button>
          <div className="ml-auto text-xs text-slate-500">{files.length} file{files.length !== 1 ? 's' : ''} · {fmtSize(totalSize)}</div>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left w-8">#</th>
                  <th className="px-3 py-1.5 text-left">File Name</th>
                  <th className="px-3 py-1.5 text-left">Title</th>
                  <th className="px-3 py-1.5 text-left">Transaction Type</th>
                  <th className="px-3 py-1.5 text-left">Document #</th>
                  <th className="px-3 py-1.5 text-left">Folder</th>
                  <th className="px-3 py-1.5 text-right">Size</th>
                  <th className="px-3 py-1.5 text-left">Uploaded By</th>
                  <th className="px-3 py-1.5 text-left">Date</th>
                  <th className="px-3 py-1.5 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-16 text-center text-slate-400">
                    <FolderOpen className="mx-auto mb-3 text-slate-300" size={40} />
                    No attachments yet. Files attached to any transaction will appear here.
                  </td></tr>
                ) : files.map((f: any, i: number) => {
                  const ext = (f.file_ext || '').toLowerCase();
                  const color = EXT_COLORS[ext] || 'bg-slate-500';
                  return (
                    <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-2xs font-bold flex-shrink-0 ${color}`}>{ext.toUpperCase().slice(0, 3) || '?'}</span>
                          <button onClick={() => previewFile(f.id).catch(() => toast.error('Failed to open file'))} className="text-blue-600 hover:underline truncate max-w-xs text-left">{f.original_name}</button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">{f.title || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{f.source_label || '-'}</td>
                      <td className="px-3 py-1.5">
                        {f.source_number
                          ? (f.source_route
                            ? <button onClick={() => navigate(f.source_route)} className="font-mono text-blue-600 hover:underline">{f.source_number}</button>
                            : <span className="font-mono text-slate-600">{f.source_number}</span>)
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{f.folder || 'Attachments'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{fmtSize(Number(f.file_size || 0))}</td>
                      <td className="px-3 py-1.5 text-slate-500">{f.uploaded_by_name || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{fmtDate(f.created_at)}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => downloadFile(f.id, f.original_name).catch(() => toast.error('Failed to download'))} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50" title="Download"><Download size={12} /></button>
                          <button onClick={() => handleDelete(f)} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
