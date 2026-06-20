'use client';

import { useEffect, useState } from 'react';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { ExternalLink, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface QuizStatus {
  passed: boolean;
  attempts_used: number;
  attempts_remaining: number;
  is_locked: boolean;
  locked_until: string | null;
  last_attempt_score: number | null;
}

interface SubmitResult {
  passed: boolean;
  score: number;
  wrong_question_ids: string[];
  attempts_used: number;
  attempts_remaining: number;
  is_locked: boolean;
  locked_until: string | null;
}

type PageState = 'loading' | 'quiz' | 'result' | 'error';

export default function SopQuizPage() {
  const { tutor, loading: authLoading } = useTutorAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [version, setVersion] = useState<{ id: string; version_number: string; sop_url: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState<QuizStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function loadQuiz() {
    setPageState('loading');
    setResult(null);
    setAnswers({});
    setErrorMsg('');
    try {
      const res = await fetch('/api/tutor-portal/sop-quiz');
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setErrorMsg(d?.error ?? `HTTP ${res.status}`);
        setPageState('error');
        return;
      }
      const data = await res.json();
      setVersion(data.version);
      setQuestions(data.questions ?? []);
      setStatus(data.status);
      setPageState('quiz');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Network error');
      setPageState('error');
    }
  }

  useEffect(() => {
    if (!authLoading && tutor) loadQuiz();
  }, [authLoading, tutor]); // eslint-disable-line react-hooks/exhaustive-deps

  function setAnswer(questionId: string, option: string) {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  }

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id]);

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        answers: questions.map(q => ({
          question_id: q.id,
          selected_option: answers[q.id],
        })),
      };
      const res = await fetch('/api/tutor-portal/sop-quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Already passed or locked — reload status
        await loadQuiz();
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Submission failed');
        setPageState('error');
        return;
      }
      setResult(data);
      setPageState('result');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Network error');
      setPageState('error');
    } finally {
      setSubmitting(false);
    }
  }

  function hoursUntil(iso: string): number {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
  }

  if (authLoading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">SOP Quiz</h1>
        <p className="text-gray-500 text-sm mb-6">
          You must pass this quiz to get paid for sessions.
        </p>

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {pageState === 'loading' && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {pageState === 'error' && (
          <div className="card p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
            <button onClick={loadQuiz} className="btn-primary">Try again</button>
          </div>
        )}

        {/* ── Already Passed ───────────────────────────────────────────── */}
        {pageState === 'quiz' && status?.passed && (
          <div className="card p-6 border-green-200 bg-green-50">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-900">
                  You&apos;ve completed the SOP quiz (v{version?.version_number}).
                </p>
                {status.last_attempt_score != null && (
                  <p className="text-green-700 text-sm mt-1">
                    Score: {status.last_attempt_score}/10
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Locked Out ───────────────────────────────────────────────── */}
        {pageState === 'quiz' && !status?.passed && status?.is_locked && status.locked_until && (
          <div className="card p-6 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">
                  You&apos;ve used all 3 attempts. Try again in {hoursUntil(status.locked_until)} hours.
                </p>
                {status.last_attempt_score != null && (
                  <p className="text-amber-700 text-sm mt-1">
                    Last score: {status.last_attempt_score}/10 (need 8 to pass)
                  </p>
                )}
                <a
                  href={version?.sop_url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-950 mt-3"
                >
                  <ExternalLink className="w-4 h-4" />
                  Re-read the SOP before your next attempt →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Quiz Form ────────────────────────────────────────────────── */}
        {pageState === 'quiz' && !status?.passed && !status?.is_locked && (
          <>
            {/* SOP Link */}
            <div className="card p-4 mb-6 border-navy-200 bg-navy-50">
              <a
                href={version?.sop_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 text-sm font-semibold text-navy-800 hover:text-navy-950"
              >
                <ExternalLink className="w-4 h-4" />
                Read the full SOP before taking the quiz →
              </a>
            </div>

            {/* Attempts indicator */}
            {(status?.attempts_used ?? 0) > 0 && (
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
                <span className="font-medium">
                  Attempt {(status?.attempts_used ?? 0) + 1} of 3
                </span>
                {status?.last_attempt_score != null && (
                  <span className="text-gray-400">
                    · Last score: {status.last_attempt_score}/10
                  </span>
                )}
              </div>
            )}

            {/* Questions */}
            <div className="space-y-6">
              {questions.map(q => (
                <div key={q.id} className="card p-5">
                  <p className="font-medium text-gray-900 mb-3">
                    <span className="text-navy-600 mr-1.5">Q{q.question_number}.</span>
                    {q.question_text}
                  </p>
                  <div className="space-y-2">
                    {(['A', 'B', 'C', 'D'] as const).map(letter => {
                      const optionKey = `option_${letter.toLowerCase()}` as keyof Question;
                      const optionText = q[optionKey] as string;
                      const selected = answers[q.id] === letter;
                      return (
                        <label
                          key={letter}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selected
                              ? 'border-navy-400 bg-navy-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={letter}
                            checked={selected}
                            onChange={() => setAnswer(q.id, letter)}
                            className="mt-0.5 accent-navy-600"
                          />
                          <span className="text-sm text-gray-800">
                            <span className="font-medium text-gray-500 mr-1">{letter}.</span>
                            {optionText}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Submit */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
                className="btn-primary px-8 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                  </span>
                ) : (
                  `Submit Quiz (${Object.keys(answers).length}/10 answered)`
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Result: Passed ───────────────────────────────────────────── */}
        {pageState === 'result' && result?.passed && (
          <div className="card p-8 text-center border-green-200 bg-green-50">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-900 mb-1">You passed!</h2>
            <p className="text-green-700 text-lg mb-2">Score: {result.score}/10</p>
            <p className="text-green-600 text-sm mb-6">You can now attest sessions and get paid.</p>
            <a href="/tutor-portal/dashboard" className="btn-primary">
              Back to dashboard
            </a>
          </div>
        )}

        {/* ── Result: Failed (not locked) ──────────────────────────────── */}
        {pageState === 'result' && result && !result.passed && !result.is_locked && (
          <div className="card p-8 text-center border-red-200 bg-red-50">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-900 mb-1">Not quite.</h2>
            <p className="text-red-700 text-lg mb-2">
              Score: {result.score}/10 — you need 8 to pass.
            </p>
            <p className="text-red-600 text-sm mb-2">
              {result.wrong_question_ids.length} question{result.wrong_question_ids.length !== 1 ? 's' : ''} wrong:
              {' '}
              {result.wrong_question_ids
                .map(wid => questions.find(q => q.id === wid)?.question_number)
                .filter(Boolean)
                .sort((a, b) => a! - b!)
                .map(n => `Q${n}`)
                .join(', ')}
            </p>
            <p className="text-red-600 text-sm font-medium mb-6">
              Attempts remaining: {result.attempts_remaining}
            </p>
            <div className="flex items-center justify-center gap-3">
              <a
                href={version?.sop_url}
                target="_blank"
                rel="noopener"
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                Re-read SOP
              </a>
              <button onClick={loadQuiz} className="btn-primary">
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Result: Failed + Locked ──────────────────────────────────── */}
        {pageState === 'result' && result && !result.passed && result.is_locked && (
          <div className="card p-8 text-center border-red-200 bg-red-50">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-900 mb-1">All attempts used.</h2>
            <p className="text-red-700 text-lg mb-2">
              Score: {result.score}/10 — you need 8 to pass.
            </p>
            <p className="text-red-600 text-sm mb-2">
              You&apos;ve used all 3 attempts.
            </p>
            {result.locked_until && (
              <p className="text-red-600 text-sm font-medium mb-6">
                Try again in {hoursUntil(result.locked_until)} hours.
              </p>
            )}
            <a
              href={version?.sop_url}
              target="_blank"
              rel="noopener"
              className="btn-secondary inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              Re-read the SOP while you wait
            </a>
          </div>
        )}
      </div>
    </TutorPortalLayout>
  );
}
