'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import StudentForm from '@/components/students/StudentForm';
import StudentAvailabilityEditor from '@/components/students/StudentAvailabilityEditor';
import SendContractForm from '@/components/contracts/SendContractForm';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Student, StudentAvailability, StudentProgress, Session } from '@/types';
import {
  ArrowLeft, Edit, Mail, Phone, User, Check, X, Upload, FileText,
  Loader2, ArrowRightLeft, Sparkles, Users,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { formatDateTime } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

const SWITCH_REASONS = [
  'Performance Issue', 'Scheduling Conflict', 'Student Request', 'Tutor Leaving', 'Other',
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`;
}

interface TutorMatch {
  tutor: { id: string; name: string; email: string; subjects: string[]; hourly_rate: number; photo_url: string | null };
  total_score: number;
  subject_score: number;
  availability_score: number;
  load_score: number;
  active_students: number;
  overlapping_slots: { day: number; start_time: string; end_time: string }[];
  match_label: 'Excellent Match' | 'Good Match' | 'Fair Match';
}

interface TutorOption { id: string; name: string; subjects: string[] }
interface ActiveContract { id: string; tutor_id: string; tutor: { name: string; email: string } | null }
interface SwitchRecord { id: string; switched_at: string; reason: string | null; old_tutor_id: string; new_tutor_id: string }

// Colored circular score badge
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-400' : 'bg-gray-400';
  return (
    <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white text-sm font-bold">{score}</span>
    </div>
  );
}

// Label chip
function MatchLabel({ label }: { label: TutorMatch['match_label'] }) {
  const cls = label === 'Excellent Match'
    ? 'bg-green-50 text-green-700 border-green-200'
    : label === 'Good Match'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${cls}`}>{label}</span>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent]         = useState<Student | null>(null);
  const [availability, setAvail]      = useState<StudentAvailability[]>([]);
  const [progress, setProgress]       = useState<StudentProgress[]>([]);
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [editOpen, setEditOpen]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [editingHours, setEditingHours]   = useState(false);
  const [hoursInput, setHoursInput]       = useState('');
  const [hoursSaving, setHoursSaving]     = useState(false);

  const [activeContract, setActiveContract] = useState<ActiveContract | null>(null);
  const [switchHistory, setSwitchHistory]   = useState<SwitchRecord[]>([]);
  const [tutorsMap, setTutorsMap]           = useState<Record<string, TutorOption>>({});

  const [switchOpen, setSwitchOpen]   = useState(false);
  const [allTutors, setAllTutors]     = useState<TutorOption[]>([]);
  const [tutorCounts, setTutorCounts] = useState<Record<string, number>>({});
  const [switchForm, setSwitchForm]   = useState({ newTutorId: '', reason: 'Scheduling Conflict', notes: '' });
  const [switching, setSwitching]     = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [loadingSwitch, setLoadingSwitch] = useState(false);

  const [uploading, setUploading]         = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [aiResult, setAiResult]           = useState<{ hours: number; reasoning: string } | null>(null);
  const [aiModalOpen, setAiModalOpen]     = useState(false);
  const [aiHoursEdit, setAiHoursEdit]     = useState('');
  const [confirmingSaving, setConfirmingSaving] = useState(false);

  // Tutor matching
  const [matches, setMatches]           = useState<TutorMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [contractMatchOpen, setContractMatchOpen] = useState(false);
  const [contractMatchTutor, setContractMatchTutor] = useState<TutorMatch['tutor'] | null>(null);
  const recommendationsRef = useRef<HTMLDivElement>(null);
  const [highlightCard, setHighlightCard] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const supabase = createClient();

  const load = useCallback(async () => {
    const [s, a, p, sess, contractRes, switchesRes, tutorsRes] = await Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),
      supabase.from('student_availability').select('*').eq('student_id', id).order('day_of_week').order('start_time'),
      supabase.from('student_progress').select('*').eq('student_id', id).order('recorded_at'),
      supabase.from('sessions').select('*, tutor:tutors(name)').eq('student_id', id).order('scheduled_at', { ascending: false }).limit(20),
      supabase.from('contracts')
        .select('id, tutor_id, tutor:tutors(name, email)')
        .eq('student_id', id)
        .neq('status', 'voided')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('tutor_switches')
        .select('id, switched_at, reason, old_tutor_id, new_tutor_id')
        .eq('student_id', id)
        .order('switched_at', { ascending: false }),
      supabase.from('tutors').select('id, name, subjects').order('name'),
    ]);
    setStudent(s.data);
    setAvail(a.data ?? []);
    setProgress(p.data ?? []);
    setSessions(sess.data as any ?? []);
    setActiveContract(contractRes.data as ActiveContract | null);
    setSwitchHistory((switchesRes.data as SwitchRecord[]) ?? []);
    const map: Record<string, TutorOption> = {};
    for (const t of (tutorsRes.data ?? []) as TutorOption[]) map[t.id] = t;
    setTutorsMap(map);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Read ?new=true client-side (avoids Suspense requirement)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isNewParam = new URLSearchParams(window.location.search).get('new') === 'true';
      setIsNew(isNewParam);
    }
  }, []);

  // Fetch tutor matches when student has no active contract
  useEffect(() => {
    if (!loading && student && !activeContract) {
      setMatchesLoading(true);
      fetch(`/api/students/${id}/tutor-matches`)
        .then(r => r.json())
        .then(data => { setMatches(Array.isArray(data) ? data : []); setMatchesLoading(false); })
        .catch(() => setMatchesLoading(false));
    }
  }, [loading, student, activeContract, id]);

  // Scroll + highlight when ?new=true
  useEffect(() => {
    if (isNew && !loading && !activeContract) {
      setHighlightCard(true);
      setTimeout(() => {
        recommendationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
      setTimeout(() => setHighlightCard(false), 3500);
    }
  }, [isNew, loading, activeContract]);

  const chartData = progress.map(p => ({
    date:  format(new Date(p.recorded_at), 'MMM d'),
    Math:  p.math_score,
    Reading: p.reading_score,
    Writing: p.writing_score,
    Total: p.total_score,
  }));

  async function saveHours() {
    const val = parseFloat(hoursInput);
    if (isNaN(val) || val < 0) return;
    setHoursSaving(true);
    await supabase.from('students').update({ purchased_hours: val, low_hours_alerted: false }).eq('id', id);
    setHoursSaving(false);
    setEditingHours(false);
    load();
  }

  async function handleGamePlanUpload(file: File) {
    setUploading(true);
    const { error: upErr } = await supabase.storage
      .from('game-plans')
      .upload(`student-${id}/gameplan.pdf`, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) { setUploading(false); alert('Upload failed: ' + upErr.message); return; }
    const { data: urlData } = await supabase.storage
      .from('game-plans')
      .createSignedUrl(`student-${id}/gameplan.pdf`, 60 * 60 * 24 * 365);
    const gamePlanUrl = urlData?.signedUrl ?? null;
    await supabase.from('students').update({ game_plan_url: gamePlanUrl, game_plan_uploaded_at: new Date().toISOString() }).eq('id', id);
    setUploading(false);
    await load();
    setExtracting(true);
    try {
      const res = await fetch(`/api/students/${id}/extract-hours`, { method: 'POST' });
      const data = await res.json();
      if (data.hours != null) { setAiResult({ hours: data.hours, reasoning: data.reasoning }); setAiHoursEdit(String(data.hours)); setAiModalOpen(true); }
    } catch { /* non-fatal */ }
    setExtracting(false);
  }

  async function confirmAiHours() {
    const val = parseFloat(aiHoursEdit);
    if (isNaN(val) || val < 0) return;
    setConfirmingSaving(true);
    await supabase.from('students').update({ purchased_hours: val, low_hours_alerted: false }).eq('id', id);
    setConfirmingSaving(false);
    setAiModalOpen(false);
    setAiResult(null);
    load();
  }

  async function openSwitchModal() {
    setSwitchOpen(true);
    setSwitchError('');
    setSwitchForm({ newTutorId: '', reason: 'Scheduling Conflict', notes: '' });
    setLoadingSwitch(true);
    const [tutorsRes, sessionsRes] = await Promise.all([
      supabase.from('tutors').select('id, name, subjects').order('name'),
      supabase.from('sessions').select('tutor_id').eq('status', 'scheduled'),
    ]);
    setAllTutors((tutorsRes.data as TutorOption[]) ?? []);
    const counts: Record<string, number> = {};
    for (const s of sessionsRes.data ?? []) counts[s.tutor_id] = (counts[s.tutor_id] ?? 0) + 1;
    setTutorCounts(counts);
    setLoadingSwitch(false);
  }

  async function submitSwitch() {
    if (!switchForm.newTutorId) { setSwitchError('Please select a new tutor.'); return; }
    setSwitching(true);
    setSwitchError('');
    try {
      const res = await fetch(`/api/students/${id}/switch-tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTutorId: switchForm.newTutorId, reason: switchForm.reason, notes: switchForm.notes || null }),
      });
      const data = await res.json();
      if (!res.ok) { setSwitchError(data.error ?? 'Switch failed'); return; }
      router.push(`/tutors/${data.newTutorId}?contractStudent=${id}`);
    } finally {
      setSwitching(false);
    }
  }

  if (loading) return <AdminLayout><div className="animate-pulse h-64 card rounded-xl" /></AdminLayout>;
  if (!student) return <AdminLayout><p className="text-gray-500">Student not found.</p></AdminLayout>;

  const latestProgress = progress[progress.length - 1];
  const purchasedHours = student?.purchased_hours ?? 0;
  const usedHours      = student?.used_hours ?? 0;
  const remainingHours = purchasedHours - usedHours;
  const pctUsed        = purchasedHours > 0 ? Math.min(100, (usedHours / purchasedHours) * 100) : 0;
  const isLow          = purchasedHours > 0 && remainingHours < 5;
  const currentTutor   = (activeContract?.tutor as any) ?? null;
  const noShowCount    = sessions.filter((s: any) =>
    s.status === 'no_show' || s.status === 'no_show_student' || s.status === 'no_show_both'
  ).length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
          <button onClick={() => setEditOpen(true)} className="btn-secondary">
            <Edit className="w-4 h-4" /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="col-span-1 space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7 text-navy-500" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{student.name}</h2>
                {student.grade && <p className="text-gray-500 text-sm">Grade {student.grade}</p>}
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4" />{student.email}</div>
              {student.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" />{student.phone}</div>}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Scores</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Current</p>
                  <p className="text-xl font-bold text-gray-900">{latestProgress?.total_score ?? student.current_score ?? '—'}</p>
                </div>
                <div className="bg-navy-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-navy-600">Target</p>
                  <p className="text-xl font-bold text-navy-900">{student.target_score ?? '—'}</p>
                </div>
              </div>
            </div>

            {noShowCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">No-Shows</p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
                  {noShowCount} session{noShowCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {student.parent_name && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Parent/Guardian</p>
                <p className="text-sm text-gray-700 font-medium">{student.parent_name}</p>
                {student.parent_email && <p className="text-sm text-gray-500">{student.parent_email}</p>}
              </div>
            )}

            {/* Tutor Assignment */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Assigned Tutor</p>
              <p className="text-sm text-gray-900 font-medium mb-2">
                {currentTutor?.name ?? <span className="text-gray-400 italic">None assigned</span>}
              </p>
              {activeContract && (
                <button
                  onClick={openSwitchModal}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
                >
                  <ArrowRightLeft className="w-3 h-3" /> Switch Tutor
                </button>
              )}
            </div>

            {student.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{student.notes}</p>
              </div>
            )}
          </div>

          {/* Hours Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Hours</p>
              {isLow && <span className="text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">Low</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Purchased</p>
                <p className="text-lg font-bold text-gray-900">{purchasedHours}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Used</p>
                <p className="text-lg font-bold text-gray-900">{usedHours.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Remaining</p>
                <p className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>{remainingHours.toFixed(1)}</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
              <div className={`h-2 rounded-full transition-all ${pctUsed >= 80 ? 'bg-red-500' : pctUsed >= 60 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pctUsed}%` }} />
            </div>
            {editingHours ? (
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="0.5" value={hoursInput} onChange={e => setHoursInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveHours(); if (e.key === 'Escape') setEditingHours(false); }} className="input text-sm py-1.5 flex-1" autoFocus />
                <button onClick={saveHours} disabled={hoursSaving} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingHours(false)} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => { setHoursInput(String(purchasedHours)); setEditingHours(true); }} className="w-full text-xs text-navy-600 hover:text-navy-800 font-medium text-center py-1 rounded-lg hover:bg-navy-50 transition-colors">
                Edit purchased hours
              </button>
            )}
          </div>

          {/* Game Plan Card */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3">Game Plan</p>
            {student.game_plan_url && (
              <a href={student.game_plan_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-navy-700 hover:text-navy-900 font-medium mb-3">
                <FileText className="w-4 h-4 flex-shrink-0" /> View current game plan
              </a>
            )}
            {(uploading || extracting) ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                {uploading ? 'Uploading…' : 'Extracting hours with AI…'}
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-navy-700 hover:bg-navy-50 rounded-lg px-3 py-2 border border-dashed border-gray-300 hover:border-navy-300 transition-colors">
                <Upload className="w-4 h-4 flex-shrink-0" />
                {student.game_plan_url ? 'Replace game plan PDF' : 'Upload game plan PDF'}
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleGamePlanUpload(f); e.target.value = ''; }} />
              </label>
            )}
            {student.game_plan_uploaded_at && (
              <p className="text-xs text-gray-400 mt-2">Uploaded {new Date(student.game_plan_uploaded_at).toLocaleDateString()}</p>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* ── Recommended Tutors ─────────────────────────── */}
          {!activeContract && (
            <div
              ref={recommendationsRef}
              className={`card p-6 transition-all duration-300 ${
                highlightCard
                  ? 'ring-2 ring-navy-500 ring-offset-2 shadow-lg'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-navy-600" />
                <h2 className="font-semibold text-gray-900">Recommended Tutors</h2>
              </div>

              {matchesLoading ? (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-48" />
                  ))}
                </div>
              ) : matches.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center text-gray-400">
                  <Users className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">No tutors available yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {matches.map(match => (
                    <div
                      key={match.tutor.id}
                      className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                    >
                      {/* Header: avatar + score badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {match.tutor.photo_url ? (
                            <Image
                              src={match.tutor.photo_url}
                              alt={match.tutor.name}
                              width={40} height={40}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-navy-700 font-semibold text-sm">
                                {match.tutor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{match.tutor.name}</p>
                            <p className="text-xs text-navy-700 font-medium">${match.tutor.hourly_rate}/hr</p>
                          </div>
                        </div>
                        <ScoreBadge score={match.total_score} />
                      </div>

                      {/* Match label */}
                      <MatchLabel label={match.match_label} />

                      {/* Subjects */}
                      {match.tutor.subjects.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {match.tutor.subjects.slice(0, 3).map(s => (
                            <span key={s} className="text-xs bg-navy-50 text-navy-700 rounded-md px-1.5 py-0.5">{s}</span>
                          ))}
                        </div>
                      )}

                      {/* Stats */}
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          <span>{match.active_students} active student{match.active_students !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Overlapping slots */}
                        {match.overlapping_slots.length > 0 && (
                          <div>
                            <p className="text-gray-400 mb-0.5">Shared availability:</p>
                            <div className="space-y-0.5">
                              {match.overlapping_slots.slice(0, 3).map((slot, i) => (
                                <p key={i} className="text-navy-600 font-medium">
                                  {DAY_SHORT[slot.day]} {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
                                </p>
                              ))}
                              {match.overlapping_slots.length > 3 && (
                                <p className="text-gray-400">+{match.overlapping_slots.length - 3} more</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CTA */}
                      <button
                        onClick={() => {
                          setContractMatchTutor(match.tutor);
                          setContractMatchOpen(true);
                        }}
                        className="mt-auto w-full text-xs font-medium bg-navy-900 hover:bg-navy-800 text-white rounded-lg px-3 py-2 transition-colors"
                      >
                        Assign &amp; Send Contract
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Progress Chart */}
          {chartData.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Score Progress</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis domain={[400, 1600]} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Total" stroke="#1e2090" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Math" stroke="#6b84ff" strokeWidth={1.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Reading" stroke="#10b981" strokeWidth={1.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Availability */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Weekly Availability</h2>
            <StudentAvailabilityEditor studentId={id} availability={availability} onRefresh={load} />
          </div>

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Tutor</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.length === 0 && (
                  <tr><td colSpan={5} className="table-cell text-gray-400 text-center py-6">No sessions yet</td></tr>
                )}
                {sessions.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell">{formatDateTime(s.scheduled_at)}</td>
                    <td className="table-cell">{s.tutor?.name ?? '—'}</td>
                    <td className="table-cell">{s.duration_minutes} min</td>
                    <td className="table-cell">
                      {s.status === 'cancelled' && s.cancellation_reason === 'tutor_switch'
                        ? <span className="badge bg-orange-100 text-orange-700">Cancelled (Switch)</span>
                        : <StatusBadge status={s.status} />}
                    </td>
                    <td className="table-cell"><StatusBadge status={s.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tutor Switch History */}
          {switchHistory.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Tutor Switch History</h2>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">From</th>
                    <th className="table-header">To</th>
                    <th className="table-header">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {switchHistory.map(sw => (
                    <tr key={sw.id} className="hover:bg-gray-50">
                      <td className="table-cell text-sm text-gray-500">{formatDateTime(sw.switched_at)}</td>
                      <td className="table-cell text-gray-700">{tutorsMap[sw.old_tutor_id]?.name ?? '—'}</td>
                      <td className="table-cell font-medium text-gray-900">{tutorsMap[sw.new_tutor_id]?.name ?? '—'}</td>
                      <td className="table-cell text-gray-500">{sw.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Student" size="lg">
        <StudentForm student={student} onSuccess={() => { setEditOpen(false); load(); }} onCancel={() => setEditOpen(false)} />
      </Modal>

      {/* AI hours confirmation modal */}
      <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="AI Hours Detected">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            AI detected <span className="font-semibold text-gray-900">{aiResult?.hours} hours</span> in the game plan. Set this as {student.name}&apos;s purchased hours?
          </p>
          {aiResult?.reasoning && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">{aiResult.reasoning}</div>
          )}
          <div>
            <label className="label">Hours (edit if needed)</label>
            <input type="number" min="0" step="0.5" value={aiHoursEdit} onChange={e => setAiHoursEdit(e.target.value)} className="input" autoFocus />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setAiModalOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="button" onClick={confirmAiHours} disabled={confirmingSaving} className="btn-primary flex-1 justify-center">
              {confirmingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmingSaving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Switch Tutor modal */}
      <Modal open={switchOpen} onClose={() => setSwitchOpen(false)} title="Switch Tutor" size="lg">
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            This will void the current contract, cancel all future sessions with the old tutor, and notify all parties.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500 mb-0.5">Current Tutor</p>
            <p className="font-semibold text-gray-900">{currentTutor?.name ?? '—'}</p>
          </div>
          {loadingSwitch ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading tutors…
            </div>
          ) : (
            <>
              <div>
                <label className="label">New Tutor *</label>
                <select value={switchForm.newTutorId} onChange={e => setSwitchForm(f => ({ ...f, newTutorId: e.target.value }))} className="input">
                  <option value="">Select a tutor…</option>
                  {allTutors.filter(t => t.id !== activeContract?.tutor_id).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.subjects?.length ? ` — ${t.subjects.join(', ')}` : ''}
                      {` (${tutorCounts[t.id] ?? 0} scheduled sessions)`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reason *</label>
                <select value={switchForm.reason} onChange={e => setSwitchForm(f => ({ ...f, reason: e.target.value }))} className="input">
                  {SWITCH_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <textarea value={switchForm.notes} onChange={e => setSwitchForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} placeholder="Additional context…" />
              </div>
            </>
          )}
          {switchError && <p className="text-sm text-red-600">{switchError}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setSwitchOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="button" onClick={submitSwitch} disabled={!switchForm.newTutorId || switching || loadingSwitch} className="btn-primary flex-1 justify-center">
              {switching && <Loader2 className="w-4 h-4 animate-spin" />}
              {switching ? 'Switching…' : 'Confirm Switch'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assign & Send Contract from recommended tutor */}
      {contractMatchTutor && (
        <Modal
          open={contractMatchOpen}
          onClose={() => { setContractMatchOpen(false); setContractMatchTutor(null); }}
          title={`Send Contract — ${contractMatchTutor.name}`}
          size="lg"
        >
          <SendContractForm
            tutorId={contractMatchTutor.id}
            defaultRate={contractMatchTutor.hourly_rate}
            defaultStudentId={id}
            onSuccess={() => { setContractMatchOpen(false); setContractMatchTutor(null); load(); }}
            onCancel={() => { setContractMatchOpen(false); setContractMatchTutor(null); }}
          />
        </Modal>
      )}
    </AdminLayout>
  );
}
