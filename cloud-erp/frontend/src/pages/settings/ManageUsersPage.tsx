import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, Users } from 'lucide-react';
import api from '../../services/api';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { UserModal } from './usersRolesShared';

export default function ManageUsersPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore(s => s.user);
  const [userModal, setUserModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/settings/users').then(r => r.data.data || []),
  });
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/api/settings/roles').then(r => r.data.data || []),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/users/${id}`),
    onSuccess: () => { toast.success('User removed'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to remove user'),
  });

  const rows: any[] = users || [];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Users size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Manage Users</h1>
            <span className="text-sm text-slate-500">Company users and their access</span>
          </div>
          <button onClick={() => setUserModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New User
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left">Name</th>
                  <th className="px-3 py-1.5 text-left">Email</th>
                  <th className="px-3 py-1.5 text-left w-40">Role</th>
                  <th className="px-3 py-1.5 text-left w-40">Last Login</th>
                  <th className="px-3 py-1.5 text-left w-24">Admin</th>
                  <th className="px-3 py-1.5 text-left w-24">Status</th>
                  <th className="px-3 py-1.5 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No users yet.</td></tr>
                ) : rows.map((user: any) => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <button onClick={() => setUserModal({ open: true, editing: user })} className="font-medium text-blue-600 hover:underline">{user.name}</button>
                        {user.id === currentUser?.id && <span className="badge badge-blue text-2xs">You</span>}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{user.email}</td>
                    <td className="px-3 py-1.5">
                      {user.role_name
                        ? <span className="badge badge-purple text-2xs">{user.role_name}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 text-xs">{formatDate(user.last_login_at)}</td>
                    <td className="px-3 py-1.5">{user.is_admin ? <span className="badge badge-orange text-2xs">Admin</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-1.5"><span className={`badge text-2xs ${user.is_active ? 'badge-green' : 'badge-gray'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Edit" onClick={() => setUserModal({ open: true, editing: user })} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"><Pencil size={13} /></button>
                        {user.id !== currentUser?.id && (
                          <button title="Remove" onClick={() => { if (confirm(`Remove user ${user.name}?`)) deleteUserMutation.mutate(user.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={13} /></button>
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

      {userModal.open && (
        <UserModal
          onClose={() => setUserModal({ open: false, editing: null })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['users'] })}
          roles={roles}
          editing={userModal.editing}
        />
      )}
    </div>
  );
}
