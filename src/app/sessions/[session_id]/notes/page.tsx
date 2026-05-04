'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BookOpen, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const NAVY = '#1e2090';

interface SessionData {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  notes_token: string;
  tutor_notes: string | null;
  homework_assigned: string | null;
  session_rating: number | null;
  notes_submitted_at: string | null;
  student: { name: string } | null;
  tutor: { name: string } | null;
}

export default function SessionNotesPage() {
  const { session_id } = useParams<{ session_id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const supabase = createClient();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [notes, setNotes] = useState('');
  const [homework, setHomework] = useState('');
  const [homeworkDueDate, setHomeworkDueDate] = useState('');
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);

  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, notes_token, tutor_notes, homework_assigned, session_rating, notes_submitted_at, student:students(name), tutor:tutors(name)')
      .eq('id', session_id)
      .single()
      .then(({ data }) => {
        if (!data || data.notes_token !== token) {
          setInvalid(true);
        } else {
          setSession(data as any);
          if (data.notes_submitted_at) {
            setNotes(data.tutor_notes ?? '');
            setHomework(data.homework_assigned ?? '');
            setHomeworkDueDate((data as any).homework_due_date ?? '');
            setRating(data.session_rating ?? 0);
            setSubmitted(true);
          }
        }
        setLoading(false);
      });
  }, [session_id, token]);

  async function handleSubmit() {
    if (!notes.trim() || rating === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/sessions/${session_id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, tutor_notes: notes.trim(), homework_assigned: homework.trim() || null, homework_due_date: homeworkDueDate || null, session_rating: rating }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to submit'); setSaving(false); return; }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Shell>
    );
  }

  if (invalid || !session) {
    return (
      <Shell>
        <div className="text-center py-16">
          <p className="text-gray-500">This link is invalid or has expired.</p>
        </div>
      </Shell>
    );
  }

  const tutorName   = (session.tutor as any)?.name ?? 'Tutor';
  const studentName = (session.student as any)?.name ?? 'Student';
  const sessionDate = format(new Date(session.scheduled_at), "EEEE, MMMM d, yyyy 'at' h:mm a");

  if (submitted) {
    return (
      <Shell>
        <div className="text-center py-16">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Notes Submitted!</h2>
          <p className="text-gray-500">
            Thank you, <strong>{tutorName}</strong>. Your notes for {studentName}&apos;s session have been recorded.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Session info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-gray-500 text-xs">Student</span><p className="font-semibold text-gray-900">{studentName}</p></div>
          <div><span className="text-gray-500 text-xs">Tutor</span><p className="font-semibold text-gray-900">{tutorName}</p></div>
          <div className="col-span-2"><span className="text-gray-500 text-xs">Session</span><p className="font-semibold text-gray-900">{sessionDate} · {session.duration_minutes} min</p></div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Session notes */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1.5">
            Session notes <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">What topics did you cover? What went well?</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            placeholder="e.g. Covered quadratic equations and graphing parabolas. Student was strong on factoring but needs more practice with the quadratic formula…"
          />
        </div>

        {/* Homework */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1.5">
            Homework assigned <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={homework}
            onChange={e => setHomework(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            placeholder="e.g. Khan Academy: Quadratic equations — 20 problems. Review notes from today."
          />
        </div>

        {/* Due date */}
        {homework.trim() && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1.5">
              Due date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={homeworkDueDate}
              onChange={e => setHomeworkDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Rating */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1.5">
            Student performance <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">How did the student perform this session?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                aria-label={`${star} star`}
              >
                <span className={(hovered || rating) >= star ? 'text-amber-400' : 'text-gray-200'}>★</span>
              </button>
            ))}
            {rating > 0 && (
              <span className="self-center text-sm text-gray-500 ml-1">
                {['', 'Needs significant work', 'Below expectations', 'Met expectations', 'Above expectations', 'Excellent'][rating]}
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!notes.trim() || rating === 0 || saving}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: NAVY }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit Notes'}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900">StudyCore</span>
            <span className="text-gray-400 text-sm ml-2">Session Notes</span>
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}
