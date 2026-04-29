'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen, Loader2, Check } from 'lucide-react';

export default function ReferralLandingPage() {
  const { code } = useParams<{ code: string }>();
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [notFound, setNotFound]         = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', grade: '', target_score: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    fetch(`/api/referral/${code}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.referrerName) setReferrerName(data.referrerName);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Please enter your name.'); return; }
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/referral/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setSubmitted(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500">This referral link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-navy-900 px-8 py-6 text-center">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 bg-navy-500 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg">StudyCore</span>
          </div>
          {referrerName ? (
            <p className="text-navy-200 text-sm mt-2">
              <span className="text-white font-semibold">{referrerName}</span> invited you to join
            </p>
          ) : (
            <div className="h-5 bg-navy-700 rounded animate-pulse w-48 mx-auto mt-2" />
          )}
        </div>

        <div className="px-8 py-6">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You're on the list!</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Thanks for your interest in StudyCore. Our team will reach out soon to get you started.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Get started with StudyCore</h2>
              <p className="text-gray-500 text-sm mb-5">
                Expert SAT tutoring that delivers real results. Fill in your details and we'll be in touch.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="input w-full"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="input w-full"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="input w-full"
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Grade</label>
                    <select
                      value={form.grade}
                      onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="">—</option>
                      {[9, 10, 11, 12].map(g => <option key={g} value={g}>{g}th</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Target SAT</label>
                    <input
                      type="number"
                      min={400} max={1600} step={10}
                      value={form.target_score}
                      onChange={e => setForm(f => ({ ...f, target_score: e.target.value }))}
                      className="input w-full"
                      placeholder="1400"
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full justify-center"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? 'Submitting…' : "I'm interested!"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
