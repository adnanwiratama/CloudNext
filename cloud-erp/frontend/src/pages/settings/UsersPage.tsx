import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import { formatDate } from '../../utils/format';

export default function UsersPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/settings/users').then(r => r.data.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/api/settings/roles').then(r => r.data.data),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Settings', path: '/settings' }, { label: 'Users' }]}
        title="Users"
        subtitle={`${(users || []).length} users`}
        actions={<button className="btn-primary btn-sm"><Plus size={13} /> New User</button>}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="erp-card">
            {isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Last Login</th>
                    <th>Admin</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((user: any) => (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {user.name?.charAt(0)}
                          </div>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="text-slate-600">{user.email}</td>
                      <td>{user.role_name || '-'}</td>
                      <td className="text-slate-500 text-xs">{formatDate(user.last_login_at)}</td>
                      <td>{user.is_admin && <span className="badge badge-purple text-2xs">Admin</span>}</td>
                      <td><span className={user.is_active ? 'badge badge-green text-2xs' : 'badge badge-gray text-2xs'}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="erp-card">
            <div className="form-section-title">Roles</div>
            <div className="divide-y divide-slate-100">
              {(roles || []).map((role: any) => (
                <div key={role.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{role.name}</div>
                    <div className="text-xs text-slate-500">{role.description}</div>
                  </div>
                  {role.is_system && <span className="badge badge-blue text-2xs">System</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
