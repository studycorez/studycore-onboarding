'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BookOpen, Loader2, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password === confirm;
  const isValid = password.length >= 8 && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tutor-auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Reset failed');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/tutor-portal/login'), 2000);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

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
          <p className="text-gray-500 text-sm">Tutor Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {success ? (
            <div className="text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Password reset!</h1>
              <p className="text-gray-500 text-sm">Redirecting to login…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Set new password</h1>
              <p className="text-gray-500 text-sm mb-6">Enter your new password below.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoFocus
                  />
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-red-500 mt-1">Must be at least 8 characters</p>
                  )}
                </div>

                <div>
                  <label className="label">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                  />
                  {confirm.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p>{error}</p>
                      {error.includes('expired') && (
                        <Link href="/tutor-portal/forgot-password" className="text-red-700 font-medium hover:underline mt-1 inline-block">
                          Request a new reset link →
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!isValid || loading}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
