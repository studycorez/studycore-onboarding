'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle, Circle, Clock, Send, Radio, FileSignature,
  Users, ChevronDown, ChevronUp, Loader2, AlertTriangle, ExternalLink,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Student {
  id: string;
  name: string;
  email: string;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  current_score: number | null;
  target_score: number | null;
  purchased_hours: number | null;
  total_paid: number | null;
  test_date: string | null;
  timezone: string | null;
  has_guarantee: boolean | null;
  closer_name: string | null;
  availability_raw: Record<string, string[]> | null;
  availability_notes: string | null;
  deal_won_at: string | null;
  student_form_submitted_at: string | null;
  parent_form_submitted_at: string | null;
  contract_sent_at: string | null;
  contract_signing_token: string | null;
  contract_signed_at: string | null;
  broadcast_sent_at: string | null;
  tutor_contract_sent_at: string | null;
  created_at: string;
}

// ── Stage calculation ─────────────────────────────────────────────────────────
type Stage =
  | 'deal_won'
  | 'student_form_done'
  | 'parent_form_done'
  | 'contract_sent'
  | 'contract_signed'
  | 'broadcast_sent'
  | 'tutor_assigned'
  | 'active';

function getStage(s: Student): Stage {
  if (s.tutor_contract_sent_at) return 'active';
  if (s.broadcast_sent_at)      return 'broadcast_sent';
  if (s.contract_signed_at)     return 'contract_signed';
  if (s.contract_sent_at)       return 'contract_sent';
  if (s.parent_form_submitted_at && s.student_form_submitted_at) return 'parent_form_done';
  if (s.student_form_submitted_at) return 'student_form_done';
  return 'deal_won';
}

function stageLabel(stage: Stage): string {
  switch (stage) {
    case 'deal_won':          return 'Waiting on forms';
    case 'student_form_done': return 'Student form done';
    case 'parent_form_done':  return 'Both forms done';
    case 'contract_sent':     return 'Contract sent';
    case 'contract_signed':   return 'Contract signed';
    case 'broadcast_sent':    return 'Broadcast sent';
    case 'active':            return 'Tutor assigned';
    default:                  return stage;
  }
}

function stageBadgeClass(stage: Stage): string {
  switch (stage) {
    case 'deal_won':          return 'bg-gray-100 text-gray-600';
    case 'student_form_done': return 'bg-yellow-100 text-yellow-700';
    case 'parent_form_done':  return 'bg-yellow-100 text-yellow-700';
    case 'contract_sent':     return 'bg-blue-100 text-blue-700';
    case 'contract_signed':   return 'bg-indigo-100 text-indigo-700';
    case 'broadcast_sent':    return 'bg-purple-100 text-purple-700';
    case 'active':            return 'bg-green-100 text-green-700';
    default:                  return 'bg-gray-100 text-gray-600';
  }
}

// ── Pipeline step row ─────────────────────────────────────────────────────────
function Step({ done, label, ts }: { done: boolean; label: string; ts?: string | null }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {done
        ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
      }
      <span className={done ? 'text-gray-800' : 'text-gray-400'}>
        {label}
        {ts && (
          <span className="ml-1 text-xs text-gray-400">
            {new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Availability display ──────────────────────────────────────────────────────
function AvailabilityBadges({ avail }: { avail: Record<string, string[]> | null }) {
  if (!avail) return <span className="text-gray-400 text-sm">No availability on file</span>;

  const filled = Object.entries(avail).filter(([, times]) => times.length > 0);
  if (filled.length === 0) return <span className="text-gray-400 text-sm">No availability on file</span>;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {filled.map(([day, times]) => (
        <span key={day} className="text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded px-2 py-0.5">
          {day.charAt(0).toUpperCase() + day.slice(1)}: {times.join(' / ')}
        </span>
      ))}
    </div>
  );
}

// ── Student card ──────────────────────────────────────────────────────────────
function StudentCard({ student, onRefresh }: { student: Student; onRefresh: () => void }) {
  const [expanded, setExpanded]     = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [sendingContract, setSendingContract] = useState(false);
  const [contractMsg, setContractMsg] = useState('');

  const stage = getStage(student);
  const RECOVERY_URL = process.env.NEXT_PUBLIC_RECOVERY_GAMEPLAN_URL || 'https://studycore-recovery-gameplan1.vercel.app';

  async function handleBroadcast() {
    if (!confirm(`Broadcast ${student.name} to all active tutors via SMS?`)) return;
    setBroadcasting(true);
    setBroadcastMsg('');
    try {
      const res = await fetch('/api/admin/broadcast-tutors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json() as { ok?: boolean; sent?: number; failed?: number; error?: string };
      if (data.ok) {
        setBroadcastMsg(`Sent to ${data.sent} tutors${data.failed ? `, ${data.failed} failed` : ''}`);
        onRefresh();
      } else {
        setBroadcastMsg(`Error: ${data.error}`);
      }
    } catch (err) {
      setBroadcastMsg('Network error');
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleSendContract() {
    if (!student.parent_email) {
      setContractMsg('No parent email on file — add it first');
      return;
    }
    if (!confirm(`Send enrollment contract to ${student.parent_name || student.name} at ${student.parent_email}?`)) return;
    setSendingContract(true);
    setContractMsg('');
    try {
      const res = await fetch('/api/admin/send-student-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json() as { ok?: boolean; token?: string; error?: string };
      if (data.ok) {
        setContractMsg('Contract sent');
        onRefresh();
      } else {
        setContractMsg(`Error: ${data.error}`);
      }
    } catch {
      setContractMsg('Network error');
    } finally {
      setSendingContract(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{student.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stageBadgeClass(stage)}`}>
              {stageLabel(stage)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {student.current_score ? `${student.current_score} → ${student.target_score}` : student.target_score ? `Target: ${student.target_score}` : ''}
            {student.test_date ? ` · Test: ${new Date(student.test_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
            {student.purchased_hours ? ` · ${student.purchased_hours} hrs` : ''}
            {student.closer_name ? ` · Closed by ${student.closer_name}` : ''}
          </p>
        </div>
        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* Send contract */}
          {!student.contract_sent_at && (
            <button
              onClick={handleSendContract}
              disabled={sendingContract}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              title="Send enrollment contract"
            >
              {sendingContract ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Contract
            </button>
          )}
          {/* View contract */}
          {student.contract_signing_token && (
            <a
              href={`${RECOVERY_URL}/contracts/sign/${student.contract_signing_token}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              title="View signing link"
            >
              <ExternalLink className="w-3 h-3" />
              View
            </a>
          )}
          {/* Broadcast */}
          {stage === 'contract_signed' && !student.broadcast_sent_at && (
            <button
              onClick={handleBroadcast}
              disabled={broadcasting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              title="Broadcast to tutors"
            >
              {broadcasting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
              Broadcast
            </button>
          )}
          {/* Re-broadcast if already sent */}
          {student.broadcast_sent_at && !student.tutor_contract_sent_at && (
            <button
              onClick={handleBroadcast}
              disabled={broadcasting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium disabled:opacity-50 transition-colors"
              title="Re-broadcast to tutors"
            >
              {broadcasting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
              Re-broadcast
            </button>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </div>

      {/* Feedback messages */}
      {(broadcastMsg || contractMsg) && (
        <div className="px-5 pb-2">
          {broadcastMsg && <p className="text-xs text-purple-700 bg-purple-50 rounded px-2 py-1">{broadcastMsg}</p>}
          {contractMsg  && <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">{contractMsg}</p>}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pipeline */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pipeline</p>
            <div className="space-y-2">
              <Step done={!!student.deal_won_at || !!student.created_at}  label="Deal won"                    ts={student.deal_won_at} />
              <Step done={!!student.student_form_submitted_at}             label="Student form submitted"      ts={student.student_form_submitted_at} />
              <Step done={!!student.parent_form_submitted_at}              label="Parent form submitted"       ts={student.parent_form_submitted_at} />
              <Step done={!!student.contract_sent_at}                      label="Enrollment contract sent"    ts={student.contract_sent_at} />
              <Step done={!!student.contract_signed_at}                    label="Contract signed"             ts={student.contract_signed_at} />
              <Step done={!!student.broadcast_sent_at}                     label="Tutor broadcast sent"        ts={student.broadcast_sent_at} />
              <Step done={!!student.tutor_contract_sent_at}                label="Tutor-student contract sent" ts={student.tutor_contract_sent_at} />
            </div>
          </div>

          {/* Student info */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</p>
            <div className="space-y-1.5 text-sm text-gray-700">
              {student.email && <p><span className="text-gray-400">Student:</span> {student.email}</p>}
              {student.parent_email && <p><span className="text-gray-400">Parent:</span> {student.parent_name} · {student.parent_email}{student.parent_phone ? ` · ${student.parent_phone}` : ''}</p>}
              {student.timezone && <p><span className="text-gray-400">Timezone:</span> {student.timezone}</p>}
              {student.total_paid != null && <p><span className="text-gray-400">Paid:</span> ${student.total_paid.toLocaleString()}</p>}
              {student.has_guarantee && <p className="text-green-700"><span className="text-gray-400">Guarantee:</span> Yes</p>}
            </div>

            {/* Availability */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Availability</p>
            <AvailabilityBadges avail={student.availability_raw} />
            {student.availability_notes && (
              <p className="text-xs text-gray-500 mt-1.5 italic">{student.availability_notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const STAGES_ORDER: Stage[] = [
  'deal_won', 'student_form_done', 'parent_form_done',
  'contract_sent', 'contract_signed', 'broadcast_sent', 'active',
];

export default function FulfillmentPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Stage | 'all'>('all');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('students')
      .select(`
        id, name, email, parent_name, parent_email, parent_phone,
        current_score, target_score, purchased_hours, total_paid,
        test_date, timezone, has_guarantee, closer_name,
        availability_raw, availability_notes,
        deal_won_at, student_form_submitted_at, parent_form_submitted_at,
        contract_sent_at, contract_signing_token, contract_signed_at,
        broadcast_sent_at, tutor_contract_sent_at, created_at
      `)
      .in('status', ['active', 'new'])
      .order('created_at', { ascending: false });

    setStudents((data ?? []) as Student[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all'
    ? students
    : students.filter(s => getStage(s) === filter);

  const stageCounts = STAGES_ORDER.reduce((acc, stage) => {
    acc[stage] = students.filter(s => getStage(s) === stage).length;
    return acc;
  }, {} as Record<Stage, number>);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fulfillment Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tracks every new enrollment from deal close → contract signed → tutor assigned.
        </p>
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            filter === 'all' ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({students.length})
        </button>
        {STAGES_ORDER.map(stage => (
          <button
            key={stage}
            onClick={() => setFilter(stage)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              filter === stage
                ? 'bg-navy-900 text-white'
                : `${stageBadgeClass(stage)} hover:opacity-80`
            }`}
          >
            {stageLabel(stage)} ({stageCounts[stage]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading students…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>No students in this stage</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <StudentCard key={s.id} student={s} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Webhook config reminder */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <div className="flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Tally webhooks must be configured</p>
            <p className="text-xs mt-1 text-amber-700">
              In Tally → each form → Integrations → Webhooks, add:
              <code className="ml-1 bg-amber-100 px-1 rounded">https://app.studycore.net/api/webhooks/tally</code>
            </p>
            <p className="text-xs mt-0.5 text-amber-700">
              Forms: Deal Handoff (OD8LXp), Student Onboarding (b5PvVo), Parent Onboarding (LZlkZ1)
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
