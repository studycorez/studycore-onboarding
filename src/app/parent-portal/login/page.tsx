'use client';

import { useState } from 'react';
import { BookOpen, Loader2, Mail, CheckCircle } from 'lucide-react';

export default function ParentLoginPage() {
  const [email,     setEmail]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [error,     setError]     = useState('');

  // Show error if redirected with error param
  const errorParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('error')
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/parent-portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Something went wrong. Please try again.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">StudyCore</span>
          </div>
          <p className="text-gray-500 text-sm">Parent Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                We sent a login link to <span className="font-medium text-gray-700">{email}</span>.
                Click the link in that email to access your portal.
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Link expires in 7 days. Didn't get it?{' '}
                <button
                  onClick={() => { setSent(false); setError(''); }}
                  className="text-navy-600 hover:text-navy-800 font-medium"
                >
                  Try again
                </button>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Sign in to view your child's progress</h1>
              <p className="text-sm text-gray-500 mb-6">
                Enter the email address on file for your child's account. We'll send you a secure, password-free login link.
              </p>

              {(error || errorParam) && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error || (errorParam === 'invalid_token' ? 'Your login link has expired or is invalid. Please request a new one.' : 'Login failed. Please try again.')}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Parent email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input pl-9"
                      placeholder="you@example.com"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn-primary w-full justify-center"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Sending…' : 'Send me a login link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Only parents registered in the system can access this portal.
          Contact your admin if you need help.
        </p>
      </div>
    </div>
  );
}
