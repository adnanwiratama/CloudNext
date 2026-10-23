import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Pencil, Globe, Lock, BarChart3 } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

interface SavedReport {
  id: string; name: string; record_type: string; visibility: 'public' | 'private';
  description?: string; created_by_name?: string; created_at: string; updated_at: string; isOwner: boolean;
}

export default function CustomReportList() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['custom-reports'],
    queryFn: () => api.get('/api/reports/custom').then(r => r.data.data as SavedReport[]),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/reports/custom/${id}`),
    onSuccess: () => { toast.success('Report deleted'); qc.invalidateQueries({ queryKey: ['custom-reports'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const reports = data || [];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-600" />
            <h1 className="text-xl font-semibold text-slate-800">Custom Reports</h1>
          </div>
          <button onClick={() => navigate('/analytics/custom-reports/new')}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={15} /> New Report
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto">
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Record Type</th>
                <th className="px-3 py-2 text-left">Visibility</th>
                <th className="px-3 py-2 text-left">Created By</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-right w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><Loader2 size={22} className="animate-spin text-blue-500 mx-auto" /></td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No saved reports yet. Click <span className="text-blue-600 font-medium">New Report</span> to build one.
                </td></tr>
              ) : reports.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                  <td className="px-3 py-2">
                    <button onClick={() => navigate(`/analytics/custom-reports/${r.id}`)} className="text-blue-600 hover:underline font-medium text-left">
                      {r.name}
                    </button>
                    {r.description && <div className="text-xs text-slate-400">{r.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.record_type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    {r.visibility === 'public'
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"><Globe size={11} /> Public</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium"><Lock size={11} /> Private</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.created_by_name || '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(r.updated_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => navigate(`/analytics/custom-reports/${r.id}`)} className="text-slate-500 hover:text-blue-600" title="Open / Run"><BarChart3 size={15} /></button>
                      {r.isOwner && (
                        <>
                          <button onClick={() => navigate(`/analytics/custom-reports/${r.id}/edit`)} className="text-slate-500 hover:text-blue-600" title="Edit"><Pencil size={15} /></button>
                          <button onClick={() => { if (confirm(`Delete report "${r.name}"?`)) del.mutate(r.id); }} className="text-slate-500 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
