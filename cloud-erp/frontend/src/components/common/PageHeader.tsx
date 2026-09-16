import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  subtitle?: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}

export default function PageHeader({ breadcrumbs, title, subtitle, status, actions, badge }: PageHeaderProps) {
  return (
    <div className="mb-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="breadcrumb mb-2">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="breadcrumb-sep" />}
              {b.path ? (
                <Link to={b.path} className="breadcrumb-item hover:text-blue-600">{b.label}</Link>
              ) : (
                <span className="text-slate-700">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          {status}
          {badge}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
