'use client';

import { useState } from 'react';
import { BookOpen, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/tutor-auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch { /* always show success */ }
    setSent(true);
    setLoading(false);
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
          {sent ? (
            <div className="text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
              <p className="text-gray-500 text-sm mb-6">
                If a tutor account exists with <strong>{email}</strong>, we&apos;ve sent a reset link. Check your inbox and spam folder. If you don&apos;t receive it within a few minutes, double-check the email address or contact{' '}
                <a href="mailto:info@studycore.net" className="text-navy-600 hover:underline">info@studycore.net</a>.
              </p>
              <Link href="/tutor-portal/login" className="text-sm font-medium text-navy-600 hover:text-navy-800">
                ← Back to login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Reset your password</h1>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link href="/tutor-portal/login" className="text-sm text-gray-500 hover:text-gray-700">
                  ← Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
