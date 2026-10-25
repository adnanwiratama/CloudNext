import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, User } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import toast from 'react-hot-toast';

export default function EmployeeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { departments, locations } = useFormOptions();

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [contactOpen, setContactOpen] = useState(true);
  const [accessOpen, setAccessOpen] = useState(true);

  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/api/settings/roles').then(r => r.data.data || []) });
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];
  // All users — options for the Supervisor dropdown (specific user).
  const { data: allUsers = [] } = useQuery({ queryKey: ['users-for-supervisor'], queryFn: () => api.get('/api/settings/users', { params: { limit: 500 } }).then(r => r.data.data || []) });

  const [form, setForm] = useState({
    employeeNumber: '', name: '', position: '', departmentId: '', locationId: '',
    email: '', phone: '', subsidiaryId: '', supervisorId: '', notes: '',
    giveAccess: false, password: '', confirmPassword: '', roleId: '', isAdmin: false, isActive: true,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Edit mode: load from the users list (no single-user GET endpoint, so pull from list)
  const { data: userList } = useQuery({ queryKey: ['users-for-edit'], queryFn: () => api.get('/api/settings/users').then(r => r.data.data || []), enabled: isEdit });
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!isEdit || initialized || !userList) return;
    const u = (userList as any[]).find((x: any) => x.id === id);
    if (u) {
      setForm(f => ({
        ...f,
        employeeNumber: u.employee_number || '', name: u.name || '', position: u.position || '',
        departmentId: u.department_id || '', locationId: u.location_id || '',
        email: u.email || '', phone: u.phone || '', subsidiaryId: u.subsidiary_id || '', supervisorId: u.supervisor_id || '',
        giveAccess: !!u.is_active, roleId: u.role_id || '', isAdmin: !!u.is_admin, isActive: !!u.is_active,
      }));
      setInitialized(true);
    }
  }, [isEdit, userList, id, initialized]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/settings/users/${id}`, data) : api.post('/api/settings/users', data),
    onSuccess: () => { toast.success(isEdit ? 'Employee updated' : 'Employee created'); navigate('/lists/employees'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save employee'),
  });

  const handleSave = () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (!form.email) { toast.error('Email is required'); return; }
    if (form.giveAccess && !isEdit && !form.password) { toast.error('Password is required when giving access'); return; }
    if (form.giveAccess && form.password && form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    mutation.mutate({
      name: form.name, email: form.email, phone: form.phone || null,
      employeeNumber: form.employeeNumber || null, position: form.position || null,
      departmentId: form.departmentId || null, locationId: form.locationId || null,
      department: departments.find((d: any) => d.id === form.departmentId)?.name || null,
      subsidiaryId: form.subsidiaryId || null, supervisorId: form.supervisorId || null,
      giveAccess: form.giveAccess, isActive: form.giveAccess,
      password: form.password || undefined, roleId: form.giveAccess ? (form.roleId || null) : null,
      isAdmin: form.giveAccess ? form.isAdmin : false,
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><User size={15}/></div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Employee' : 'Employee'}</span>
              {form.name && <span className="text-xl font-semibold text-slate-500">{form.name}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/lists/employees')} className="hover:underline">List</button>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/lists/employees')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div><label className={lbl}>Employee ID</label><input className={dis} value={form.employeeNumber} onChange={e => set('employeeNumber', e.target.value)} placeholder="Auto / optional"/></div>
                  <div><label className={lbl}>Name <span className="text-red-500">*</span></label><input className={dis} value={form.name} onChange={e => set('name', e.target.value)}/></div>
                  <div><label className={lbl}>Job Title</label><input className={dis} value={form.position} onChange={e => set('position', e.target.value)}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Department</label>
                    <select className={sel} value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                      <option value="">-- Select Department --</option>
                      {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Location</label>
                    <select className={sel} value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                      <option value="">-- Select Location --</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Subsidiary</label>
                    <select className={sel} value={form.subsidiaryId} onChange={e => set('subsidiaryId', e.target.value)}>
                      <option value="">-- Select Subsidiary --</option>
                      {subsidiaries.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div><label className={lbl}>Supervisor</label>
                    <select className={sel} value={form.supervisorId} onChange={e => set('supervisorId', e.target.value)}>
                      <option value="">-- Select Supervisor --</option>
                      {(allUsers as any[]).filter((u: any) => u.id !== id).map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}{u.role_name ? ` (${u.role_name})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={lbl}>Notes</label><textarea className={`${dis} resize-none`} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}/></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Email | Phone */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setContactOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {contactOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Email | Phone
          </button>
          {contactOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div><label className={lbl}>Email <span className="text-red-500">*</span></label><input type="email" className={dis} value={form.email} onChange={e => set('email', e.target.value)} disabled={isEdit}/></div>
                <div><label className={lbl}>Phone</label><input className={dis} value={form.phone} onChange={e => set('phone', e.target.value)}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Access */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setAccessOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {accessOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Access
          </button>
          {accessOpen && (
            <div className="px-4 pb-5 border-t border-slate-100 mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.giveAccess} onChange={e => set('giveAccess', e.target.checked)} />
                <span className="font-medium text-slate-700">Give Access</span>
                <span className="text-xs text-slate-400">(allow this employee to log in to the system)</span>
              </label>
              {form.giveAccess && (
                <div className="grid grid-cols-3 gap-x-10 gap-y-4">
                  <div><label className={lbl}>Password {!isEdit && <span className="text-red-500">*</span>}</label>
                    <input type="password" className={dis} value={form.password} onChange={e => set('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep' : ''}/></div>
                  <div><label className={lbl}>Confirm Password</label>
                    <input type="password" className={dis} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}/></div>
                  <div><label className={lbl}>Role <span className="text-red-500">*</span></label>
                    <select className={sel} value={form.roleId} onChange={e => set('roleId', e.target.value)}>
                      <option value="">-- Select Role --</option>
                      {(roles as any[]).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.isAdmin} onChange={e => set('isAdmin', e.target.checked)} />
                      <span className="text-slate-700">Administrator (full access)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : null} Save
          </button>
          <button onClick={() => navigate('/lists/employees')} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
