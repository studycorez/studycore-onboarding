'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle, Loader2 } from 'lucide-react';

function SetupContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [tutorName,  setTutorName]  = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    if (!token) { setError('Missing token.'); setLoading(false); return; }
    fetch(`/api/tutor-auth/setup?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setTutorName(data.tutorName);
        setLoading(false);
      })
      .catch(() => { setError('Failed to validate token.'); setLoading(false); });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/tutor-auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Setup failed'); setSubmitting(false); return; }
    setDone(true);
    setTimeout(() => router.push('/tutor-portal/login'), 2000);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : error && !tutorName ? (
        <div className="text-center py-4">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-gray-500 text-sm mt-2">Contact your admin for a new setup link.</p>
        </div>
      ) : done ? (
        <div className="text-center py-6">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="font-bold text-gray-900 text-lg">Password set!</h2>
          <p className="text-gray-500 text-sm mt-1">Redirecting to login…</p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Welcome, {tutorName}!</h1>
          <p className="text-gray-500 text-sm mb-6">Set a password to access your portal.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="Min 8 characters" required
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                className="input" placeholder="Repeat password" required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Setting up…' : 'Set Password & Continue'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function TutorSetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">StudyCore</span>
          </div>
          <p className="text-gray-500 text-sm">Tutor Portal Setup</p>
        </div>
        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        }>
          <SetupContent />
        </Suspense>
      </div>
    </div>
  );
}
