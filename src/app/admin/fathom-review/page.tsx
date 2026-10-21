'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Recording {
  id: string;
  title: string | null;
  host_email: string | null;
  participant_emails: string[] | null;
  started_at: string | null;
  fathom_share_url: string | null;
  category: string;
}

interface Tutor {
  id: string;
  name: string;
  email: string;
}

interface Student {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFirstName(title: string | null): string {
  if (!title) return '';
  return title.match(/^([A-Z][a-z]+)'s/)?.[1] ?? '';
}

function fmtTime(started_at: string | null): string {
  if (!started_at) return '—';
  return format(new Date(started_at), "MMMM d, yyyy 'at' h:mm a");
}

function CategoryBadge({ category }: { category: string }) {
  if (category === 'tutor_recognized_no_session') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
        Tutor matched (no session)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      No known participants
    </span>
  );
}

// ── RecordingCard ─────────────────────────────────────────────────────────────

function RecordingCard({
  rec,
  tutors,
  students,
  onResolved,
}: {
  rec: Recording;
  tutors: Tutor[];
  students: Student[];
  onResolved: (id: string) => void;
}) {
  const defaultTutor = tutors.find(
    t => rec.host_email && t.email.toLowerCase() === rec.host_email.toLowerCase(),
  );

  const [skipped, setSkipped]                 = useState(false);
  const [tutorId, setTutorId]                 = useState(defaultTutor?.id ?? '');
  const [studentInput, setStudentInput]       = useState(extractFirstName(rec.title));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [notes, setNotes]                     = useState('');
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);
  const [backfillError, setBackfillError]     = useState('');

  // Dismiss inline state
  const [dismissOpen, setDismissOpen]         = useState(false);
  const [dismissReason, setDismissReason]     = useState('');
  const [dismissSubmitting, setDismissSubmitting] = useState(false);
  const [dismissError, setDismissError]       = useState('');

  if (skipped) return null;

  const matchedStudent = students.find(
    s => s.name.toLowerCase() === studentInput.toLowerCase().trim(),
  );
  const canBackfill = !!tutorId && !!matchedStudent && durationMinutes > 0 && !!rec.started_at;

  async function handleBackfill() {
    if (!canBackfill) return;
    setBackfillSubmitting(true);
    setBackfillError('');
    try {
      const res = await fetch('/api/admin/fathom-review/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_id: rec.id,
          tutor_id: tutorId,
          student_id: matchedStudent!.id,
          duration_minutes: durationMinutes,
          notes: notes || undefined,
          started_at: rec.started_at,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBackfillError(data.error ?? 'Backfill failed'); return; }
      onResolved(rec.id);
    } catch {
      setBackfillError('Network error. Please try again.');
    } finally {
      setBackfillSubmitting(false);
    }
  }

  async function handleDismiss() {
    if (dismissReason.trim().length === 0) return;
    setDismissSubmitting(true);
    setDismissError('');
    try {
      const res = await fetch('/api/admin/fathom-review/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: rec.id, reason: dismissReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setDismissError(data.error ?? 'Dismiss failed'); return; }
      onResolved(rec.id);
    } catch {
      setDismissError('Network error. Please try again.');
    } finally {
      setDismissSubmitting(false);
    }
  }

  return (
    <div className="card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CategoryBadge category={rec.category} />
          <h3 className="text-base font-semibold text-gray-900">
            {rec.title ?? '(Untitled recording)'}
          </h3>
          <p className="text-sm text-gray-500">{fmtTime(rec.started_at)}</p>
        </div>
        {rec.fathom_share_url && (
          <a
            href={rec.fathom_share_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View recording in Fathom
          </a>
        )}
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-500 space-y-1 pb-3 border-b border-gray-100">
        <p>
          <span className="font-medium text-gray-600">Host:</span>{' '}
          {rec.host_email ?? '—'}
        </p>
        <p>
          <span className="font-medium text-gray-600">Participants:</span>{' '}
          {(rec.participant_emails ?? []).join(', ') || '—'}
        </p>
      </div>

      {/* Backfill form */}
      <div className="space-y-4">
        {/* Tutor */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tutor</label>
          <select
            value={tutorId}
            onChange={e => setTutorId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          >
            <option value="">— Select tutor —</option>
            {tutors.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.email})
              </option>
            ))}
          </select>
        </div>

        {/* Student */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Student</label>
          <input
            type="text"
            list={`students-${rec.id}`}
            value={studentInput}
            onChange={e => setStudentInput(e.target.value)}
            placeholder="Type student name…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
          <datalist id={`students-${rec.id}`}>
            {students.map(s => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          {studentInput && !matchedStudent && (
            <p className="text-xs text-amber-600 mt-1">
              No exact match — select a name from the list.
            </p>
          )}
          {matchedStudent && (
            <p className="text-xs text-green-600 mt-1">✓ Matched: {matchedStudent.name}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Tip: type the student's first name to search, or paste their full name.
          </p>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Duration (minutes)
          </label>
          <input
            type="number"
            min={1}
            max={480}
            value={durationMinutes}
            onChange={e => setDurationMinutes(Number(e.target.value))}
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Tip: open the Fathom recording to check the actual duration.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Reason for backfill (e.g. 'tutor forgot to book')"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
          />
        </div>
      </div>

      {backfillError && <p className="text-sm text-red-600">{backfillError}</p>}

      {/* Dismiss inline expansion */}
      {dismissOpen && (
        <div className="pt-2 border-t border-gray-100 space-y-2">
          <label className="block text-xs font-semibold text-gray-700">
            Dismiss reason
          </label>
          <textarea
            value={dismissReason}
            onChange={e => setDismissReason(e.target.value)}
            rows={2}
            placeholder="e.g. 'sales call', 'internal meeting', 'demo'"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Required — explains why this isn't a tutoring session.
          </p>
          {dismissError && <p className="text-sm text-red-600">{dismissError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              disabled={dismissSubmitting || dismissReason.trim().length === 0}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {dismissSubmitting ? 'Dismissing…' : 'Confirm Dismiss'}
            </button>
            <button
              onClick={() => { setDismissOpen(false); setDismissReason(''); setDismissError(''); }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
        <button
          onClick={handleBackfill}
          disabled={!canBackfill || backfillSubmitting}
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {backfillSubmitting ? 'Backfilling…' : 'Backfill Session'}
        </button>
        {!dismissOpen && (
          <button
            onClick={() => setDismissOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        )}
        <button
          onClick={() => setSkipped(true)}
          className="btn-secondary text-sm"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FathomReviewPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [tutors, setTutors]         = useState<Tutor[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch('/api/admin/fathom-review');
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed to load recordings'); return; }
        setRecordings(data.recordings);
        setTutors(data.tutors);
        setStudents(data.students);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleResolved(id: string) {
    setRecordings(prev => prev.filter(r => r.id !== id));
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fathom Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          {loading
            ? 'Loading…'
            : `${recordings.length} unresolved recording${recordings.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-gray-400">Loading recordings…</div>
      ) : recordings.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-400">
          ✓ All unresolved recordings have been cleared.
        </div>
      ) : (
        <div className="space-y-4">
          {recordings.map(rec => (
            <RecordingCard
              key={rec.id}
              rec={rec}
              tutors={tutors}
              students={students}
              onResolved={handleResolved}
            />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
