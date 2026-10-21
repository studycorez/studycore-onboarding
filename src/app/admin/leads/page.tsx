'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

type LeadStage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'converted' | 'lost';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  grade: number | null;
  target_score: number | null;
  current_score: number | null;
  stage: LeadStage;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
}

const STAGES: { key: LeadStage; label: string; color: string; dot: string }[] = [
  { key: 'new',            label: 'New',            color: 'bg-gray-100 border-gray-200',   dot: 'bg-gray-400' },
  { key: 'contacted',      label: 'Contacted',      color: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-400' },
  { key: 'qualified',      label: 'Qualified',      color: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  { key: 'converted',      label: 'Converted',      color: 'bg-green-50 border-green-200',  dot: 'bg-green-500' },
  { key: 'lost',           label: 'Lost',           color: 'bg-red-50 border-red-200',      dot: 'bg-red-400' },
];

const STAGE_COLORS: Record<LeadStage, string> = {
  new:            'bg-gray-100 text-gray-700',
  contacted:      'bg-blue-100 text-blue-700',
  qualified:      'bg-purple-100 text-purple-700',
  demo_scheduled: 'bg-amber-100 text-amber-700',
  converted:      'bg-green-100 text-green-700',
  lost:           'bg-red-100 text-red-700',
};

const EMPTY_FORM = { name: '', email: '', phone: '', grade: '', target_score: '', current_score: '', source: '', notes: '', assigned_to: '' };

export default function LeadsPage() {
  const supabase = createClient();
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Lead | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [dragging, setDragging]   = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<LeadStage | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        grade: form.grade ? parseInt(form.grade) : null,
        target_score: form.target_score ? parseInt(form.target_score) : null,
        current_score: form.current_score ? parseInt(form.current_score) : null,
        source: form.source || null,
        notes: form.notes || null,
        assigned_to: form.assigned_to || null,
      }),
    });
    if (res.ok) { setForm(EMPTY_FORM); setShowAdd(false); await load(); }
    setSaving(false);
  }

  async function updateStage(leadId: string, stage: LeadStage) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage } : l));
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (selected?.id === leadId) setSelected(prev => prev ? { ...prev, stage } : null);
  }

  async function updateField(leadId: string, field: string, value: string | number | null) {
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
    setSelected(prev => prev?.id === leadId ? { ...prev, [field]: value } : prev);
  }

  async function deleteLead(leadId: string) {
    if (!confirm('Delete this lead?')) return;
    await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    setSelected(null);
    await load();
  }

  function handleDragStart(id: string) { setDragging(id); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  async function handleDrop(e: React.DragEvent, stage: LeadStage) {
    e.preventDefault();
    if (dragging) { await updateStage(dragging, stage); setDragging(null); }
  }

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">{leads.length} total leads</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Add Lead Form */}
      {showAdd && (
        <form onSubmit={createLead} className="card p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">New Lead</h2>
            <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required /></div>
            <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" /></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" /></div>
            <div><label className="label">Grade</label><input type="number" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} className="input" placeholder="11" /></div>
            <div><label className="label">Current Score</label><input type="number" value={form.current_score} onChange={e => setForm(f => ({ ...f, current_score: e.target.value }))} className="input" placeholder="1200" /></div>
            <div><label className="label">Target Score</label><input type="number" value={form.target_score} onChange={e => setForm(f => ({ ...f, target_score: e.target.value }))} className="input" placeholder="1450" /></div>
            <div><label className="label">Source</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="input">
                <option value="">—</option>
                {['website','referral','instagram','google','other'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div><label className="label">Assigned To</label><input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="input" placeholder="Admin name" /></div>
            <div className="col-span-3"><label className="label">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} /></div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Add Lead
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Conversion Funnel */}
      <div className="card p-4 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Conversion Funnel</p>
        <div className="flex items-end gap-1">
          {STAGES.map(({ key, label, dot }, idx) => {
            const count = leads.filter(l => l.stage === key).length;
            const pct   = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
            const isActive = stageFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStageFilter(isActive ? null : key)}
                className={`flex-1 flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${isActive ? 'bg-navy-50 ring-1 ring-navy-300' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-end gap-1 w-full justify-center">
                  <div
                    className={`w-full rounded-t transition-all`}
                    style={{ height: `${Math.max(pct, 4)}px`, background: isActive ? '#1e2090' : '#d1d5db' }}
                  />
                </div>
                <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                <span className="text-xs font-semibold text-gray-900">{count}</span>
                <span className="text-[10px] text-gray-400 text-center leading-tight">{label}</span>
                <span className="text-[10px] text-gray-300">{pct}%</span>
                {idx < STAGES.length - 1 && (
                  <span className="absolute text-gray-300 text-xs pointer-events-none" style={{ right: '-6px', top: '50%' }}>›</span>
                )}
              </button>
            );
          })}
        </div>
        {stageFilter && (
          <p className="text-xs text-navy-600 font-medium mt-2 text-center">
            Filtering: <strong>{STAGES.find(s => s.key === stageFilter)?.label}</strong> —{' '}
            <button onClick={() => setStageFilter(null)} className="underline hover:no-underline">clear</button>
          </p>
        )}
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(({ key, label, color, dot }) => {
          const colLeads = (stageFilter ? leads.filter(l => l.stage === stageFilter) : leads).filter(l => l.stage === key);
          return (
            <div
              key={key}
              className={`flex-shrink-0 w-56 rounded-xl border ${color} flex flex-col`}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, key)}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 flex items-center gap-2 border-b border-inherit">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-xs font-semibold text-gray-700">{label}</span>
                <span className="ml-auto text-xs text-gray-400 bg-white rounded-full px-1.5 py-0.5">{colLeads.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                {colLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead.id)}
                    onClick={() => setSelected(lead)}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow text-sm"
                  >
                    <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
                    {lead.email && <p className="text-xs text-gray-400 truncate">{lead.email}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {lead.grade && <span className="text-xs text-gray-500">Gr.{lead.grade}</span>}
                      {lead.target_score && <span className="text-xs text-navy-600 font-medium">→{lead.target_score}</span>}
                      {lead.source && <span className="text-xs text-gray-400 capitalize">{lead.source}</span>}
                    </div>
                    <p className="text-xs text-gray-300 mt-1">{format(new Date(lead.created_at), 'MMM d')}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lead detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative bg-white w-full max-w-md h-full shadow-xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-semibold text-gray-900">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Stage selector */}
              <div>
                <label className="label">Stage</label>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => updateStage(selected.id, s.key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected.stage === s.key ? STAGE_COLORS[s.key] : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields */}
              {[
                { label: 'Email', field: 'email', type: 'email' },
                { label: 'Phone', field: 'phone', type: 'text' },
                { label: 'Grade', field: 'grade', type: 'number' },
                { label: 'Current Score', field: 'current_score', type: 'number' },
                { label: 'Target Score', field: 'target_score', type: 'number' },
                { label: 'Source', field: 'source', type: 'text' },
                { label: 'Assigned To', field: 'assigned_to', type: 'text' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input
                    type={type}
                    defaultValue={(selected as any)[field] ?? ''}
                    onBlur={e => {
                      const val = e.target.value;
                      const parsed = type === 'number' ? (val ? parseInt(val) : null) : (val || null);
                      updateField(selected.id, field, parsed);
                    }}
                    className="input"
                  />
                </div>
              ))}

              <div>
                <label className="label">Notes</label>
                <textarea
                  defaultValue={selected.notes ?? ''}
                  onBlur={e => updateField(selected.id, 'notes', e.target.value || null)}
                  className="input" rows={4}
                />
              </div>

              {/* Convert to student button */}
              {selected.stage === 'converted' && (
                <div className="border border-green-200 rounded-xl p-4 bg-green-50">
                  <p className="text-sm font-semibold text-green-800 mb-1">Ready to convert!</p>
                  <p className="text-xs text-green-600 mb-3">Add this lead as a student in the Students section.</p>
                  <a
                    href="/students/new"
                    className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900"
                  >
                    Go to Students <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              )}

              <p className="text-xs text-gray-400">Added {format(new Date(selected.created_at), 'MMM d, yyyy')}</p>

              <button
                onClick={() => deleteLead(selected.id)}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                Delete lead
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
