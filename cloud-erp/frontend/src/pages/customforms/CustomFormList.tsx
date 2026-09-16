import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Settings, Copy, Trash2, Loader2 } from 'lucide-react';
import api from '../../services/api';

export default function CustomFormList() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['custom-forms'],
    queryFn: () => api.get('/api/custom-forms').then(r => r.data.data || []),
  });

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete form "${name}"?`)) return;
    await api.delete(`/api/custom-forms/${id}`);
    refetch();
  };

  const handleCopy = async (id: string) => {
    await api.post(`/api/custom-forms/${id}/copy`, {});
    refetch();
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={28}/></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Custom Transaction Forms</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage custom form layouts and fields for transactions</p>
          </div>
          <button onClick={() => navigate('/customization/forms/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14}/> New Form
          </button>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto p-4">
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Form Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Module</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Version</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                  No custom forms yet. Click "New Form" to create one.
                </td></tr>
              ) : data.map((form: any) => (
                <tr key={form.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/customization/forms/${form.id}`)}
                      className="text-blue-600 hover:underline font-medium">{form.name}</button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{form.code}</td>
                  <td className="px-4 py-3 text-slate-700 capitalize">{form.module?.replace(/_/g,' ') || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{form.transaction_type || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {form.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{form.version || 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => navigate(`/customization/forms/${form.id}`)} title="Edit" className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Settings size={14}/></button>
                      <button onClick={() => handleCopy(form.id)} title="Copy" className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded"><Copy size={14}/></button>
                      <button onClick={() => handleDelete(form.id, form.name)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
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
