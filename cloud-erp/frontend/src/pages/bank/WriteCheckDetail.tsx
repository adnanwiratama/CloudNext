import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2, Printer, CheckCircle2, Send, CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import DeleteTransactionButton from '../../components/transaction/DeleteTransactionButton';
import EditTransactionButton from '../../components/transaction/EditTransactionButton';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';

export default function WriteCheckDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();
  const qc         = useQueryClient();
  const justSaved  = (location.state as any)?.justSaved === true;

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen,   setClassOpen]   = useState(true);
  const [activeTab,   setActiveTab]   = useState<'expenses'|'files'|'gl'|'sysinfo'>('expenses');
  const [lineSubTab,  setLineSubTab]  = useState<'exp'|'items'>('exp');

  useEffect(() => {
    if (justSaved && id) qc.invalidateQueries({ queryKey: ['check', id] });
  }, [justSaved, id, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ['check', id],
    queryFn:  () => api.get(`/api/bank/checks/${id}`).then(r => r.data.data),
    enabled:  !!id, staleTime: 0, refetchOnMount: true,
  });

  const { data: auditRaw } = useQuery({
    queryKey: ['check-audit', id],
    queryFn:  () => api.get(`/api/bank/checks/${id}/audit`).then(r => r.data.data || []),
    enabled:  !!id, staleTime: 0,
  });
  const auditLogs: any[] = auditRaw || [];

  const { data: filesRaw, refetch: refetchFiles } = useQuery({
    queryKey: ['check-files', id],
    queryFn:  () => api.get(`/api/files?sourceType=bank_check&sourceId=${id}`).then(r => r.data.data || []),
    enabled:  !!id, staleTime: 0,
  });
  const attachedFiles: any[] = filesRaw || [];

  const user = useAuthStore(s => s.user);

  // ── Approval mutations ─────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: () => api.post(`/api/bank/checks/${id}/submit`),
    onSuccess: () => { toast.success('Submitted for approval'); qc.invalidateQueries({ queryKey: ['check', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/bank/checks/${id}/approve`),
    onSuccess: () => { toast.success('Check approved — GL posted'); qc.invalidateQueries({ queryKey: ['check', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/api/bank/checks/${id}/reject`, { reason: 'Rejected by approver' }),
    onSuccess: () => { toast.success('Check rejected — returned to Draft'); qc.invalidateQueries({ queryKey: ['check', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  // Who can approve/reject? Configured approver or admin
  const canApproveReject = user?.isAdmin || (data?.configured_approver_id && user?.id === data.configured_approver_id);

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!data) return;
    const amt  = parseFloat(data.amount) || 0;
    const dt   = data.check_date ? new Date(data.check_date).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '';
    const exp  = (data.lines||[]);
    const itms = (data.itemLines||[]);

    const expTable = exp.length > 0 ? `
      <div style="margin-top:14px"><b>— EXPENSES —</b>
      <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:6px">
        <thead><tr>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0">Account</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0;text-align:right">Amount</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0">Tax</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0">Memo</th>
        </tr></thead><tbody>
        ${exp.map((l:any)=>`<tr><td style="border:1px solid #ddd;padding:3px">${l.account_name||'-'}</td><td style="border:1px solid #ddd;padding:3px;text-align:right">${Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td><td style="border:1px solid #ddd;padding:3px">${l.tax_code||'-'}</td><td style="border:1px solid #ddd;padding:3px">${l.memo||'-'}</td></tr>`).join('')}
        </tbody></table></div>` : '';

    const itmTable = itms.length > 0 ? `
      <div style="margin-top:14px"><b>— ITEMS —</b>
      <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:6px">
        <thead><tr>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0">Item</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0;text-align:right">Qty</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0;text-align:right">Rate</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0;text-align:right">Amount</th>
          <th style="border:1px solid #ccc;padding:4px;background:#f0f0f0">Memo</th>
        </tr></thead><tbody>
        ${itms.map((l:any)=>`<tr><td style="border:1px solid #ddd;padding:3px">${l.item_name||'-'}</td><td style="border:1px solid #ddd;padding:3px;text-align:right">${l.quantity}</td><td style="border:1px solid #ddd;padding:3px;text-align:right">${Number(l.unit_price).toLocaleString('id-ID',{minimumFractionDigits:2})}</td><td style="border:1px solid #ddd;padding:3px;text-align:right">${Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td><td style="border:1px solid #ddd;padding:3px">${l.memo||'-'}</td></tr>`).join('')}
        </tbody></table></div>` : '';

    const html = `<!DOCTYPE html><html><head><title>Check #${data.check_number}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}
      .co{font-size:18px;font-weight:bold}.body{border:1px solid #aaa;padding:16px;margin-bottom:14px}
      .amt-box{border:2px solid #000;padding:4px 12px;font-size:15px;font-weight:bold}
      .payrow{display:flex;gap:8px;align-items:flex-end;margin-bottom:12px}
      .payline{border-bottom:1px solid #000;flex:1;font-size:13px;font-weight:bold;padding:2px 4px;min-height:20px}
      .wordrow{display:flex;gap:8px;align-items:flex-end;margin-bottom:16px}
      .wordline{border-bottom:1px solid #000;flex:1;padding:2px 4px;min-height:18px}
      .bot{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #ccc;padding-top:10px}
      .sig{border-top:1px solid #000;width:180px;text-align:center;padding-top:4px;font-size:10px}
      @media print{@page{size:A4 landscape;margin:15mm}}</style></head>
      <body>
        <div class="hdr">
          <div><div class="co">Cloud Manufacturing Indonesia</div><div style="color:#666;margin-top:3px">${data.bank_account_name||''}</div></div>
          <div style="text-align:right"><div style="font-size:13px;font-weight:bold">CHECK No. ${data.check_number}</div><div style="margin-top:3px">Date: ${dt}</div></div>
        </div>
        <div class="body">
          <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
            <span style="font-weight:bold;margin-right:8px">AMOUNT:</span>
            <div class="amt-box">IDR ${amt.toLocaleString('id-ID',{minimumFractionDigits:2})}</div>
          </div>
          <div class="payrow"><span style="font-weight:bold;white-space:nowrap">PAY TO THE ORDER OF</span><div class="payline">${data.vendor_name||data.pay_to||''}</div></div>
          <div class="wordrow"><span style="min-width:110px;font-size:10px;color:#555">AMOUNT IN WORDS</span><div class="wordline">${numberToWords(amt)} Rupiah Only</div><span style="border:1px solid #000;padding:2px 8px;font-weight:bold">IDR ${amt.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
          <div class="bot">
            <div style="display:flex;gap:8px;align-items:flex-end"><span style="font-weight:bold;font-size:10px">MEMO:</span><div style="border-bottom:1px solid #000;min-width:200px;padding:2px 4px">${data.memo||''}</div></div>
            <div class="sig">Authorized Signature</div>
          </div>
        </div>
        ${expTable}${itmTable}
      </body></html>`;

    const win = window.open('','_blank','width=950,height=700');
    if (!win) { alert('Allow popups to print'); return; }
    win.document.open(); win.document.write(html); win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!data)     return <div className="p-6 text-red-600">Check not found.</div>;

  const checkDate  = data.check_date ? new Date(data.check_date).toISOString().split('T')[0] : '';
  const amount     = parseFloat(data.amount) || 0;
  const expLines   : any[] = data.lines     || [];
  const itmLines   : any[] = data.itemLines || [];
  const dis = "w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700 cursor-default select-none";

  // ── GL rows ────────────────────────────────────────────────────────────────
  const totalExpAmt  = expLines.reduce((s:number,l:any)=>s+Number(l.amount||0),0);
  const totalExpTax  = expLines.reduce((s:number,l:any)=>s+Number(l.tax_amt||0),0);
  const totalItmAmt  = itmLines.reduce((s:number,l:any)=>s+Number(l.amount||0),0);
  const totalItmTax  = itmLines.reduce((s:number,l:any)=>s+Number(l.tax_amt||0),0);
  const totalTax     = totalExpTax + totalItmTax;
  const bankCredit   = totalExpAmt + totalExpTax + totalItmAmt + totalItmTax;

  const rawGl = [
    ...expLines.map((l:any)=>({ accountCode:l.account_code||'', accountName:l.account_name||'-', debit:Number(l.amount||0), credit:0, dept:l.department_name||data.department_name||'-', loc:l.location_name||data.location_name||'-', memo:l.memo||'', type:'exp' })),
    ...(totalExpTax>0 ? [{ accountCode:'2300', accountName:'Tax Payable - PPN', debit:totalExpTax, credit:0, dept:data.department_name||'-', loc:data.location_name||'-', memo:'PPN Input Tax (Expenses)', type:'tax' }] : []),
    ...itmLines.map((l:any)=>({ accountCode:l.inventory_account_code||'', accountName:l.inventory_account_name||l.item_name||'-', debit:Number(l.amount||0), credit:0, dept:l.department_name||data.department_name||'-', loc:l.location_name||data.location_name||'-', memo:`${l.item_name||''} ${l.memo||''}`.trim(), type:'item' })),
    ...(totalItmTax>0 ? [{ accountCode:'2300', accountName:'Tax Payable - PPN', debit:totalItmTax, credit:0, dept:data.department_name||'-', loc:data.location_name||'-', memo:'PPN Input Tax (Items)', type:'tax' }] : []),
    ...(bankCredit>0 ? [{ accountCode:data.bank_account_code||'', accountName:data.bank_account_name||'-', debit:0, credit:bankCredit, dept:data.department_name||'-', loc:data.location_name||'-', memo:`Bank payment - ${data.check_number}`, type:'bank' }] : []),
  ].map((gl, i) => ({ ...gl, lineNum: i+1 }));

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white font-bold text-sm">✓</div>
              <span className="text-2xl font-bold text-slate-800">Check</span>
              <span className="text-2xl font-semibold text-slate-500">{data.check_number}</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/bank/checks-list')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=bank_check')} className="hover:underline">Customize</button>
              <span className="hover:underline cursor-pointer">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-8 py-2 flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="check" to={`/bank/checks/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800"><Printer size={13}/> Print</button>
          <DeleteTransactionButton type="bank_check" id={id!} listPath="/bank/checks-list" label={data.check_number} />
          
          {/* Approval buttons */}
          {data.approval_status === 'draft' && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-60">
              {submitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Submit for Approval
            </button>
          )}
          {data.approval_status === 'pending_approval' && canApproveReject && (
            <>
              <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-60">
                {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Approve
              </button>
              <button onClick={() => { if (confirm('Reject this check?')) rejectMutation.mutate(); }} disabled={rejectMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-60">
                {rejectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

        {/* Confirmation */}
        {justSaved && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-green-800">Confirmation</p>
              <p className="text-sm text-green-700 mt-0.5">Transaction successfully Saved</p>
            </div>
          </div>
        )}

        {/* Primary Information */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
          </button>
          {primaryOpen && (
            <div className="px-4 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Transaction Number</div>
                    <div className="text-sm font-medium text-blue-700 font-mono">{data.check_number}</div>
                  </div>
                  <div><label className="block text-xs text-slate-500 mb-1">Account</label><input readOnly value={data.bank_account_name||''} className={dis}/></div>
                  <div><div className="text-xs text-slate-500 mb-0.5">Balance</div><div className="text-sm font-medium text-slate-800">0.00</div></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Payee</label><input readOnly value={data.vendor_name||data.pay_to||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Amount</label><input readOnly value={amount>0?amount.toLocaleString('id-ID',{minimumFractionDigits:2}):''} placeholder="0.00" className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Tax</label><input readOnly value={totalTax>0?totalTax.toLocaleString('id-ID',{minimumFractionDigits:2}):''} placeholder="0.00" className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Date</label><input readOnly value={checkDate} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Posting Period</label><input readOnly value={data.posting_period_name||''} className={dis}/></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Check #</label><input readOnly value={data.check_number_manual||data.check_number||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Memo</label><input readOnly value={data.memo||''} className={dis}/></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Approved By</label><input readOnly value={data.approved_by_name||data.configured_approver_name||'—'} className={dis}/></div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Approval Status</label>
                    <div className={`w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 font-medium ${
                      data.approval_status==='approved'?'text-emerald-600':
                      data.approval_status==='pending_approval'?'text-amber-600':
                      data.approval_status==='rejected'?'text-red-600':'text-slate-600'
                    }`}>
                      {data.approval_status==='approved'?'Approved':
                       data.approval_status==='pending_approval'?'Pending Approval':
                       data.approval_status==='rejected'?'Rejected':'Draft'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          <button onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
          </button>
          {classOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-x-10 mt-3">
                <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label><input readOnly value={data.subsidiary_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Department</label><input readOnly value={data.department_name||''} className={dis}/></div>
                <div><label className="block text-xs text-slate-500 mb-1">Location</label><input readOnly value={data.location_name||''} className={dis}/></div>
              </div>
            </div>
          )}
        </div>

        {/* Expenses & Items + GL + System Info */}
        <div className="bg-white border border-slate-200 rounded shadow-sm">
          {/* Main tabs */}
          <div className="border-b border-slate-200 px-4 flex">
            {(['expenses','files','gl','sysinfo'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab==='expenses'?'Expenses & Items': tab==='files'?`Files${attachedFiles.length>0?` (${attachedFiles.length})`:''}`: tab==='gl'?'GL Impact':'System Information'}
              </button>
            ))}
          </div>

          {/* Sub-tabs for Expenses & Items */}
          {activeTab === 'expenses' && (
            <div className="px-4 pt-2 pb-0 border-b border-slate-100 flex gap-6">
              <button onClick={() => setLineSubTab('exp')}
                className={`text-sm pb-1.5 border-b-2 font-medium transition-colors ${lineSubTab==='exp'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                Expenses {totalExpAmt>0?totalExpAmt.toLocaleString('id-ID',{minimumFractionDigits:2}):'0.00'}
              </button>
              <button onClick={() => setLineSubTab('items')}
                className={`text-sm pb-1.5 border-b-2 font-medium transition-colors ${lineSubTab==='items'?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                Items {totalItmAmt>0?totalItmAmt.toLocaleString('id-ID',{minimumFractionDigits:2}):'0.00'}
              </button>
            </div>
          )}

          <div className="p-3">

            {/* ── Expenses subtab ── */}
            {activeTab==='expenses' && lineSubTab==='exp' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-52">Account</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Tax Rate</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax Amt</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Gross Amt</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Memo</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expLines.length===0 ? (
                      <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400 text-xs italic">No expense lines</td></tr>
                    ) : expLines.map((l:any,i:number)=>(
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{l.account_name||'-'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.tax_code||'-'}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{Number(l.tax_rate)>0?`${l.tax_rate}%`:'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{Number(l.tax_amt||0)>0?Number(l.tax_amt).toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{Number(l.gross_amt||l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.memo||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name||l.location_id||'-'}</td>
                      </tr>
                    ))}
                    {expLines.length>0&&(
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td className="px-3 py-1.5 text-slate-700">Total</td>
                        <td className="px-3 py-1.5 text-right text-slate-800">{totalExpAmt.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td colSpan={7}/>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Items subtab ── */}
            {activeTab==='expenses' && lineSubTab==='items' && (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-16">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Rate</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Tax Rate</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Tax Amt</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Gross Amt</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Memo</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itmLines.length===0 ? (
                      <tr><td colSpan={13} className="px-3 py-4 text-center text-slate-400 text-xs italic">No item lines</td></tr>
                    ) : itmLines.map((l:any,i:number)=>(
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{l.item_name||l.item_code||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.description||'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{Number(l.quantity).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.unit||'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{Number(l.unit_price||0).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800">{Number(l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.tax_code||'-'}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{Number(l.tax_rate||0)>0?`${l.tax_rate}%`:'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{Number(l.tax_amt||0)>0?Number(l.tax_amt).toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{Number(l.gross_amt||l.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-1.5 text-slate-600">{l.memo||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.department_name||'-'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.location_name||'-'}</td>
                      </tr>
                    ))}
                    {itmLines.length>0&&(
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td colSpan={5} className="px-3 py-1.5 text-right text-slate-700">Total</td>
                        <td className="px-3 py-1.5 text-right text-slate-800">{totalItmAmt.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                        <td colSpan={7}/>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Files tab ── */}
            {activeTab==='files' && (
              <div>
                {/* Upload new file in detail view */}
                <div className="mb-3 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 border border-blue-300 text-blue-700 text-xs rounded hover:bg-blue-50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Attach File
                    <input type="file" multiple className="hidden" onChange={async e => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      const formData = new FormData();
                      formData.append('sourceType', 'bank_check');
                      formData.append('sourceId', id!);
                      files.forEach(f => { formData.append('files', f); formData.append('titles', f.name); formData.append('descriptions', ''); });
                      formData.append('folder', 'Attachments');
                      try {
                        await api.post('/api/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                        refetchFiles();
                      } catch (err: any) { alert('Upload failed: ' + (err.response?.data?.error || err.message)); }
                    }}/>
                  </label>
                  <span className="text-xs text-slate-400">Max 50MB per file. PDF, Word, Excel, Image, ZIP supported.</span>
                </div>

                {/* Files table */}
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">File Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Title</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Folder</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Size</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Uploaded By</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Date</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachedFiles.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400 italic">
                          No files attached. Click "Attach File" to upload.
                        </td></tr>
                      ) : attachedFiles.map((f: any, i: number) => {
                        const ext = f.file_ext?.toLowerCase() || '';
                        const iconColor = ext==='pdf'?'bg-red-500':['png','jpg','jpeg','gif','webp'].includes(ext)?'bg-green-500':['doc','docx'].includes(ext)?'bg-blue-500':['xls','xlsx','csv'].includes(ext)?'bg-emerald-500':'bg-slate-500';
                        return (
                          <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-400">{i+1}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold flex-shrink-0 ${iconColor}`}>
                                  {ext.toUpperCase().slice(0,3)||'?'}
                                </span>
                                <a href={`/api/files/${f.id}/preview`} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline truncate max-w-xs">{f.original_name}</a>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{f.title||'-'}</td>
                            <td className="px-3 py-2 text-slate-500">{f.folder||'Attachments'}</td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {f.file_size > 1024*1024 ? `${(f.file_size/1024/1024).toFixed(1)} MB` : `${Math.round(f.file_size/1024)||1} KB`}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{f.uploaded_by_name||'-'}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                              {new Date(f.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-2">
                                <a href={`/api/files/${f.id}/download`}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                                  title="Download">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                  Download
                                </a>
                                <button onClick={async () => {
                                  if (!confirm(`Delete "${f.original_name}"?`)) return;
                                  await api.delete(`/api/files/${f.id}`);
                                  refetchFiles();
                                }} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Delete">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── GL Impact ── */}
            {activeTab==='gl' && (
              <div>
                {/* Posting badge based on approval_status */}
                <div className="mb-3 flex items-center gap-3 px-1">
                  <span className="text-sm font-medium text-slate-700">Posting:</span>
                  {data.journalEntry ? (
                    <a href={`/accounting/journals/${data.journalEntry.id}`}
                      onClick={e => { e.preventDefault(); navigate(`/accounting/journals/${data.journalEntry.id}`); }}
                      className="font-mono text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium">
                      {data.journalEntry.journal_number}
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400 italic">No journal entry</span>
                  )}
                  {/* Posting badge: non_posting when draft/pending/rejected, posted when approved */}
                  {data.approval_status === 'approved' ? (
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">Posted</span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium bg-amber-100 text-amber-700">Non-Posting</span>
                  )}
                </div>

                <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Account Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56">Account Name</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Debit</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Credit</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Posting</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawGl.map((gl:any,i:number)=>(
                      <tr key={i} className={`border-t border-slate-100 ${gl.type==='bank'?'bg-blue-50/30':gl.type==='tax'?'bg-yellow-50/30':''}`}>
                        <td className="px-3 py-1.5 text-slate-500">{gl.lineNum}</td>
                        <td className="px-3 py-1.5 text-slate-600 font-mono text-xs">{gl.accountCode}</td>
                        <td className="px-3 py-1.5 text-slate-700 font-medium">{gl.accountName}</td>
                        <td className="px-3 py-1.5 text-right text-slate-800 font-medium">{gl.debit>0?gl.debit.toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                        <td className="px-3 py-1.5 text-right text-slate-800 font-medium">{gl.credit>0?gl.credit.toLocaleString('id-ID',{minimumFractionDigits:2}):''}</td>
                        <td className="px-3 py-1.5 text-slate-500">{gl.dept}</td>
                        <td className="px-3 py-1.5 text-slate-500">{gl.loc}</td>
                        <td className="px-3 py-1.5 text-center">
                          {data.approval_status === 'approved' ? (
                            <span className="inline-flex px-1.5 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">Yes</span>
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 text-xs rounded-full font-medium bg-amber-100 text-amber-700">No</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{gl.memo}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-xs">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">Total</td>
                      <td className="px-3 py-1.5 text-right text-slate-800">{rawGl.reduce((s:number,l:any)=>s+l.debit,0).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-1.5 text-right text-slate-800">{rawGl.reduce((s:number,l:any)=>s+l.credit,0).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                      <td colSpan={4}/>
                    </tr>
                  </tbody>
                </table>
              </div>
              </div>
            )}

            {/* ── System Information ── */}
            {activeTab==='sysinfo' && (
              <div>
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 px-1">
                  <span className="font-medium text-slate-700">Last Created:</span>
                  <span>{data.created_at ? new Date(data.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '-'}</span>
                  {data.created_by_name && <span className="text-slate-500">by {data.created_by_name}</span>}
                </div>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Date / Time</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Set by</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Context</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Field</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Old Value</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length===0 ? (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">No activity recorded</td></tr>
                      ) : auditLogs.map((log:any)=>(
                        <tr key={log.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap text-xs">
                            {new Date(log.performed_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-xs">{log.performed_by_name||'-'}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{log.context||'System'}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded-full font-medium ${log.change_type==='Set'?'bg-green-100 text-green-700':log.change_type==='Change'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>
                              {log.change_type || (log.action==='created'?'Set':'Change')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-xs">{log.field_name || log.description?.split(':')[0] || '-'}</td>
                          <td className="px-3 py-2 text-xs">
                            {log.old_value ? (
                              <span className="text-red-600 line-through">{log.old_value}</span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {log.new_value ? (
                              <span className="text-green-700 font-medium">{log.new_value}</span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Back</button>
          <EditTransactionButton permKey="check" to={`/bank/checks/${id}/edit`} />
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800"><Printer size={13}/> Print</button>
        </div>

      </div>
    </div>
  );
}

function numberToWords(n: number): string {
  if (!n) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const toW = (x: number): string => {
    if (x===0) return '';
    if (x<20) return ones[x]+' ';
    if (x<100) return tens[Math.floor(x/10)]+(x%10?' '+ones[x%10]:'')+' ';
    if (x<1000) return ones[Math.floor(x/100)]+' Hundred '+toW(x%100);
    if (x<1000000) return toW(Math.floor(x/1000))+'Thousand '+toW(x%1000);
    if (x<1000000000) return toW(Math.floor(x/1000000))+'Million '+toW(x%1000000);
    return toW(Math.floor(x/1000000000))+'Billion '+toW(x%1000000000);
  };
  return toW(Math.floor(n)).trim();
}
