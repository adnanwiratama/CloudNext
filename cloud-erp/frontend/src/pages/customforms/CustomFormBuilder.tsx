import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../../services/api';

type MainTab = 'tabs' | 'fieldgroups' | 'screenfields' | 'actions' | 'sublists' | 'sublistfields' | 'customcode' | 'roles' | 'history';
type SubTab = string; // tab id

const FIELD_TYPES = [
  { group: 'Text',        types: [
    { value: 'free_text', label: 'Free Text' }, { value: 'long_text', label: 'Long Text' },
    { value: 'rich_text', label: 'Rich Text Editor' }, { value: 'email', label: 'Email' },
    { value: 'url', label: 'URL' }, { value: 'phone', label: 'Phone Number' }, { value: 'password', label: 'Password' },
  ]},
  { group: 'Numeric',     types: [
    { value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' },
    { value: 'float', label: 'Float' }, { value: 'currency', label: 'Currency' }, { value: 'percentage', label: 'Percentage' },
  ]},
  { group: 'Date & Time', types: [
    { value: 'date', label: 'Date' }, { value: 'time', label: 'Time' }, { value: 'datetime', label: 'Datetime' },
    { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' },
  ]},
  { group: 'Selection',   types: [
    { value: 'dropdown', label: 'Dropdown (Select)' }, { value: 'multiselect', label: 'Multi Select' },
    { value: 'radio', label: 'Radio Button' }, { value: 'checkbox', label: 'Checkbox' }, { value: 'toggle', label: 'Toggle Switch' },
  ]},
  { group: 'Reference',   types: [
    { value: 'ref_list', label: 'List' }, { value: 'ref_record', label: 'Record' }, { value: 'ref_list_record', label: 'List/Record' },
  ]},
  { group: 'File',        types: [
    { value: 'file', label: 'File Upload' }, { value: 'image', label: 'Image Upload' }, { value: 'multi_file', label: 'Multiple File Upload' },
  ]},
  { group: 'Advanced',    types: [
    { value: 'formula', label: 'Formula Field' }, { value: 'autonumber', label: 'Auto Number' },
    { value: 'barcode', label: 'Barcode' }, { value: 'qrcode', label: 'QR Code' },
    { value: 'signature', label: 'Signature' }, { value: 'colorpicker', label: 'Color Picker' }, { value: 'json', label: 'JSON Field' },
  ]},
];

const DATASOURCES = [
  { value: 'customers', label: 'Customer' }, { value: 'vendors', label: 'Vendor' },
  { value: 'items', label: 'Item' }, { value: 'accounts', label: 'Account (COA)' },
  { value: 'departments', label: 'Department' }, { value: 'locations', label: 'Location' },
  { value: 'employees', label: 'Employee' }, { value: 'projects', label: 'Project' },
];

const MODULES = [
  { value: 'bank_check', label: 'Write Check' }, { value: 'invoice', label: 'Invoice' },
  { value: 'sales_order', label: 'Sales Order' }, { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'vendor_bill', label: 'Vendor Bill' }, { value: 'goods_receipt', label: 'Goods Receipt' },
  { value: 'item_fulfillment', label: 'Item Fulfillment' }, { value: 'journal_entry', label: 'Journal Entry' },
  { value: 'work_order', label: 'Work Order' }, { value: 'inventory_adjustment', label: 'Inventory Adjustment' },
];

export default function CustomFormBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === 'new';

  const [mainTab, setMainTab] = useState<MainTab>('screenfields');
  const [subTab, setSubTab] = useState<SubTab>('main');
  const [selectedField, setSelectedField] = useState<any>(null);
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [newFieldForm, setNewFieldForm] = useState<any>({ label: '', field_type: 'free_text', is_visible: true, is_mandatory: false });
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState<any>({
    name: '', code: '', description: '', module: 'bank_check', transaction_type: 'Check',
    printing_type: 'basic', is_active: true, allow_add_multiple: false,
    store_form_with_record: true, form_is_preferred: false, custom_script: '',
  });

  const { data: formData, isLoading } = useQuery({
    queryKey: ['custom-form', id],
    queryFn: async () => {
      if (isNew) return null;
      const r = await api.get(`/api/custom-forms/${id}`);
      const d = r.data.data;
      setHeader({ name: d.name, code: d.code, description: d.description, module: d.module, transaction_type: d.transaction_type, printing_type: d.printing_type, is_active: d.is_active, allow_add_multiple: d.allow_add_multiple, store_form_with_record: d.store_form_with_record, form_is_preferred: d.form_is_preferred, custom_script: d.custom_script || '' });
      return d;
    },
    enabled: !isNew,
    staleTime: 0,
  });

  const tabs       : any[] = formData?.tabs        || [{ id: 'sys_main', tab_id: 'main', label: 'Main', is_system: true, sequence: 0 }, { id: 'sys_exp', tab_id: 'expenses', label: 'Expenses & Items', is_system: true, sequence: 10 }, { id: 'sys_rel', tab_id: 'relationships', label: 'Relationships', is_system: true, sequence: 20 }, { id: 'sys_custom', tab_id: 'custom', label: 'Custom', is_system: true, sequence: 30 }];
  const allFields  : any[] = formData?.fields       || [];
  const groups     : any[] = formData?.groups       || [];
  const sublists   : any[] = formData?.sublists     || [];
  const sublistFields: any[] = formData?.sublistFields || [];
  const history    : any[] = [];

  const visibleFields = allFields.filter((f:any) => {
    const tabObj = tabs.find((t:any) => t.id === f.tab_id);
    return tabObj?.tab_id === subTab || f.tab_id === null && subTab === 'main';
  });

  const handleSaveHeader = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post('/api/custom-forms', { ...header, transactionType: header.transaction_type, printingType: header.printing_type, isActive: header.is_active, allowAddMultiple: header.allow_add_multiple, storeFormWithRecord: header.store_form_with_record, formIsPreferred: header.form_is_preferred, customScript: header.custom_script });
        navigate(`/customization/forms/${r.data.data.id}`, { replace: true });
      } else {
        await api.put(`/api/custom-forms/${id}`, { ...header, transactionType: header.transaction_type, printingType: header.printing_type, isActive: header.is_active, allowAddMultiple: header.allow_add_multiple, storeFormWithRecord: header.store_form_with_record, formIsPreferred: header.form_is_preferred, customScript: header.custom_script });
        qc.invalidateQueries({ queryKey: ['custom-form', id] });
      }
    } finally { setSaving(false); }
  };

  const handleAddField = async () => {
    if (!newFieldForm.label) { alert('Label is required'); return; }
    const tabObj = tabs.find((t:any) => t.tab_id === subTab);
    await api.post(`/api/custom-forms/${id}/fields`, {
      ...newFieldForm,
      fieldType: newFieldForm.field_type,
      isMandatory: newFieldForm.is_mandatory,
      isVisible: newFieldForm.is_visible,
      tabId: tabObj?.id || null,
      fieldId: `field_${Date.now()}`,
    });
    qc.invalidateQueries({ queryKey: ['custom-form', id] });
    setShowFieldPanel(false);
    setNewFieldForm({ label: '', field_type: 'free_text', is_visible: true, is_mandatory: false });
  };

  const handleToggleField = async (field: any, prop: 'is_visible'|'is_mandatory') => {
    await api.put(`/api/custom-forms/${id}/fields/${field.id}`, {
      ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible,
      [prop]: !field[prop],
    });
    qc.invalidateQueries({ queryKey: ['custom-form', id] });
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Delete this field?')) return;
    await api.delete(`/api/custom-forms/${id}/fields/${fieldId}`);
    qc.invalidateQueries({ queryKey: ['custom-form', id] });
  };

  const moveField = async (field: any, dir: 'up'|'down'|'top'|'bottom') => {
    const sorted = [...allFields].sort((a,b)=>a.sequence-b.sequence);
    const idx = sorted.findIndex((f:any)=>f.id===field.id);
    let newSeq = field.sequence;
    if (dir==='up' && idx>0)               newSeq = sorted[idx-1].sequence - 1;
    if (dir==='down' && idx<sorted.length-1) newSeq = sorted[idx+1].sequence + 1;
    if (dir==='top')                        newSeq = (sorted[0]?.sequence || 0) - 10;
    if (dir==='bottom')                     newSeq = (sorted[sorted.length-1]?.sequence || 0) + 10;
    await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, sequence: newSeq });
    qc.invalidateQueries({ queryKey: ['custom-form', id] });
  };

  const { data: historyData } = useQuery({
    queryKey: ['custom-form-history', id],
    queryFn: () => api.get(`/api/custom-forms/${id}/history`).then(r => r.data.data || []),
    enabled: !!id && !isNew && mainTab === 'history',
  });

  if (!isNew && isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-500" size={28}/></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">Custom Transaction Form</h1>
          <button onClick={() => navigate('/customization/forms')} className="text-sm text-blue-600 hover:underline">List</button>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 pb-2 flex items-center gap-2">
          <div className="flex">
            <button onClick={handleSaveHeader} disabled={saving}
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-l hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="px-2 py-1.5 bg-blue-700 text-white border-l border-blue-600 rounded-r hover:bg-blue-800">▾</button>
          </div>
          <button onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          <button className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Move Elements Between Subtabs</button>
          <button className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Change ID</button>
          <span className="font-semibold text-sm text-slate-700 ml-2">Actions</span>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto p-4 space-y-4">
        {/* Form Header */}
        <div className="bg-white border border-slate-200 rounded shadow-sm p-5">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input value={header.name} onChange={e=>setHeader((h:any)=>({...h,name:e.target.value}))}
                  className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. GNC Cheque"/>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">ID</label>
                <div className="text-sm font-mono text-slate-600">{isNew ? 'Auto Generated' : `custform_${id?.slice(0,8)}`}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Type</label>
                <select value={header.module} onChange={e=>setHeader((h:any)=>({...h,module:e.target.value}))}
                  className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm">
                  {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Printing Type</label>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={header.printing_type==='advanced'} onChange={()=>setHeader((h:any)=>({...h,printing_type:'advanced'}))} /> Advanced</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={header.printing_type==='basic'} onChange={()=>setHeader((h:any)=>({...h,printing_type:'basic'}))} /> Basic</label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={header.allow_add_multiple} onChange={e=>setHeader((h:any)=>({...h,allow_add_multiple:e.target.checked}))} className="w-4 h-4"/>
                Allow Add Multiple
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!header.is_active} onChange={e=>setHeader((h:any)=>({...h,is_active:!e.target.checked}))} className="w-4 h-4"/>
                Inactive
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={header.store_form_with_record} onChange={e=>setHeader((h:any)=>({...h,store_form_with_record:e.target.checked}))} className="w-4 h-4"/>
                Store Form with Record
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={header.form_is_preferred} onChange={e=>setHeader((h:any)=>({...h,form_is_preferred:e.target.checked}))} className="w-4 h-4"/>
                Form is Preferred
              </label>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        {!isNew && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            {/* Tab Bar */}
            <div className="border-b border-slate-200 px-4 flex items-center gap-1">
              {([
                ['tabs','Tabs'], ['fieldgroups','Field Groups'], ['screenfields','Screen Fields'],
                ['actions','Actions'], ['sublists','Sublists'], ['sublistfields','Sublist Fields'],
                ['customcode','Custom Code'], ['roles','Roles'], ['history','History'],
              ] as [MainTab, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setMainTab(key)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${mainTab===key?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Screen Fields Tab */}
            {mainTab === 'screenfields' && (
              <div>
                {/* Sub-tabs (form tabs) */}
                <div className="border-b border-slate-100 px-4 py-1.5 flex items-center gap-1 flex-wrap">
                  {tabs.map((t:any) => (
                    <button key={t.tab_id} onClick={() => setSubTab(t.tab_id)}
                      className={`text-sm px-3 py-1 rounded transition-colors ${subTab===t.tab_id?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100'}`}>
                      {t.label} {t.is_system ? '' : '▾'}
                    </button>
                  ))}
                </div>

                {/* Toolbar */}
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                  <button onClick={() => setShowFieldPanel(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm rounded hover:bg-slate-50">
                    <Plus size={13}/> New Field
                  </button>
                  <span className="text-xs text-slate-400">|</span>
                  <span className="text-xs text-slate-500">Drag rows to reorder, or use arrow buttons</span>
                </div>

                {/* New Field Panel */}
                {showFieldPanel && (
                  <div className="mx-4 my-3 border border-blue-200 bg-blue-50 rounded p-4">
                    <div className="font-semibold text-sm text-blue-800 mb-3">New Field</div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Label *</label>
                        <input value={newFieldForm.label} onChange={e=>setNewFieldForm((f:any)=>({...f,label:e.target.value}))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Field Label"/>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                        <select value={newFieldForm.field_type} onChange={e=>setNewFieldForm((f:any)=>({...f,field_type:e.target.value}))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                          {FIELD_TYPES.map(g => (
                            <optgroup key={g.group} label={g.group}>
                              {g.types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      {['ref_list','ref_record','ref_list_record'].includes(newFieldForm.field_type) && (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Datasource</label>
                          <select value={newFieldForm.datasource||''} onChange={e=>setNewFieldForm((f:any)=>({...f,datasource:e.target.value}))}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                            <option value="">Select...</option>
                            {DATASOURCES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Display Type</label>
                        <select value={newFieldForm.display_type||'Normal'} onChange={e=>setNewFieldForm((f:any)=>({...f,display_type:e.target.value}))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                          <option>Normal</option><option>Inline Text</option><option>Disabled</option><option>Hidden</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Default Value</label>
                        <input value={newFieldForm.default_value||''} onChange={e=>setNewFieldForm((f:any)=>({...f,default_value:e.target.value}))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"/>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Help Text</label>
                        <input value={newFieldForm.help_text||''} onChange={e=>setNewFieldForm((f:any)=>({...f,help_text:e.target.value}))}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"/>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={newFieldForm.is_visible} onChange={e=>setNewFieldForm((f:any)=>({...f,is_visible:e.target.checked}))} className="w-3.5 h-3.5"/> Show
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={newFieldForm.is_mandatory} onChange={e=>setNewFieldForm((f:any)=>({...f,is_mandatory:e.target.checked}))} className="w-3.5 h-3.5"/> Mandatory
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={newFieldForm.is_printable!==false} onChange={e=>setNewFieldForm((f:any)=>({...f,is_printable:e.target.checked}))} className="w-3.5 h-3.5"/> Printable
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={newFieldForm.audit_trail!==false} onChange={e=>setNewFieldForm((f:any)=>({...f,audit_trail:e.target.checked}))} className="w-3.5 h-3.5"/> Audit Trail
                      </label>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={handleAddField} className="px-4 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800">Add Field</button>
                      <button onClick={()=>{setShowFieldPanel(false);}} className="px-4 py-1.5 border border-slate-300 text-sm rounded hover:bg-slate-50">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Fields Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-2 py-2 w-6"></th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Label</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-14">Show</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Mandatory</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Display Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Check Box Default</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Field Group</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Column Break</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Space Before</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-24">Same Row as Previous</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allFields.length === 0 ? (
                        <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400 italic">No fields yet. Click "New Field" to add.</td></tr>
                      ) : allFields.sort((a:any,b:any)=>a.sequence-b.sequence).map((field: any) => (
                        <tr key={field.id} className={`border-t border-slate-100 hover:bg-slate-50 ${field.is_custom ? '' : 'opacity-80'}`}>
                          <td className="px-2 py-1.5 text-slate-400 cursor-move"><GripVertical size={12}/></td>
                          <td className="px-3 py-1.5">
                            <input value={field.label} readOnly={field.is_system}
                              onBlur={async e => {
                                if (e.target.value !== field.label) {
                                  await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, label: e.target.value });
                                  qc.invalidateQueries({ queryKey: ['custom-form', id] });
                                }
                              }}
                              className={`w-full border ${field.is_system?'bg-slate-50 border-slate-200':'border-slate-300'} rounded px-2 py-0.5 text-xs`}/>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={field.is_visible} disabled={field.is_system && field.is_visible}
                              onChange={() => handleToggleField(field, 'is_visible')} className="w-3.5 h-3.5"/>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={field.is_mandatory}
                              onChange={() => handleToggleField(field, 'is_mandatory')} className="w-3.5 h-3.5"/>
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={field.display_type||'Normal'} disabled={field.is_system && !field.is_custom}
                              onChange={async e => {
                                await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, displayType: e.target.value });
                                qc.invalidateQueries({ queryKey: ['custom-form', id] });
                              }}
                              className="w-full border border-slate-300 rounded px-1 py-0.5 text-xs bg-white">
                              <option>Normal</option><option>Inline Text</option><option>Disabled</option><option>Hidden</option>
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            {field.field_type === 'checkbox' && (
                              <select value={field.checkbox_default||''} className="w-full border border-slate-300 rounded px-1 py-0.5 text-xs bg-white"
                                onChange={async e => { await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, checkboxDefault: e.target.value }); qc.invalidateQueries({ queryKey: ['custom-form', id] }); }}>
                                <option value="">-</option><option value="checked">Checked</option><option value="unchecked">Unchecked</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{field.help_text||field.field_id||'-'}</td>
                          <td className="px-3 py-1.5">
                            <select value={field.group_id||''}
                              onChange={async e => { await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, groupId: e.target.value||null }); qc.invalidateQueries({ queryKey: ['custom-form', id] }); }}
                              className="w-full border border-slate-300 rounded px-1 py-0.5 text-xs bg-white">
                              <option value="">-</option>
                              {groups.map((g:any) => <option key={g.id} value={g.id}>{g.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={field.column_break||false} className="w-3.5 h-3.5"
                              onChange={async e => { await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, columnBreak: e.target.checked }); qc.invalidateQueries({ queryKey: ['custom-form', id] }); }}/>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={field.space_before||false} className="w-3.5 h-3.5"
                              onChange={async e => { await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, spaceBefore: e.target.checked }); qc.invalidateQueries({ queryKey: ['custom-form', id] }); }}/>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={field.same_row_as_previous||false} className="w-3.5 h-3.5"
                              onChange={async e => { await api.put(`/api/custom-forms/${id}/fields/${field.id}`, { ...field, fieldType: field.field_type, isMandatory: field.is_mandatory, isVisible: field.is_visible, sameRowAsPrevious: e.target.checked }); qc.invalidateQueries({ queryKey: ['custom-form', id] }); }}/>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-center gap-0.5">
                              <button onClick={() => moveField(field,'top')} title="Move to Top" className="p-0.5 text-slate-400 hover:text-slate-700"><ChevronUp size={11}/></button>
                              <button onClick={() => moveField(field,'up')} title="Move Up" className="p-0.5 text-slate-400 hover:text-slate-700"><ArrowUp size={11}/></button>
                              <button onClick={() => moveField(field,'down')} title="Move Down" className="p-0.5 text-slate-400 hover:text-slate-700"><ArrowDown size={11}/></button>
                              <button onClick={() => moveField(field,'bottom')} title="Move to Bottom" className="p-0.5 text-slate-400 hover:text-slate-700"><ChevronDown size={11}/></button>
                              {field.is_custom && <button onClick={() => handleDeleteField(field.id)} className="p-0.5 text-slate-400 hover:text-red-600 ml-0.5"><Trash2 size={11}/></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabs Management */}
            {mainTab === 'tabs' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Form Tabs</h3>
                  <button onClick={async () => {
                    const label = prompt('Tab label:');
                    if (!label) return;
                    await api.post(`/api/custom-forms/${id}/tabs`, { label, isVisible: true });
                    qc.invalidateQueries({ queryKey: ['custom-form', id] });
                  }} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-sm rounded hover:bg-slate-50"><Plus size={12}/> Add Tab</button>
                </div>
                <table className="w-full text-sm border border-slate-200 rounded">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2 text-center">Visible</th><th className="px-3 py-2 text-center">System</th><th className="px-3 py-2 text-center">Order</th><th className="px-3 py-2"></th></tr>
                  </thead>
                  <tbody>
                    {tabs.sort((a:any,b:any)=>a.sequence-b.sequence).map((tab:any) => (
                      <tr key={tab.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{tab.label}</td>
                        <td className="px-3 py-2 text-center"><span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${tab.is_visible?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}`}>{tab.is_visible?'Yes':'No'}</span></td>
                        <td className="px-3 py-2 text-center text-slate-400 text-xs">{tab.is_system?'System':'-'}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{tab.sequence}</td>
                        <td className="px-3 py-2 text-center">
                          {!tab.is_system && <button onClick={async()=>{await api.delete(`/api/custom-forms/${id}/tabs/${tab.id}`);qc.invalidateQueries({queryKey:['custom-form',id]});}} className="text-red-500 hover:text-red-700"><Trash2 size={13}/></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Field Groups */}
            {mainTab === 'fieldgroups' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Field Groups</h3>
                  <button onClick={async () => {
                    const label = prompt('Group label:');
                    if (!label) return;
                    const cols = prompt('Columns (1-4):', '2');
                    await api.post(`/api/custom-forms/${id}/groups`, { label, columns: parseInt(cols||'2'), isCollapsible: false });
                    qc.invalidateQueries({ queryKey: ['custom-form', id] });
                  }} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-sm rounded hover:bg-slate-50"><Plus size={12}/> Add Group</button>
                </div>
                <table className="w-full text-sm border border-slate-200 rounded">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2 text-center">Columns</th><th className="px-3 py-2 text-center">Collapsible</th><th className="px-3 py-2"></th></tr>
                  </thead>
                  <tbody>
                    {groups.length===0?<tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 italic">No groups yet</td></tr>
                    :groups.map((g:any)=>(
                      <tr key={g.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{g.label}</td>
                        <td className="px-3 py-2 text-center">{g.columns}</td>
                        <td className="px-3 py-2 text-center text-slate-400 text-xs">{g.is_collapsible?'Yes':'No'}</td>
                        <td className="px-3 py-2 text-center"><button onClick={async()=>{await api.delete(`/api/custom-forms/${id}/groups/${g.id}`);qc.invalidateQueries({queryKey:['custom-form',id]});}} className="text-red-500 hover:text-red-700"><Trash2 size={13}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sublists */}
            {mainTab === 'sublists' && (
              <div className="p-4">
                <div className="flex justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Sublists</h3>
                  <button onClick={async()=>{const label=prompt('Sublist label:');if(!label)return;await api.post(`/api/custom-forms/${id}/sublists`,{label,sublistType:'list',isVisible:true});qc.invalidateQueries({queryKey:['custom-form',id]});}} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-sm rounded hover:bg-slate-50"><Plus size={12}/> Add Sublist</button>
                </div>
                {sublists.length===0?<p className="text-sm text-slate-400 italic">No sublists defined.</p>
                :sublists.map((sl:any)=>(
                  <div key={sl.id} className="border border-slate-200 rounded mb-2 p-3">
                    <div className="font-semibold text-sm text-slate-700 mb-1">{sl.label}</div>
                    <div className="text-xs text-slate-500">Type: {sl.sublist_type} | {sl.is_visible?'Visible':'Hidden'}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Code */}
            {mainTab === 'customcode' && (
              <div className="p-4">
                <label className="block text-xs font-semibold text-slate-700 mb-2">Custom Script (JavaScript)</label>
                <textarea value={header.custom_script||''} rows={12}
                  onChange={e=>setHeader((h:any)=>({...h,custom_script:e.target.value}))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-blue-500"
                  placeholder="// Write custom JavaScript here&#10;// e.g. conditional logic, auto-calculations"/>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleSaveHeader} className="px-4 py-1.5 bg-blue-700 text-white text-sm rounded hover:bg-blue-800">Save Script</button>
                </div>
              </div>
            )}

            {/* Roles */}
            {mainTab === 'roles' && (
              <div className="p-4">
                <div className="flex justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Role Permissions</h3>
                  <button onClick={async()=>{const role=prompt('Role name:');if(!role)return;await api.post(`/api/custom-forms/${id}/roles`,{roleId:role.toLowerCase().replace(/\s+/,'_'),roleName:role,canView:true,canCreate:false,canEdit:false,canDelete:false});qc.invalidateQueries({queryKey:['custom-form',id]});}} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-sm rounded hover:bg-slate-50"><Plus size={12}/> Add Role</button>
                </div>
                <table className="w-full text-sm border border-slate-200 rounded">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-center">View</th><th className="px-3 py-2 text-center">Create</th><th className="px-3 py-2 text-center">Edit</th><th className="px-3 py-2 text-center">Delete</th></tr>
                  </thead>
                  <tbody>
                    {(formData?.roles||[]).length===0?<tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">No roles configured</td></tr>
                    :(formData?.roles||[]).map((r:any)=>(
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{r.role_name}</td>
                        {['can_view','can_create','can_edit','can_delete'].map(p=>(
                          <td key={p} className="px-3 py-2 text-center"><input type="checkbox" checked={r[p]} className="w-3.5 h-3.5" readOnly/></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* History */}
            {mainTab === 'history' && (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Form Change History</h3>
                <table className="w-full text-xs border border-slate-200 rounded">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">By</th></tr>
                  </thead>
                  <tbody>
                    {(historyData||[]).length===0?<tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 italic">No history yet</td></tr>
                    :(historyData||[]).map((h:any)=>(
                      <tr key={h.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{new Date(h.performed_at).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2"><span className="inline-flex px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700">{h.action}</span></td>
                        <td className="px-3 py-2 text-slate-600">{h.description}</td>
                        <td className="px-3 py-2 text-slate-500">{h.performed_by_name||'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
