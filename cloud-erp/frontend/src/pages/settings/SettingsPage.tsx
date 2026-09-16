import { useNavigate } from 'react-router-dom';
import { Building2, Users, MapPin, Tag, DollarSign, Package, Settings, FileText, Shield, Bell } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';

const settingsGroups = [
  {
    title: 'Company',
    items: [
      { label: 'Company Profile', desc: 'Company name, address, logo, fiscal year', icon: <Building2 size={18} />, path: '/settings/company' },
      { label: 'Subsidiaries', desc: 'Manage company subsidiaries', icon: <Building2 size={18} />, path: '/settings/company' },
    ],
  },
  {
    title: 'Users & Security',
    items: [
      { label: 'Users', desc: 'Manage user accounts and access', icon: <Users size={18} />, path: '/settings/users' },
      { label: 'Roles & Permissions', desc: 'Define roles and access levels', icon: <Shield size={18} />, path: '/settings/users' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Locations', desc: 'Manage location setup', icon: <MapPin size={18} />, path: '/settings' },
      { label: 'Departments', desc: 'Organizational departments', icon: <Tag size={18} />, path: '/settings' },
      { label: 'Units of Measure', desc: 'UOM and conversions', icon: <Package size={18} />, path: '/settings' },
    ],
  },
  {
    title: 'Financial',
    items: [
      { label: 'Currencies & Exchange Rates', desc: 'Currency setup and exchange rates', icon: <DollarSign size={18} />, path: '/settings' },
      { label: 'Tax Codes', desc: 'Tax rates and configuration', icon: <FileText size={18} />, path: '/settings' },
      { label: 'Accounting Periods', desc: 'Fiscal year and period management', icon: <Settings size={18} />, path: '/settings' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', desc: 'Email and system notifications', icon: <Bell size={18} />, path: '/settings' },
      { label: 'Audit Trail', desc: 'System activity and audit logs', icon: <FileText size={18} />, path: '/settings' },
    ],
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Settings' }]}
        title="Settings"
        subtitle="Configure your CloudERP system"
      />
      <div className="space-y-6">
        {settingsGroups.map(group => (
          <div key={group.title}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{group.title}</h2>
            <div className="grid grid-cols-3 gap-3">
              {group.items.map(item => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="erp-card p-4 text-left hover:border-blue-300 hover:shadow-card-hover transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800 group-hover:text-blue-700">{item.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
