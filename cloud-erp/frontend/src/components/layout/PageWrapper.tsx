import { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageWrapper - NetSuite-style page container with left margin and action buttons
 * Creates centered content with left-aligned action buttons like Oracle NetSuite
 */
export default function PageWrapper({ children, title, actions, className = '' }: PageWrapperProps) {
  return (
    <div className="min-h-full">
      {/* Page header bar - like NetSuite */}
      {(title || actions) && (
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
          {/* Title */}
          {title && (
            <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span className="text-slate-400">📄</span>
              {title}
            </h1>
          )}
          
          {/* Actions - LEFT SIDE like NetSuite */}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
          
          {/* Spacer untuk push secondary actions ke kanan jika ada */}
          <div className="flex-1" />
        </div>
      )}
      
      {/* Content area with left margin (NetSuite-style centered) */}
      <div className={`px-8 py-4 max-w-[1600px] mx-auto ${className}`}>
        {children}
      </div>
    </div>
  );
}
