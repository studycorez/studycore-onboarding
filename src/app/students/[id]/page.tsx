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
import { getAdminOnboardingCount } from '@/hooks/useParentAuth';
import {
  ArrowLeft, Edit, Mail, Phone, User, Check, X, Upload, FileText,
  Loader2, ArrowRightLeft, Sparkles, Users, ClipboardList, Send, Zap, Trash2, ChevronDown, RefreshCw, Plus, AlertTriangle, Download, Video, Pencil,
} from 'lucide-react';
import { TutorScoreBadge } from '@/components/TutorScoreBadge';
import { calculateTutorScore } from '@/lib/tutorScore';
import { getLevelName, getAnimalEmoji, BADGE_DEFS } from '@/lib/xp';
import Link from 'next/link';
import Image from 'next/image';
import { formatDateTime } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
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
  const [downloadingReport, setDownloadingReport] = useState(false);
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

  const [billableSessions, setBillableSessions] = useState<{ duration_minutes: number }[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [completedCount, setCompletedCount]     = useState<number>(0);

  interface StudentEmail { id: string; email: string; label: string; }
  const [studentEmails, setStudentEmails]   = useState<StudentEmail[]>([]);
  const [addingEmail, setAddingEmail]       = useState(false);
  const [newEmail, setNewEmail]             = useState('');
  const [newEmailLabel, setNewEmailLabel]   = useState('secondary');
  const [savingEmail, setSavingEmail]       = useState(false);

  const [syncingHours, setSyncingHours]   = useState(false);
  const [hoursSynced, setHoursSynced]     = useState(false);

  const [uploading, setUploading]         = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [dragOver, setDragOver]           = useState(false);
  const [aiResult, setAiResult]           = useState<{ hours: number | null; target_score: number | null; test_date: string | null; weak_areas: string[] | null; reasoning: string } | null>(null);
  const [aiModalOpen, setAiModalOpen]     = useState(false);
  const [aiHoursEdit, setAiHoursEdit]     = useState('');
  const [confirmingSaving, setConfirmingSaving] = useState(false);

  // Onboarding
  const [sendingOnboarding, setSendingOnboarding] = useState(false);
  const [onboardingSent, setOnboardingSent]       = useState(false);
  const [onboardingError, setOnboardingError]     = useState('');

  // Student portal setup
  const [sendingSetup, setSendingSetup] = useState(false);
  const [setupSent, setSetupSent]       = useState(false);
  const [setupError, setSetupError]     = useState('');

  // Student onboarding email
  const [sendingStudentOnboarding, setSendingStudentOnboarding] = useState(false);
  const [studentOnboardingSent, setStudentOnboardingSent]       = useState(false);
  const [studentOnboardingError, setStudentOnboardingError]     = useState('');

  // Group sessions settings
  const [groupEnabled,    setGroupEnabled]    = useState(false);
  const [groupHours,      setGroupHours]      = useState('0');
  const [groupSaving,     setGroupSaving]     = useState(false);
  const [groupSaved,      setGroupSaved]      = useState(false);

  // Status + delete
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleteOpen, setDeleteOpen]         = useState(false);
  const [deleting, setDeleting]             = useState(false);

  const [portalError, setPortalError] = useState('');

  // Impersonation
  async function openPortalAs(type: 'student' | 'parent') {
    setPortalError('');
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
    if (!res.ok) {
      setPortalError('Failed to generate preview link.');
      setTimeout(() => setPortalError(''), 4000);
      return;
    }
    const { token } = await res.json();
    const portal = type === 'student' ? 'student-portal' : 'parent-portal';
    window.open(`/${portal}/impersonate?token=${encodeURIComponent(token)}`, '_blank');
  }

  // Recording modal
  const [recSession, setRecSession]   = useState<any | null>(null);
  const [recUrl, setRecUrl]           = useState('');
  const [recSaving, setRecSaving]     = useState(false);
  const [recToast, setRecToast]       = useState('');

  async function saveRecordingUrl(sessionId: string, url: string) {
    setRecSaving(true);
    await supabase.from('sessions').update({ fathom_recording_url: url || null }).eq('id', sessionId);
    setSessions(prev => prev.map((s: any) => s.id === sessionId ? { ...s, fathom_recording_url: url || null } : s));
    setRecSession(null);
    setRecUrl('');
    setRecSaving(false);
    setRecToast('Recording saved');
    setTimeout(() => setRecToast(''), 3000);
  }

  // Makeup session modal
  interface MakeupTutor { id: string; name: string; }
  const [makeupOpen, setMakeupOpen]       = useState(false);
  const [makeupTutors, setMakeupTutors]   = useState<MakeupTutor[]>([]);
  const [makeupForm, setMakeupForm]       = useState({
    tutorId: '', date: '', time: '17:00', duration: 60 as 30 | 60 | 90 | 120,
    sessionType: 'Makeup Session', note: '',
  });
  const [makeupSubmitting, setMakeupSubmitting] = useState(false);
  const [makeupError, setMakeupError]     = useState('');
  const [makeupWarning, setMakeupWarning] = useState('');
  const [makeupToast, setMakeupToast]     = useState('');

  // Tutor matching
  const [matches, setMatches]           = useState<TutorMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [contractMatchOpen, setContractMatchOpen] = useState(false);
  const [contractMatchTutor, setContractMatchTutor] = useState<TutorMatch['tutor'] | null>(null);
  const recommendationsRef = useRef<HTMLDivElement>(null);
  const [highlightCard, setHighlightCard] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const [assignOpen, setAssignOpen]       = useState(false);
  const [assignTutorId, setAssignTutorId] = useState('');
  const [assigning, setAssigning]         = useState(false);
  const [assignError, setAssignError]     = useState('');
  const [currentTutorScore, setCurrentTutorScore] = useState<number | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    const [s, a, p, sess, billable, emailsRes, contractRes, switchesRes, tutorsRes, upcomingRes, completedRes] = await Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),
      supabase.from('student_availability').select('*').eq('student_id', id).order('day_of_week').order('start_time'),
      supabase.from('student_progress').select('*').eq('student_id', id).order('recorded_at'),
      supabase.from('sessions').select('*, tutor:tutors(name)').eq('student_id', id).order('scheduled_at', { ascending: true }).limit(20),
      supabase.from('sessions').select('duration_minutes').eq('student_id', id).in('status', ['completed', 'no_show_student']),
      supabase.from('student_emails').select('id, email, label').eq('student_id', id).order('created_at'),
      supabase.from('contracts')
        .select('id, tutor_id, tutor:tutors(name, email)')
        .eq('student_id', id)
        .eq('status', 'signed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('tutor_switches')
        .select('id, switched_at, reason, old_tutor_id, new_tutor_id')
        .eq('student_id', id)
        .order('switched_at', { ascending: false }),
      supabase.from('tutors').select('id, name, subjects').order('name'),
      supabase.from('sessions')
        .select('id, scheduled_at, duration_minutes, zoom_join_url, tutor:tutors(name)')
        .eq('student_id', id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10),
      supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', id)
        .eq('status', 'completed'),
    ]);
    setStudent(s.data);
    setAvail(a.data ?? []);
    setProgress(p.data ?? []);
    setSessions(sess.data as any ?? []);
    setBillableSessions((billable.data ?? []) as { duration_minutes: number }[]);
    setUpcomingSessions(upcomingRes.data ?? []);
    setCompletedCount(completedRes.count ?? 0);
    setStudentEmails((emailsRes.data ?? []) as StudentEmail[]);
    setActiveContract(contractRes.data as ActiveContract | null);
    setSwitchHistory((switchesRes.data as SwitchRecord[]) ?? []);
    const map: Record<string, TutorOption> = {};
    for (const t of (tutorsRes.data ?? []) as TutorOption[]) map[t.id] = t;
    setTutorsMap(map);
    // Initialize group sessions state
    if (s.data) {
      setGroupEnabled((s.data as any).group_sessions_enabled ?? false);
      setGroupHours(String((s.data as any).group_session_hours_allocated ?? 0));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load tutor score when current tutor is known
  const currentTutorIdForScore = (activeContract?.tutor as any)?.id ?? null;
  useEffect(() => {
    if (!currentTutorIdForScore) { setCurrentTutorScore(null); return; }
    calculateTutorScore(currentTutorIdForScore, supabase).then(r => setCurrentTutorScore(r.composite));
  }, [currentTutorIdForScore]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveEmail() {
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    await fetch(`/api/students/${id}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), label: newEmailLabel }),
    });
    setNewEmail('');
    setNewEmailLabel('secondary');
    setAddingEmail(false);
    setSavingEmail(false);
    load();
  }

  async function deleteEmail(emailId: string) {
    await fetch(`/api/students/${id}/emails/${emailId}`, { method: 'DELETE' });
    load();
  }

  async function syncHours() {
    setSyncingHours(true);
    await fetch('/api/students/sync-hours', { method: 'POST' });
    await load();
    setSyncingHours(false);
    setHoursSynced(true);
    setTimeout(() => setHoursSynced(false), 3000);
  }

  async function openMakeupModal() {
    // Fetch tutors with signed contracts for this student
    const { data: contracts } = await supabase
      .from('contracts')
      .select('tutor_id, tutor:tutors(id, name)')
      .eq('student_id', id)
      .eq('status', 'signed');

    let tutors: MakeupTutor[] = [];
    if (contracts && contracts.length > 0) {
      tutors = contracts.map((c: any) => ({ id: c.tutor?.id ?? c.tutor_id, name: c.tutor?.name ?? 'Unknown' }));
    } else {
      // Fallback: all tutors
      const { data: allTutorData } = await supabase.from('tutors').select('id, name').order('name');
      tutors = (allTutorData ?? []) as MakeupTutor[];
    }

    // Default tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    setMakeupTutors(tutors);
    setMakeupForm({
      tutorId: activeContract?.tutor_id ?? tutors[0]?.id ?? '',
      date: tomorrowStr,
      time: '17:00',
      duration: 60,
      sessionType: 'Makeup Session',
      note: '',
    });
    setMakeupError('');
    setMakeupWarning('');
    setMakeupOpen(true);
  }

  async function submitMakeup() {
    if (!makeupForm.tutorId || !makeupForm.date || !makeupForm.time) {
      setMakeupError('Please fill in all required fields.');
      return;
    }
    setMakeupSubmitting(true);
    setMakeupError('');
    setMakeupWarning('');

    // Convert local date+time to UTC using student's timezone
    const tz = (student as any)?.timezone ?? 'America/New_York';
    const localIso = `${makeupForm.date}T${makeupForm.time}:00`;
    const localDt  = new Date(localIso);
    const tzDt     = new Date(localDt.toLocaleString('en-US', { timeZone: tz }));
    const scheduledAt = new Date(localDt.getTime() + (localDt.getTime() - tzDt.getTime())).toISOString();

    try {
      const res = await fetch('/api/sessions/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id:      id,
          tutor_id:        makeupForm.tutorId,
          scheduled_at:    scheduledAt,
          duration_minutes: makeupForm.duration,
          session_type:    makeupForm.sessionType,
          note_to_tutor:   makeupForm.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMakeupError(data.error ?? `Error ${res.status}`);
        setMakeupSubmitting(false);
        return;
      }

      const bookedDate = new Date(scheduledAt).toLocaleDateString('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
      });

      setMakeupOpen(false);
      await load(); // refresh session history
      setMakeupToast(`Makeup session booked for ${bookedDate}`);
      setTimeout(() => setMakeupToast(''), 4000);

      if (!data.zoomCreated) {
        setMakeupWarning('Session booked but Zoom link failed — add it manually');
        setTimeout(() => setMakeupWarning(''), 6000);
      }
    } catch {
      setMakeupError('Network error — please try again.');
    } finally {
      setMakeupSubmitting(false);
    }
  }

  async function saveGroupSessions() {
    setGroupSaving(true);
    try {
      const res = await fetch('/api/students/group-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: id,
          group_sessions_enabled: groupEnabled,
          group_session_hours_allocated: parseFloat(groupHours) || 0,
        }),
      });
      if (res.ok) {
        setGroupSaved(true);
        setTimeout(() => setGroupSaved(false), 3000);
        await load();
      }
    } finally {
      setGroupSaving(false);
    }
  }

  const [uploadError, setUploadError] = useState('');

  async function handleGamePlanUpload(file: File) {
    if (!file.type.includes('pdf')) {
      setUploadError('Please upload a PDF file.');
      setTimeout(() => setUploadError(''), 4000);
      return;
    }
    setUploadError('');
    setUploading(true);
    const { error: upErr } = await supabase.storage
      .from('game-plans')
      .upload(`student-${id}/gameplan.pdf`, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) {
      setUploading(false);
      setUploadError('Upload failed: ' + upErr.message);
      setTimeout(() => setUploadError(''), 5000);
      return;
    }
    const { data: urlData } = supabase.storage
      .from('game-plans')
      .getPublicUrl(`student-${id}/gameplan.pdf`);
    const gamePlanUrl = urlData?.publicUrl ?? null;
    await supabase.from('students').update({ game_plan_url: gamePlanUrl, game_plan_uploaded_at: new Date().toISOString() }).eq('id', id);
    setUploading(false);
    await load();
    setExtracting(true);
    try {
      const res = await fetch(`/api/students/${id}/extract-hours`, { method: 'POST' });
      const data = await res.json();
      const hasAny = data.hours != null || data.target_score != null || data.test_date != null || (Array.isArray(data.weak_areas) && data.weak_areas.length > 0);
      if (hasAny) {
        setAiResult({ hours: data.hours, target_score: data.target_score, test_date: data.test_date, weak_areas: data.weak_areas, reasoning: data.reasoning });
        setAiHoursEdit(data.hours != null ? String(data.hours) : '');
        setAiModalOpen(true);
        await load(); // reload to show extracted data
      }
    } catch { /* non-fatal */ }
    setExtracting(false);
  }

  async function sendStudentOnboarding() {
    setSendingStudentOnboarding(true);
    setStudentOnboardingError('');
    const res = await fetch(`/api/students/${id}/send-student-onboarding`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStudentOnboardingError(body.error || 'Failed to send email.');
    } else {
      setStudentOnboardingSent(true);
      setTimeout(() => setStudentOnboardingSent(false), 4000);
    }
    setSendingStudentOnboarding(false);
  }

  async function sendStudentSetup() {
    setSendingSetup(true);
    setSetupError('');
    const res = await fetch('/api/student-portal/send-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSetupError(body.error || 'Failed to send email.');
    } else {
      setSetupSent(true);
    }
    setSendingSetup(false);
  }

  async function handleStatusChange(newStatus: string) {
    if (!student) return;
    setUpdatingStatus(true);
    await fetch(`/api/students/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdatingStatus(false);
    load();
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/students/${id}`, { method: 'DELETE' });
    router.push('/students');
  }

  async function sendOnboardingEmail() {
    setSendingOnboarding(true);
    setOnboardingError('');
    const res = await fetch('/api/parent-portal/send-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setOnboardingError(body.error || 'Failed to send email.');
    } else {
      setOnboardingSent(true);
      load();
    }
    setSendingOnboarding(false);
  }

  async function confirmAiHours() {
    setConfirmingSaving(true);
    const patch: Record<string, any> = { low_hours_alerted: false };
    const val = parseFloat(aiHoursEdit);
    if (!isNaN(val) && val >= 0) patch.purchased_hours = val;
    if (aiResult?.target_score != null) patch.target_score = aiResult.target_score;
    if (aiResult?.test_date) patch.test_date = aiResult.test_date;
    if (Array.isArray(aiResult?.weak_areas) && aiResult!.weak_areas!.length > 0) patch.weak_areas = aiResult!.weak_areas;
    await supabase.from('students').update(patch).eq('id', id);
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

  async function assignTutor() {
    if (!assignTutorId) { setAssignError('Please select a tutor.'); return; }
    setAssigning(true);
    setAssignError('');
    try {
      const res = await fetch(`/api/students/${id}/assign-tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId: assignTutorId }),
      });
      const data = await res.json();
      if (!res.ok) { setAssignError(data.error ?? 'Failed to assign tutor'); return; }
      setAssignOpen(false);
      setAssignTutorId('');
      load();
    } finally {
      setAssigning(false);
    }
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
  const totalBillableMinutes = billableSessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const usedHours      = Math.round((totalBillableMinutes / 60) * 2) / 2;
  const scheduledHours = Math.round((upcomingSessions.reduce((sum: number, s: any) => sum + (s.duration_minutes ?? 0), 0) / 60) * 2) / 2;
  const completedSessionCount = billableSessions.length;
  const remainingHours = purchasedHours - usedHours;
  const pctUsed        = purchasedHours > 0 ? Math.min(100, (usedHours / purchasedHours) * 100) : 0;
  const isLow          = purchasedHours > 0 && remainingHours < 5;
  const currentTutor   = (activeContract?.tutor as any) ?? null;
  const noShowCount    = sessions.filter((s: any) =>
    s.status === 'no_show' || s.status === 'no_show_student' || s.status === 'no_show_both'
  ).length;

  // Score goal tracker
  const progressWithTotal = progress.filter(p => p.total_score != null);
  const startingScore = progressWithTotal.length > 0 ? progressWithTotal[0].total_score! : (student.current_score ?? null);
  const currentScore  = progressWithTotal.length > 0
    ? progressWithTotal[progressWithTotal.length - 1].total_score!
    : (student.current_score ?? null);
  const targetScore   = student.target_score ?? null;
  const pointsToGoal  = currentScore != null && targetScore != null ? targetScore - currentScore : null;
  const goalRange     = startingScore != null && targetScore != null && targetScore !== startingScore
    ? targetScore - startingScore : null;
  const pctToGoal     = goalRange != null && currentScore != null && startingScore != null
    ? Math.min(100, Math.max(0, ((currentScore - startingScore) / goalRange) * 100))
    : null;
  const goalBarColor  = pointsToGoal == null ? 'bg-gray-300'
    : pointsToGoal <= 50  ? 'bg-green-500'
    : pointsToGoal <= 150 ? 'bg-amber-400'
    : 'bg-red-500';

  return (
    <AdminLayout>
      {/* Toasts */}
      {makeupToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2090] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4" /> {makeupToast}
        </div>
      )}
      {recToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2090] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4" /> {recToast}
        </div>
      )}
      {makeupWarning && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {makeupWarning}
        </div>
      )}
      {portalError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <X className="w-4 h-4" /> {portalError}
        </div>
      )}
      {uploadError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <X className="w-4 h-4" /> {uploadError}
        </div>
      )}

      <div className="mb-6">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        {(student.email.includes('@studycore.import') || /^student-/.test(student.email)) && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              This student has a placeholder email (<span className="font-mono font-semibold">{student.email}</span>) — update it to enable communications.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
            {(() => {
              const s = student.status ?? 'active';
              const cls = s === 'active' ? 'bg-green-100 text-green-700'
                : s === 'completed' ? 'bg-blue-100 text-blue-700'
                : s === 'paused' ? 'bg-gray-100 text-gray-600'
                : 'bg-red-100 text-red-700';
              return (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${cls}`}>{s}</span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {/* Change Status */}
            <div className="relative">
              <select
                value={student.status ?? 'active'}
                onChange={e => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                className="appearance-none btn-secondary pr-7 text-sm cursor-pointer"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
                <option value="refunded">Refunded</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
            <button
              onClick={async () => {
                setDownloadingReport(true);
                const res = await fetch(`/api/students/${id}/progress-report`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ days: 30 }),
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ?? 'report.pdf';
                  a.click();
                  URL.revokeObjectURL(url);
                }
                setDownloadingReport(false);
              }}
              disabled={downloadingReport}
              className="btn-secondary flex items-center gap-2"
            >
              {downloadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloadingReport ? 'Generating…' : 'Progress Report'}
            </button>
            <button
              onClick={() => openPortalAs('student')}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="Preview student portal"
            >
              👁 Student View
            </button>
            <button
              onClick={() => openPortalAs('parent')}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="Preview parent portal"
            >
              👁 Parent View
            </button>
            <button onClick={() => setEditOpen(true)} className="btn-secondary">
              <Edit className="w-4 h-4" /> Edit
            </button>
          </div>
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
            <div className="space-y-2 text-sm text-gray-600">
              {/* Primary email */}
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{student.email}</span>
                <span className="ml-auto text-xs font-medium bg-navy-100 text-navy-700 rounded-full px-1.5 py-0.5 flex-shrink-0">Primary</span>
              </div>

              {/* Additional emails */}
              {studentEmails.map(e => (
                <div key={e.id} className="flex items-center gap-2 pl-6">
                  <span className="truncate flex-1">{e.email}</span>
                  <span className="text-xs text-gray-400 capitalize flex-shrink-0">{e.label}</span>
                  <button onClick={() => deleteEmail(e.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0" title="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add email inline form */}
              {addingEmail ? (
                <div className="pl-6 space-y-1.5">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') setAddingEmail(false); }}
                    placeholder="email@example.com"
                    className="input text-xs py-1 w-full"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <select value={newEmailLabel} onChange={e => setNewEmailLabel(e.target.value)} className="input text-xs py-1 flex-1">
                      <option value="secondary">Secondary</option>
                      <option value="parent">Parent</option>
                      <option value="school">School</option>
                      <option value="other">Other</option>
                    </select>
                    <button onClick={saveEmail} disabled={savingEmail || !newEmail.trim()} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setAddingEmail(false); setNewEmail(''); }} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingEmail(true)} className="pl-6 flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 font-medium transition-colors">
                  <Plus className="w-3 h-3" /> Add email
                </button>
              )}

              {student.phone && <div className="flex items-center gap-2 mt-1"><Phone className="w-4 h-4 flex-shrink-0" />{student.phone}</div>}
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
              {currentTutor ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm text-gray-900 font-medium truncate">{currentTutor.name}</p>
                    {currentTutorScore != null && <TutorScoreBadge score={currentTutorScore} />}
                  </div>
                  <button
                    onClick={openSwitchModal}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 hover:bg-amber-100 transition-colors shrink-0"
                  >
                    <ArrowRightLeft className="w-3 h-3" /> Switch
                  </button>
                </div>
              ) : assignOpen ? (
                <div className="space-y-2">
                  <select
                    value={assignTutorId}
                    onChange={e => setAssignTutorId(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-500"
                  >
                    <option value="">Select tutor…</option>
                    {Object.values(tutorsMap).sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.subjects ? ` — ${t.subjects}` : ''}</option>
                    ))}
                  </select>
                  {assignError && <p className="text-xs text-red-600">{assignError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={assignTutor}
                      disabled={assigning}
                      className="flex-1 text-xs font-medium bg-navy-700 text-white rounded-lg px-2 py-1.5 hover:bg-navy-800 disabled:opacity-50 transition-colors"
                    >
                      {assigning ? 'Saving…' : 'Assign'}
                    </button>
                    <button
                      onClick={() => { setAssignOpen(false); setAssignTutorId(''); setAssignError(''); }}
                      className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-400 italic">None assigned</p>
                  <button
                    onClick={() => { setAssignOpen(true); setAssignError(''); }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white bg-navy-700 rounded-lg px-2.5 py-1.5 hover:bg-navy-800 transition-colors shrink-0"
                  >
                    <Plus className="w-3 h-3" /> Assign Tutor
                  </button>
                </div>
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
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Purchased</p>
                <p className="text-lg font-bold text-gray-900">{purchasedHours}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Used</p>
                <p className="text-lg font-bold text-gray-900">{usedHours.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Scheduled</p>
                <p className="text-lg font-bold text-blue-600">{scheduledHours.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Remaining</p>
                <p className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>{remainingHours.toFixed(1)}</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full transition-all ${pctUsed >= 80 ? 'bg-red-500' : pctUsed >= 60 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pctUsed}%` }} />
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {completedSessionCount} session{completedSessionCount !== 1 ? 's' : ''} completed = {usedHours} hr{usedHours !== 1 ? 's' : ''} used
            </p>
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
            <button
              onClick={syncHours}
              disabled={syncingHours}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${syncingHours ? 'animate-spin' : ''}`} />
              {syncingHours ? 'Syncing…' : 'Sync Hours'}
            </button>
            {hoursSynced && (
              <p className="mt-1.5 text-xs font-medium text-green-600 text-center">Hours synced</p>
            )}
          </div>

          {/* Group Sessions Card */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-navy-500" />
              <p className="text-sm font-semibold text-gray-900">Group Sessions</p>
            </div>

            <div className="space-y-3">
              {/* Toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">Eligible for group sessions</p>
                <button
                  type="button"
                  onClick={() => setGroupEnabled(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${groupEnabled ? 'bg-navy-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${groupEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>

              {/* Hours allocated */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Hours allocated</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={groupHours}
                  onChange={e => setGroupHours(e.target.value)}
                  className="input text-sm py-1.5"
                />
              </div>

              {/* Read-only stats */}
              {student && (() => {
                const used      = (student as any).group_session_hours_used ?? 0;
                const allocated = (student as any).group_session_hours_allocated ?? 0;
                const remaining = Math.max(0, allocated - used);
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center bg-gray-50 rounded-lg py-2">
                      <p className="text-xs text-gray-400">Used</p>
                      <p className="text-base font-bold text-gray-700">{used}</p>
                    </div>
                    <div className={`text-center rounded-lg py-2 ${remaining > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className={`text-xs ${remaining > 0 ? 'text-green-500' : 'text-red-400'}`}>Remaining</p>
                      <p className={`text-base font-bold ${remaining > 0 ? 'text-green-700' : 'text-red-600'}`}>{remaining}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Save button */}
              <button
                onClick={saveGroupSessions}
                disabled={groupSaving}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-navy-700 rounded-lg py-2 hover:bg-navy-800 transition-colors disabled:opacity-50"
              >
                {groupSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {groupSaved ? '✓ Saved' : groupSaving ? 'Saving…' : 'Save Group Settings'}
              </button>
            </div>
          </div>

          {/* Student Portal Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-semibold text-gray-900">Student Portal</p>
              </div>
              {student.portal_password_hash && (
                <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-semibold">Active</span>
              )}
            </div>

            {/* XP + Level */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-amber-50 rounded-lg p-2 text-center">
                <p className="text-xs text-amber-600">XP</p>
                <p className="font-bold text-amber-700">{student.xp_points ?? 0}</p>
              </div>
              <div className="bg-navy-50 rounded-lg p-2 text-center">
                <p className="text-xs text-navy-600">Level</p>
                <p className="font-bold text-navy-700">{getLevelName(student.xp_level ?? 1)}</p>
              </div>
            </div>

            {/* Avatar */}
            {(student.avatar_animal || student.avatar_color) && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
                <span className="text-xl">{getAnimalEmoji(student.avatar_animal ?? 'Fox')}</span>
                <span className="text-xs text-gray-600 font-medium">
                  {student.avatar_color} {student.avatar_animal}
                </span>
                {student.streak_weeks > 0 && (
                  <span className="ml-auto text-xs text-orange-600">{student.streak_weeks}🔥</span>
                )}
              </div>
            )}

            {/* Badges */}
            {(student.badges ?? []).length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1.5">{(student.badges ?? []).length} badge{(student.badges ?? []).length !== 1 ? 's' : ''} earned</p>
                <div className="flex flex-wrap gap-1">
                  {(student.badges ?? []).map(key => {
                    const b = BADGE_DEFS[key as keyof typeof BADGE_DEFS];
                    return b ? (
                      <span key={key} className="text-lg" title={b.label}>{b.icon}</span>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Student onboarding email */}
            {studentOnboardingError && <p className="text-xs text-red-600 mb-2">{studentOnboardingError}</p>}
            {studentOnboardingSent && <p className="text-xs text-green-600 mb-2 font-medium">Onboarding email sent!</p>}
            <button
              onClick={sendStudentOnboarding}
              disabled={sendingStudentOnboarding || !student.email}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-navy-700 border border-navy-700 rounded-lg px-3 py-2 hover:bg-navy-800 transition-colors disabled:opacity-50 mb-2"
            >
              {sendingStudentOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send Student Onboarding Email
            </button>

            {/* Setup / Resend button */}
            {setupError && <p className="text-xs text-red-600 mb-2">{setupError}</p>}
            {setupSent && <p className="text-xs text-green-600 mb-2 font-medium">Setup email sent!</p>}
            <button
              onClick={sendStudentSetup}
              disabled={sendingSetup}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-2 hover:bg-navy-100 transition-colors disabled:opacity-50"
            >
              {sendingSetup ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {student.portal_password_hash ? 'Resend Setup Link' : 'Send Student Portal Setup'}
            </button>
          </div>

          {/* Game Plan Card */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3">Game Plan</p>
            {student.game_plan_url && (
              <a href={student.game_plan_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-navy-700 hover:text-navy-900 font-medium mb-3">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">View game plan PDF</span>
              </a>
            )}
            {(uploading || extracting) ? (
              <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-4 border border-dashed border-gray-200 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-navy-500" />
                <span>{uploading ? 'Uploading…' : 'Extracting data with AI…'}</span>
              </div>
            ) : (
              <label
                className={`flex flex-col items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-4 border-2 border-dashed transition-colors ${
                  dragOver
                    ? 'border-navy-400 bg-navy-50 text-navy-700'
                    : 'border-gray-300 text-gray-500 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleGamePlanUpload(f); }}
              >
                <Upload className="w-5 h-5 flex-shrink-0" />
                <span className="text-center leading-tight">
                  {dragOver ? 'Drop PDF here' : (student.game_plan_url ? 'Replace game plan' : 'Upload game plan PDF')}
                </span>
                <span className="text-xs text-gray-400">or click to browse</span>
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

              {/* Goal stats row */}
              {(currentScore != null || targetScore != null) && (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Current Score</p>
                    <p className="text-xl font-bold text-gray-900">{currentScore ?? '—'}</p>
                  </div>
                  <div className="bg-navy-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-navy-600 mb-0.5">Goal Score</p>
                    <p className="text-xl font-bold text-navy-900">{targetScore ?? '—'}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${
                    pointsToGoal == null ? 'bg-gray-50' :
                    pointsToGoal <= 50  ? 'bg-green-50' :
                    pointsToGoal <= 150 ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    <p className={`text-xs mb-0.5 ${
                      pointsToGoal == null ? 'text-gray-500' :
                      pointsToGoal <= 50  ? 'text-green-600' :
                      pointsToGoal <= 150 ? 'text-amber-600' : 'text-red-600'
                    }`}>Points to Goal</p>
                    <p className={`text-xl font-bold ${
                      pointsToGoal == null ? 'text-gray-400' :
                      pointsToGoal <= 50  ? 'text-green-700' :
                      pointsToGoal <= 150 ? 'text-amber-700' : 'text-red-700'
                    }`}>{pointsToGoal != null ? (pointsToGoal <= 0 ? '✓ Reached!' : `−${pointsToGoal}`) : '—'}</p>
                  </div>
                </div>
              )}

              {/* Progress bar toward goal */}
              {pctToGoal != null && (
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>Progress toward goal</span>
                    <span className="font-semibold text-gray-700">{Math.round(pctToGoal)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${goalBarColor}`}
                      style={{ width: `${pctToGoal}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{startingScore}</span>
                    <span>{targetScore}</span>
                  </div>
                </div>
              )}

              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis domain={[400, 1600]} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  {targetScore != null && (
                    <ReferenceLine
                      y={targetScore}
                      stroke="#6b7280"
                      strokeDasharray="6 3"
                      label={{ value: `Goal ${targetScore}`, position: 'right', fontSize: 11, fill: '#6b7280' }}
                    />
                  )}
                  <Line type="monotone" dataKey="Total" stroke="#1e2090" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Math" stroke="#6b84ff" strokeWidth={1.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Reading" stroke="#10b981" strokeWidth={1.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Upcoming Sessions */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">Upcoming Sessions</h2>
                {upcomingSessions.length > 0 && (
                  <span className="text-xs font-semibold bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full">
                    {upcomingSessions.length}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {completedCount} past session{completedCount !== 1 ? 's' : ''} completed
              </span>
            </div>
            {upcomingSessions.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">No upcoming sessions scheduled</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingSessions.map((s: any) => {
                  const tz = (student as any)?.timezone ?? 'America/Los_Angeles';
                  const dt = new Date(s.scheduled_at);
                  const dayName = dt.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
                  const dateStr = dt.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
                  const timeStr = dt.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
                  const tzAbbr = dt.toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() ?? '';
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                      <div className="w-10 text-center flex-shrink-0">
                        <div className="text-xs font-bold text-navy-600 uppercase">{dayName}</div>
                        <div className="text-sm font-semibold text-gray-900">{dateStr.split(' ')[1]}</div>
                        <div className="text-xs text-gray-400">{dateStr.split(' ')[0]}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{timeStr} <span className="text-xs font-normal text-gray-400">{tzAbbr}</span></div>
                        <div className="text-xs text-gray-500">{s.tutor?.name ?? '—'} · {s.duration_minutes} min</div>
                      </div>
                      {s.zoom_join_url && (
                        <a
                          href={s.zoom_join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Video className="w-3 h-3" /> Join Zoom
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Availability */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Weekly Availability</h2>
            <StudentAvailabilityEditor studentId={id} availability={availability} onRefresh={load} />
          </div>

          {/* Onboarding */}
          {student.parent_email && (() => {
            const { complete, total } = getAdminOnboardingCount(student);
            const steps = [
              { label: 'Onboarding email sent',       done: student.onboarding_email_sent },
              { label: 'Intake form completed',        done: student.intake_form_completed },
              { label: 'Availability submitted',       done: student.availability_submitted },
              ...(student.game_plan_url ? [{ label: 'Game plan acknowledged', done: student.game_plan_acknowledged }] : []),
              { label: 'Session schedule confirmed',   done: student.schedule_confirmed },
            ];
            return (
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-gray-400" />
                    <h2 className="font-semibold text-gray-900">Parent Onboarding</h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-1 ${
                      complete === total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>{complete}/{total}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onboardingError && <span className="text-xs text-red-600">{onboardingError}</span>}
                    {onboardingSent && <span className="text-xs text-green-600 font-medium">Email sent!</span>}
                    <button
                      onClick={sendOnboardingEmail}
                      disabled={sendingOnboarding}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors disabled:opacity-50"
                    >
                      {sendingOnboarding
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Send className="w-3 h-3" />
                      }
                      {student.onboarding_email_sent ? 'Resend Email' : 'Send Onboarding Email'}
                    </button>
                  </div>
                </div>
                {student.onboarding_email_sent_at && (
                  <div className="px-6 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs text-gray-500">
                      Last sent: {format(new Date(student.onboarding_email_sent_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                )}
                <div className="divide-y divide-gray-50">
                  {steps.map((step, i) => (
                    <div key={i} className={`flex items-center gap-3 px-6 py-3 ${step.done ? 'bg-green-50/40' : ''}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? 'bg-green-500' : 'bg-gray-100 border-2 border-gray-200'}`}>
                        {step.done
                          ? <Check className="w-3 h-3 text-white" />
                          : <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                        }
                      </div>
                      <span className={`text-sm ${step.done ? 'text-green-800' : 'text-gray-600'}`}>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Parent Intake Notes */}
          {student.intake_notes && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-900">Parent Intake</h2>
                {student.intake_form_completed && (
                  <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-1">Completed</span>
                )}
              </div>
              <div className="px-6 py-4">
                <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">{student.intake_notes}</pre>
              </div>
            </div>
          )}

          {/* Preferred Availability (parent-submitted) */}
          {student.preferred_availability && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-900">Preferred Availability</h2>
                {student.availability_submitted && (
                  <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-1">Submitted</span>
                )}
              </div>
              <div className="px-6 py-4 space-y-2 text-sm text-gray-700">
                {(() => {
                  const pa = student.preferred_availability as { days: number[]; earliest_start: string; latest_end: string; timezone: string; notes: string | null };
                  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                  const fmtT = (t: string) => { const [h,m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`; };
                  return (
                    <>
                      <div><span className="font-medium text-gray-500">Days:</span> {pa.days.map((d: number) => dayLabels[d]).join(', ')}</div>
                      <div><span className="font-medium text-gray-500">Times:</span> {fmtT(pa.earliest_start)} – {fmtT(pa.latest_end)}</div>
                      <div><span className="font-medium text-gray-500">Timezone:</span> {pa.timezone}</div>
                      {pa.notes && <div><span className="font-medium text-gray-500">Notes:</span> {pa.notes}</div>}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Session History</h2>
              <button
                onClick={openMakeupModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2090] text-white text-xs font-semibold rounded-lg hover:bg-[#171878] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Book Makeup Session
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Tutor</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Payment</th>
                  <th className="table-header">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.length === 0 && (
                  <tr><td colSpan={6} className="table-cell text-gray-400 text-center py-6">No sessions yet</td></tr>
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
                    <td className="table-cell">
                      {s.fathom_recording_url ? (
                        <div className="flex items-center gap-1.5">
                          <a href={s.fathom_recording_url} target="_blank" rel="noopener"
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 text-xs font-medium">
                            <Video className="w-3 h-3" /> Watch
                          </a>
                          <button
                            onClick={() => { setRecSession(s); setRecUrl(s.fathom_recording_url ?? ''); }}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit recording URL"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      ) : s.status === 'completed' ? (
                        <button
                          onClick={() => { setRecSession(s); setRecUrl(''); }}
                          className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 text-xs font-medium border border-dashed border-gray-300 rounded px-1.5 py-0.5 hover:border-gray-400 transition-colors"
                        >
                          + Add Recording
                        </button>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
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

      {/* Delete button */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Student
        </button>
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Student" size="lg">
        <StudentForm student={student} onSuccess={() => { setEditOpen(false); load(); }} onCancel={() => setEditOpen(false)} />
      </Modal>

      {/* AI extraction confirmation modal */}
      <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="AI Data Extracted">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            AI extracted the following from the game plan. Review and confirm to save.
          </p>
          {aiResult?.reasoning && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">{aiResult.reasoning}</div>
          )}
          {aiResult?.hours != null && (
            <div>
              <label className="label">Purchased Hours</label>
              <input type="number" min="0" step="0.5" value={aiHoursEdit} onChange={e => setAiHoursEdit(e.target.value)} className="input" autoFocus />
            </div>
          )}
          {aiResult?.target_score != null && (
            <div className="flex items-center justify-between bg-navy-50 rounded-lg px-3 py-2.5">
              <span className="text-sm text-navy-700">Target Score</span>
              <span className="font-semibold text-navy-900">{aiResult.target_score}</span>
            </div>
          )}
          {aiResult?.test_date && (
            <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2.5">
              <span className="text-sm text-blue-700">Test Date</span>
              <span className="font-semibold text-blue-900">{new Date(aiResult.test_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {Array.isArray(aiResult?.weak_areas) && aiResult!.weak_areas!.length > 0 && (
            <div className="bg-amber-50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-amber-700 mb-1.5">Weak Areas</p>
              <div className="flex flex-wrap gap-1.5">
                {aiResult!.weak_areas!.map((area, i) => (
                  <span key={i} className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-medium">{area}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setAiModalOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="button" onClick={confirmAiHours} disabled={confirmingSaving} className="btn-primary flex-1 justify-center">
              {confirmingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmingSaving ? 'Saving…' : 'Save All'}
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
      {/* Delete confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Student">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure? This will permanently delete{' '}
            <span className="font-semibold text-gray-900">{student.name}</span>{' '}
            and all their related records. This cannot be undone.
          </p>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setDeleteOpen(false)} className="btn-secondary flex-1 justify-center" disabled={deleting}>
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 justify-center inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? 'Deleting…' : 'Delete Student'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Makeup Session Modal ─────────────────────────────────────────────── */}
      {makeupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Book Makeup Session</h2>
              <button onClick={() => setMakeupOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Tutor */}
              <div>
                <label className="label">Tutor</label>
                <select
                  value={makeupForm.tutorId}
                  onChange={e => setMakeupForm(f => ({ ...f, tutorId: e.target.value }))}
                  className="input"
                >
                  {makeupTutors.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  {makeupTutors.length === 0 && <option value="">No tutors available</option>}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    value={makeupForm.date}
                    onChange={e => setMakeupForm(f => ({ ...f, date: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">
                    Time{(student as any).timezone ? ` (${((student as any).timezone as string).split('/')[1]?.replace('_', ' ') ?? (student as any).timezone})` : ''}
                  </label>
                  <select
                    value={makeupForm.time}
                    onChange={e => setMakeupForm(f => ({ ...f, time: e.target.value }))}
                    className="input"
                  >
                    {Array.from({ length: 35 }, (_, i) => {
                      const totalMins = 6 * 60 + i * 30; // 6:00 AM to 11:00 PM
                      const hh   = String(Math.floor(totalMins / 60)).padStart(2, '0');
                      const mm   = String(totalMins % 60).padStart(2, '0');
                      const h12  = Math.floor(totalMins / 60) % 12 || 12;
                      const ampm = totalMins < 12 * 60 ? 'AM' : 'PM';
                      return (
                        <option key={i} value={`${hh}:${mm}`}>{`${h12}:${mm} ${ampm}`}</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="label">Duration</label>
                <div className="flex gap-2">
                  {([30, 60, 90, 120] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setMakeupForm(f => ({ ...f, duration: d }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        makeupForm.duration === d
                          ? 'bg-[#1e2090] text-white border-[#1e2090]'
                          : 'border-gray-200 text-gray-700 hover:border-[#1e2090] hover:text-[#1e2090]'
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Session Type */}
              <div>
                <label className="label">Session Type</label>
                <select
                  value={makeupForm.sessionType}
                  onChange={e => setMakeupForm(f => ({ ...f, sessionType: e.target.value }))}
                  className="input"
                >
                  <option>Makeup Session</option>
                  <option>Extra Session</option>
                  <option>Diagnostic</option>
                  <option>Other</option>
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="label">Note to Tutor <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={makeupForm.note}
                  onChange={e => setMakeupForm(f => ({ ...f, note: e.target.value.slice(0, 200) }))}
                  placeholder="Any context for the tutor…"
                  rows={3}
                  className="input resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{makeupForm.note.length}/200</p>
              </div>

              {makeupError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {makeupError}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setMakeupOpen(false)}
                className="btn-secondary flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                onClick={submitMakeup}
                disabled={makeupSubmitting || !makeupForm.tutorId || !makeupForm.date}
                className="btn-primary flex-1 justify-center"
              >
                {makeupSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {makeupSubmitting ? 'Booking…' : 'Book Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recording Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!recSession}
        onClose={() => { setRecSession(null); setRecUrl(''); }}
        title={recSession?.fathom_recording_url ? 'Edit Recording' : 'Add Recording'}
      >
        {recSession && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex gap-4">
                <span className="text-gray-500">Tutor</span>
                <span className="font-semibold text-gray-900">{recSession.tutor?.name ?? '—'}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-500">Date</span>
                <span className="font-semibold text-gray-900">{formatDateTime(recSession.scheduled_at)}</span>
              </div>
            </div>
            <div>
              <label className="label">Fathom Recording URL</label>
              <input
                type="url"
                value={recUrl}
                onChange={e => setRecUrl(e.target.value)}
                placeholder="https://fathom.video/rec/..."
                className="input w-full"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setRecSession(null); setRecUrl(''); }} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => saveRecordingUrl(recSession.id, recUrl.trim())}
                disabled={recSaving || !recUrl.trim()}
                className="btn-primary flex-1 justify-center"
              >
                {recSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                {recSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
