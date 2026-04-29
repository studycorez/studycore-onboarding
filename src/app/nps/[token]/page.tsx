'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function NPSSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [score,     setScore]     = useState<number | null>(null);
  const [feedback,  setFeedback]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState('');
  const [alreadyDone, setAlreadyDone] = useState(false);

  // Verify the survey token is valid
  useEffect(() => {
    fetch(`/api/nps/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score: null, _check: true }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error === 'Already responded') setAlreadyDone(true);
      })
      .catch(() => {});
  }, [token]);

  async function submit() {
    if (score === null) { setError('Please select a score.'); return; }
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/nps/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score, feedback }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
    setDone(true);
  }

  if (alreadyDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Already submitted</h1>
          <p className="text-gray-500">You've already responded to this survey. Thank you!</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-500">Your feedback helps us improve. We really appreciate it.</p>
        </div>
      </div>
    );
  }

  const scoreLabels: Record<number, string> = {
    0: 'Not at all', 1: '', 2: '', 3: '', 4: '', 5: 'Somewhat', 6: '', 7: '', 8: '', 9: '', 10: 'Extremely',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-navy-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📊</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">How likely are you to recommend StudyCore?</h1>
          <p className="text-gray-500 text-sm mt-1">0 = Not at all likely, 10 = Extremely likely</p>
        </div>

        <div className="flex gap-1.5 justify-center flex-wrap mb-2">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setScore(i)}
              className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                score === i
                  ? 'bg-navy-700 text-white'
                  : i <= 6
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : i <= 8
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mb-6 px-1">
          <span>Not likely</span>
          <span>Extremely likely</span>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What's the main reason for your score? <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-navy-400 resize-none"
            rows={3}
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Share your thoughts…"
          />
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting || score === null}
          className="w-full py-3 bg-navy-700 hover:bg-navy-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
