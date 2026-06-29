'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Check } from 'lucide-react';
import Link from 'next/link';

interface Flag {
  id: string;
  tutor_id: string;
  tutor_name: string;
  flag_type: string;
  flag_data: any;
  created_at: string;
  created_by_admin_id: string | null;
  resolved_at: string | null;
  resolved_by_admin_id: string | null;
  resolution_note: string | null;
}

const FLAG_BADGES: Record<string, { label: string; className: string }> = {
  conflict_kept:       { label: 'Conflict Kept',       className: 'bg-yellow-100 text-yellow-700' },
  conflict_unresolved: { label: 'Conflict Unresolved', className: 'bg-orange-100 text-orange-700' },
  materialize_no_op:   { label: 'Materialize No-Op',   className: 'bg-red-100 text-red-700' },
};

const FLAG_TYPES = ['conflict_kept', 'conflict_unresolved', 'materialize_no_op'];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatFlagData(flagType: string, data: any): string {
  if (!data) return '—';
  if (flagType === 'materialize_no_op') {
    return `${data.schedule_count ?? 0} schedule rows, 0 sessions created`;
  }
  const parts: string[] = [];
  if (data.student_name) parts.push(data.student_name);
  if (data.scheduled_at) {
    try { parts.push(new Date(data.scheduled_at).toLocaleString()); } catch { parts.push(data.scheduled_at); }
  }
  if (data.kind) parts.push(`(${data.kind})`);
  return parts.join(' · ') || '—';
}

export default function FlagsDashboardPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterTutor, setFilterTutor] = useState('all');
  const [expandedTutors, setExpandedTutors] = useState<Set<string>>(new Set());
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('resolved', showResolved ? 'all' : 'false');
    const res = await fetch(`/api/admin/schedule-builder/flags?${params}`);
    const data = await res.json();
    setFlags(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [showResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve(flagId: string) {
    const note = window.prompt('Resolution note (optional):');
    if (note === null) return; // cancelled
    setResolvingId(flagId);
    await fetch(`/api/admin/schedule-builder/flags/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_note: note || null }),
    });
    await load();
    setResolvingId(null);
  }

  function toggleTutor(tutorId: string) {
    setExpandedTutors(prev => {
      const next = new Set(prev);
      if (next.has(tutorId)) next.delete(tutorId); else next.add(tutorId);
      return next;
    });
  }

  // Apply client-side filters
  let filtered = flags;
  if (filterType !== 'all') filtered = filtered.filter(f => f.flag_type === filterType);
  if (filterTutor !== 'all') filtered = filtered.filter(f => f.tutor_id === filterTutor);

  // Group by tutor
  const grouped: Record<string, { tutorName: string; tutorId: string; flags: Flag[] }> = {};
  for (const f of filtered) {
    if (!grouped[f.tutor_id]) {
      grouped[f.tutor_id] = { tutorName: f.tutor_name, tutorId: f.tutor_id, flags: [] };
    }
    grouped[f.tutor_id].flags.push(f);
  }
  const groups = Object.values(grouped).sort((a, b) => a.tutorName.localeCompare(b.tutorName));

  // Unique tutors for filter dropdown
  const tutorOptions = [...new Map(flags.map(f => [f.tutor_id, f.tutor_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  const unresolvedCount = flags.filter(f => !f.resolved_at).length;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule Builder Flags</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {unresolvedCount} unresolved · {flags.length} total
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            className="accent-navy-600"
          />
          Show resolved
        </label>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="input text-sm py-1 w-48"
        >
          <option value="all">All flag types</option>
          {FLAG_TYPES.map(t => (
            <option key={t} value={t}>{FLAG_BADGES[t]?.label ?? t}</option>
          ))}
        </select>
        <select
          value={filterTutor}
          onChange={e => setFilterTutor(e.target.value)}
          className="input text-sm py-1 w-48"
        >
          <option value="all">All tutors</option>
          {tutorOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-400 text-sm">No flags match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const expanded = expandedTutors.has(group.tutorId);
            return (
              <div key={group.tutorId} className="card overflow-hidden">
                {/* Tutor header — click to expand */}
                <button
                  onClick={() => toggleTutor(group.tutorId)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-medium text-gray-900 text-sm">{group.tutorName}</span>
                    <span className="text-xs text-gray-400">{group.flags.length} flag{group.flags.length !== 1 ? 's' : ''}</span>
                  </div>
                  <Link
                    href={`/admin/schedule-builder?tutorId=${group.tutorId}`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-medium text-navy-600 hover:text-navy-800 inline-flex items-center gap-1"
                  >
                    Open in Schedule Builder <ExternalLink className="w-3 h-3" />
                  </Link>
                </button>

                {/* Flag rows */}
                {expanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {group.flags.map(f => {
                      const badge = FLAG_BADGES[f.flag_type] ?? { label: f.flag_type, className: 'bg-gray-100 text-gray-600' };
                      return (
                        <div key={f.id} className="px-5 py-3 flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                                {badge.label}
                              </span>
                              <span className="text-xs text-gray-400">{timeAgo(f.created_at)}</span>
                              {f.resolved_at && (
                                <span className="text-xs text-green-600 inline-flex items-center gap-0.5">
                                  <Check className="w-3 h-3" /> resolved
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700">{formatFlagData(f.flag_type, f.flag_data)}</p>
                            {f.resolution_note && (
                              <p className="text-xs text-gray-400 mt-0.5">Note: {f.resolution_note}</p>
                            )}
                          </div>
                          {!f.resolved_at && (
                            <button
                              onClick={() => handleResolve(f.id)}
                              disabled={resolvingId === f.id}
                              className="text-xs font-medium text-navy-600 hover:text-navy-800 shrink-0 disabled:opacity-50"
                            >
                              {resolvingId === f.id ? 'Resolving…' : 'Mark resolved'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
