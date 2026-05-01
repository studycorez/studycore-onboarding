'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTutorAuth } from '@/hooks/useTutorAuth';
import TutorPortalLayout from '@/components/tutor-portal/TutorPortalLayout';
import { Loader2, Check, Calendar, Unlink, Upload, ExternalLink, FileText } from 'lucide-react';

function GoogleBanners() {
  const searchParams = useSearchParams();
  const gcJustConnected = searchParams.get('connected') === 'true';
  const gcError = searchParams.get('error') === 'google';
  return (
    <>
      {gcJustConnected && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4" /> Google Calendar connected successfully.
        </div>
      )}
      {gcError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to connect Google Calendar. Please try again.
        </div>
      )}
    </>
  );
}

export default function TutorProfilePage() {
  const { tutor, loading } = useTutorAuth();

  const [form,    setForm]    = useState({ name: '', phone: '', bio: '', subjects: '' });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [pwForm,  setPwForm]  = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving,setPwSaving]= useState(false);
  const [gcConnected, setGcConnected] = useState(false);
  const [gcDisconnecting, setGcDisconnecting] = useState(false);
  const [resumeUrl,       setResumeUrl]       = useState<string | null>(null);
  const [resumeFilename,  setResumeFilename]  = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError,     setResumeError]     = useState('');

  useEffect(() => {
    if (!tutor) return;
    setForm({
      name:     tutor.name,
      phone:    tutor.phone ?? '',
      bio:      tutor.bio ?? '',
      subjects: tutor.subjects?.join(', ') ?? '',
    });
    setGcConnected(tutor.google_calendar_connected ?? false);
    setResumeUrl(tutor.resume_url ?? null);
    setResumeFilename(tutor.resume_filename ?? null);
  }, [tutor]);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    setResumeError('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/tutor-portal/resume', { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setResumeError(body.error ?? 'Upload failed');
    } else {
      const data = await res.json();
      setResumeUrl(data.resume_url);
      setResumeFilename(data.resume_filename);
    }
    setResumeUploading(false);
    e.target.value = '';
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch('/api/tutor-auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     form.name,
        phone:    form.phone || null,
        bio:      form.bio   || null,
        subjects: form.subjects.split(',').map(s => s.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    setPwError('');
    const res = await fetch('/api/tutor-auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    });
    const data = await res.json();
    setPwSaving(false);
    if (!res.ok) { setPwError(data.error ?? 'Failed to change password'); return; }
    setPwSaved(true);
    setPwForm({ current: '', next: '', confirm: '' });
    setTimeout(() => setPwSaved(false), 3000);
  }

  async function disconnectGoogle() {
    setGcDisconnecting(true);
    await fetch('/api/tutor-auth/google-disconnect', { method: 'POST' });
    setGcConnected(false);
    setGcDisconnecting(false);
  }

  if (loading) return null;

  return (
    <TutorPortalLayout tutor={tutor}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      </div>

      <Suspense>
        <GoogleBanners />
      </Suspense>

      <div className="grid grid-cols-2 gap-6">
        {/* Profile form */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Personal Info</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Subjects (comma-separated)</label>
              <input className="input" value={form.subjects} onChange={e => setForm(f => ({ ...f, subjects: e.target.value }))} placeholder="Math, Reading, Writing" />
            </div>
            <div>
              <label className="label">Bio</label>
              <textarea className="input" rows={3} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Change Password</h2>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input type="password" className="input" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required />
            </div>
            <div>
              <label className="label">New Password</label>
              <input type="password" className="input" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} placeholder="Min 8 characters" required />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
            </div>
            {pwError && <p className="text-sm text-red-600">{pwError}</p>}
            <button type="submit" disabled={pwSaving} className="btn-primary flex items-center gap-2">
              {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : pwSaved ? <Check className="w-4 h-4" /> : null}
              {pwSaving ? 'Changing…' : pwSaved ? 'Changed!' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Resume */}
      <div className="card p-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-navy-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Resume</h2>
            <p className="text-sm text-gray-500">Your resume is visible to parents in the portal.</p>
          </div>
        </div>
        {resumeUrl ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-700 truncate">{resumeFilename ?? 'resume.pdf'}</p>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={resumeUrl}
                target="_blank"
                rel="noopener"
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View
              </a>
              <label className={`btn-secondary text-sm flex items-center gap-1.5 cursor-pointer ${resumeUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {resumeUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Replace
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleResumeUpload} disabled={resumeUploading} />
              </label>
            </div>
          </div>
        ) : (
          <label className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-navy-300 hover:bg-navy-50 transition-colors ${resumeUploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {resumeUploading
              ? <Loader2 className="w-6 h-6 animate-spin text-navy-500" />
              : <Upload className="w-6 h-6 text-gray-400" />}
            <p className="text-sm text-gray-500 font-medium">{resumeUploading ? 'Uploading…' : 'Upload Resume (PDF)'}</p>
            <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleResumeUpload} disabled={resumeUploading} />
          </label>
        )}
        {resumeError && <p className="text-sm text-red-600 mt-2">{resumeError}</p>}
      </div>

      {/* Google Calendar */}
      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-navy-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Google Calendar</h2>
              <p className="text-sm text-gray-500">
                {gcConnected
                  ? 'Your sessions are synced to your Google Calendar.'
                  : 'Connect to automatically add sessions to your Google Calendar.'}
              </p>
            </div>
          </div>
          {gcConnected ? (
            <button
              onClick={disconnectGoogle}
              disabled={gcDisconnecting}
              className="btn-secondary flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
            >
              <Unlink className="w-4 h-4" />
              {gcDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <a href="/api/tutor-auth/google-connect" className="btn-primary text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Connect Google Calendar
            </a>
          )}
        </div>
      </div>
    </TutorPortalLayout>
  );
}
