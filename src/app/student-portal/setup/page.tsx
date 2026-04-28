'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BookOpen, Lock, Loader2, CheckCircle } from 'lucide-react';

function SetupForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token') ?? '';

  const [studentName, setStudentName] = useState('');
  const [validating, setValidating]   = useState(true);
  const [tokenValid, setTokenValid]   = useState(false);
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (!token) { setValidating(false); setTokenValid(false); return; }
    fetch(`/api/student-portal/setup?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setStudentName(data.studentName); setTokenValid(true); })
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setSubmitting(true);
    const res = await fetch('/api/student-portal/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Setup failed. Please try again.');
      setSubmitting(false);
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/student-portal/login'), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-navy-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">StudyCore</h1>
          <p className="text-gray-500 text-sm mt-1">Student Portal Setup</p>
        </div>

        <div className="card p-7">
          {validating && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Validating link…
            </div>
          )}

          {!validating && !tokenValid && (
            <div className="text-center py-6">
              <p className="text-red-600 font-medium mb-2">Invalid or expired link</p>
              <p className="text-sm text-gray-500">Please ask your admin to send a new setup link.</p>
            </div>
          )}

          {!validating && tokenValid && !done && (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Set your password</h2>
              {studentName && <p className="text-gray-500 text-sm mb-5">Welcome, {studentName}! 🎉</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoFocus
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="input pl-9 w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="input pl-9 w-full"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}
                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? 'Setting up…' : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}

          {done && (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">You&apos;re all set!</p>
              <p className="text-sm text-gray-500 mt-1">Redirecting to login…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    }>
      <SetupForm />
    </Suspense>
  );
}
