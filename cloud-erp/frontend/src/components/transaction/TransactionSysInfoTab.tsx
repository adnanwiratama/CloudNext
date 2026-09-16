/**
 * TransactionSysInfoTab — reusable System Information (audit log) tab
 * Shows Date, Set by, Context, Type, Field, Old Value, New Value
 */
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

interface Props {
  auditEndpoint: string; // e.g. '/api/bank/checks/:id/audit' or '/api/sales/orders/:id/audit'
  queryKey:      string[];
}

export default function TransactionSysInfoTab({ auditEndpoint, queryKey }: Props) {
  const { data: raw } = useQuery({
    queryKey,
    queryFn:  () => api.get(auditEndpoint).then(r => r.data.data || []),
    staleTime: 0,
  });
  const logs: any[] = raw || [];

  return (
    <div>
      <div className="border border-slate-200 rounded overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Date / Time</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Set by</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Context</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Type</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Field</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Old Value</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">New Value</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">No activity recorded</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">
                  {new Date(log.performed_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </td>
                <td className="px-3 py-2 text-slate-700">{log.performed_by_name||'-'}</td>
                <td className="px-3 py-2 text-slate-500">{log.context||'System'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded-full font-medium ${
                    log.change_type==='Set'?'bg-green-100 text-green-700':
                    log.change_type==='Change'?'bg-blue-100 text-blue-700':
                    log.action==='created'?'bg-green-100 text-green-700':'bg-slate-100 text-slate-600'
                  }`}>
                    {log.change_type || (log.action==='created'?'Set':'Change')}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{log.field_name || (log.description?.split(':')[0]) || log.action || '-'}</td>
                <td className="px-3 py-2">
                  {log.old_value ? <span className="text-red-600">{log.old_value}</span> : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-3 py-2">
                  {log.new_value ? <span className="text-green-700 font-medium">{log.new_value}</span> : <span className="text-slate-400">{log.description||'-'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
