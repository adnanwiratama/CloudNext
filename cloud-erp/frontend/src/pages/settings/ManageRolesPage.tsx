import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, Shield } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { RoleModal, countPerms } from './usersRolesShared';

export default function ManageRolesPage() {
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/api/settings/roles').then(r => r.data.data || []),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/roles/${id}`),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete role'),
  });

  const rows: any[] = roles || [];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Shield size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Manage Roles</h1>
            <span className="text-sm text-slate-500">Roles and their permission levels</span>
          </div>
          <button onClick={() => setRoleModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New Role
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Shield size={32} className="mb-3 opacity-30" />
              <p className="text-sm">No roles defined yet.</p>
              <button onClick={() => setRoleModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 mt-3"><Plus size={14} /> Create First Role</button>
            </div>
          ) : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left">Role Name</th>
                  <th className="px-3 py-1.5 text-left">Description</th>
                  <th className="px-3 py-1.5 text-left w-44">Active Permissions</th>
                  <th className="px-3 py-1.5 text-left w-24">System</th>
                  <th className="px-3 py-1.5 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((role: any) => (
                  <tr key={role.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-blue-500" />
                        <button onClick={() => setRoleModal({ open: true, editing: role })} className="font-medium text-blue-600 hover:underline">{role.name}</button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{role.description || '—'}</td>
                    <td className="px-3 py-1.5"><span className="badge badge-blue text-2xs">{countPerms(role)} permissions</span></td>
                    <td className="px-3 py-1.5">{role.is_system ? <span className="badge badge-gray text-2xs">System</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Edit" onClick={() => setRoleModal({ open: true, editing: role })} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Pencil size={13} /></button>
                        {!role.is_system && (
                          <button title="Delete" onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteRoleMutation.mutate(role.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {roleModal.open && (
        <RoleModal
          onClose={() => setRoleModal({ open: false, editing: null })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['roles'] })}
          editing={roleModal.editing}
        />
      )}
    </div>
  );
}
