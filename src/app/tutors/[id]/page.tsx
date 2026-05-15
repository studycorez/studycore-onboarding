'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import TutorForm from '@/components/tutors/TutorForm';
import SendContractForm from '@/components/contracts/SendContractForm';
import AvailabilityEditor from '@/components/tutors/AvailabilityEditor';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Tutor, TutorAvailability, Session } from '@/types';
import { User, Mail, Phone, DollarSign, Edit, ArrowLeft, FileText, Archive, Link as LinkIcon, CheckCircle, Eye, Upload, ExternalLink, Loader2, Clipboard } from 'lucide-react';
import { TutorScoreBadge } from '@/components/TutorScoreBadge';
import { calculateTutorScore, TutorScoreResult } from '@/lib/tutorScore';
import Image from 'next/image';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

export default function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tutor, setTutor]           = useState<Tutor | null>(null);
  const [availability, setAvail]    = useState<TutorAvailability[]>([]);
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [editOpen, setEditOpen]         = useState(false);
  const [contractOpen, setContractOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [sendingSetup, setSendingSetup]   = useState(false);
  const [setupSent,    setSetupSent]      = useState(false);
  const [setupError,   setSetupError]     = useState('');
  const [copyingLink,  setCopyingLink]    = useState(false);
  const [copiedLink,   setCopiedLink]     = useState(false);
  const [loading, setLoading]       = useState(true);
  const [preselectedStudent, setPreselectedStudent] = useState<string | undefined>(undefined);
  const [editingRate, setEditingRate] = useState(false);
  const [rateValue,   setRateValue]   = useState('');
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError,     setResumeError]     = useState('');
  const [portalError,     setPortalError]     = useState('');
  const [score,           setScore]           = useState<TutorScoreResult | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    const [t, a, s] = await Promise.all([
      // Show archived tutors here — fetches by specific ID for admin detail view; archived tutors remain viewable and editable by admins
      supabase.from('tutors').select('*').eq('id', id).single(),
      supabase.from('tutor_availability').select('*').eq('tutor_id', id).order('day_of_week').order('start_time'),
      supabase.from('sessions').select('*, student:students(name)').eq('tutor_id', id).order('scheduled_at', { ascending: false }).limit(20),
    ]);
    setTutor(t.data);
    setAvail(a.data ?? []);
    setSessions(s.data as any ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    calculateTutorScore(id, supabase).then(setScore);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    setResumeError('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/tutors/${id}/resume`, { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setResumeError(body.error ?? 'Upload failed');
    } else {
      const data = await res.json();
      setTutor(prev => prev ? { ...prev, resume_url: data.resume_url, resume_filename: data.resume_filename } : prev);
    }
    setResumeUploading(false);
    e.target.value = '';
  }

  // Auto-open contract modal if redirected from tutor switch
  useEffect(() => {
    const contractStudent = searchParams.get('contractStudent');
    if (contractStudent) {
      setPreselectedStudent(contractStudent);
      setContractOpen(true);
    }
  }, [searchParams]);

  async function openTutorPortal() {
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tutor', id }),
    });
    if (!res.ok) {
      setPortalError('Failed to generate preview link.');
      setTimeout(() => setPortalError(''), 4000);
      return;
    }
    const { token } = await res.json();
    window.open(`/tutor-portal/impersonate?token=${encodeURIComponent(token)}`, '_blank');
  }

  async function handleSendSetup() {
    setSendingSetup(true);
    setSetupError('');
    try {
      const res = await fetch(`/api/tutors/${id}/resend-setup`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSetupError(body.error ?? `Failed (${res.status})`);
      } else {
        setSetupSent(true);
        setTimeout(() => setSetupSent(false), 4000);
      }
    } catch {
      setSetupError('Network error — please try again');
    }
    setSendingSetup(false);
  }

  async function saveRate() {
    const rate = parseFloat(rateValue);
    if (!isNaN(rate) && rate >= 0) {
      await supabase.from('tutors').update({ hourly_rate: rate }).eq('id', id);
      setTutor(prev => prev ? { ...prev, hourly_rate: rate } : prev);
    }
    setEditingRate(false);
  }

  async function handleCopySetupLink() {
    setCopyingLink(true);
    const res = await fetch(`/api/tutors/${id}/setup-link`, { method: 'POST' });
    setCopyingLink(false);
    if (!res.ok) { setSetupError('Failed to generate setup link'); return; }
    const { url } = await res.json();
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/tutors/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Archive failed (${res.status})`);
      setDeleting(false);
      return;
    }
    router.push('/tutors');
  }

  if (loading) return <AdminLayout><div className="animate-pulse h-64 card rounded-xl" /></AdminLayout>;
  if (!tutor) return <AdminLayout><p className="text-gray-500">Tutor not found.</p></AdminLayout>;

  const noShowCount = sessions.filter((s: any) =>
    s.status === 'no_show_tutor' || s.status === 'no_show_both'
  ).length;

  const completedSessions = sessions.filter((s: any) => s.status === 'completed');
  const ratedSessions = completedSessions.filter((s: any) => s.tutor_rating != null);
  const avgRating = ratedSessions.length
    ? ratedSessions.reduce((sum: number, s: any) => sum + s.tutor_rating, 0) / ratedSessions.length
    : null;
  const completionRate = sessions.length
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : null;

  return (
    <AdminLayout>
      {setupSent && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Setup email sent to {tutor.email}
        </div>
      )}
      {(setupError || portalError) && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          {setupError || portalError}
        </div>
      )}
      <div className="mb-6">
        <Link href="/tutors" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Tutors
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{tutor.name}</h1>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
            <button
              onClick={openTutorPortal}
              className="btn-secondary text-sm flex items-center gap-2"
              title="Preview tutor portal"
            >
              <Eye className="w-4 h-4" /> Tutor View
            </button>
            {!tutor.archived_at && (
              <button onClick={handleCopySetupLink} disabled={copyingLink} className="btn-secondary text-sm flex items-center gap-2">
                {copiedLink ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Clipboard className="w-4 h-4" />}
                {copyingLink ? 'Getting link…' : copiedLink ? 'Link Copied!' : 'Copy Setup Link'}
              </button>
            )}
            {!tutor.archived_at && !tutor.password_hash && (
              <button onClick={handleSendSetup} disabled={sendingSetup} className="btn-secondary text-sm flex items-center gap-2">
                {setupSent ? <CheckCircle className="w-4 h-4 text-green-600" /> : <LinkIcon className="w-4 h-4" />}
                {sendingSetup ? 'Sending…' : setupSent ? 'Setup Email Sent!' : 'Resend Setup Email'}
              </button>
            )}
            <button onClick={() => setContractOpen(true)} className="btn-primary text-sm">
              <FileText className="w-4 h-4" /> Assign Student + Send Contract
            </button>
            <button onClick={() => setEditOpen(true)} className="btn-secondary">
              <Edit className="w-4 h-4" /> Edit
            </button>
          </div>
            {setupError && <p className="text-red-500 text-xs">{setupError}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="col-span-1 space-y-5">
          <div className="card p-6">
            <div className="text-center mb-5">
              {tutor.photo_url ? (
                <Image src={tutor.photo_url} alt={tutor.name} width={96} height={96} className="w-24 h-24 rounded-full object-cover mx-auto" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-navy-100 flex items-center justify-center mx-auto">
                  <User className="w-12 h-12 text-navy-400" />
                </div>
              )}
              <h2 className="font-bold text-gray-900 text-lg mt-3">{tutor.name}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-gray-600">
                <Mail className="w-4 h-4 flex-shrink-0" />{tutor.email}
              </div>
              {tutor.phone && <div className="flex items-center gap-2.5 text-gray-600"><Phone className="w-4 h-4" />{tutor.phone}</div>}
              {tutor.timezone && (
                <div className="flex items-center gap-2.5 text-gray-600 text-xs">
                  <span className="font-medium text-gray-500">Timezone:</span>
                  <span>{new Intl.DateTimeFormat('en-US', { timeZone: tutor.timezone, timeZoneName: 'short' })
                    .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? tutor.timezone}
                  </span>
                </div>
              )}
              {editingRate ? (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-navy-700" />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={rateValue}
                    onChange={e => setRateValue(e.target.value)}
                    onBlur={saveRate}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveRate();
                      if (e.key === 'Escape') setEditingRate(false);
                    }}
                    autoFocus
                    className="w-20 text-sm border border-navy-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-navy-400"
                  />
                  <span className="text-sm text-gray-500">/hour</span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2.5 cursor-pointer group"
                  onClick={() => { setEditingRate(true); setRateValue(String(tutor.hourly_rate ?? 0)); }}
                  title="Click to edit rate"
                >
                  <DollarSign className="w-4 h-4 text-navy-700" />
                  <span className={`font-semibold group-hover:underline ${!tutor.hourly_rate || tutor.hourly_rate === 0 ? 'text-red-500' : 'text-navy-700'}`}>
                    {!tutor.hourly_rate || tutor.hourly_rate === 0 ? 'Set rate →' : `$${tutor.hourly_rate}/hour`}
                  </span>
                </div>
              )}
              {tutor.payment_info && (
                <div className="bg-gray-50 rounded-lg p-3 text-gray-600 text-xs">
                  <p className="font-medium text-gray-700 mb-1">Payment Info</p>
                  {tutor.payment_info}
                </div>
              )}
            </div>

            {tutor.bio && <p className="text-gray-500 text-sm mt-4 border-t border-gray-100 pt-4">{tutor.bio}</p>}

            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Subjects</p>
              <div className="flex flex-wrap gap-1.5">
                {tutor.subjects.map(s => <Badge key={s} label={s} />)}
              </div>
            </div>

            {noShowCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">No-Shows</p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                  {noShowCount} session{noShowCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Performance metrics */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Performance (last 20 sessions)</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Completed</span>
                <span className="font-medium text-gray-900">{completedSessions.length} / {sessions.length}</span>
              </div>
              {completionRate !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Completion rate</span>
                  <span className={`font-medium ${completionRate >= 80 ? 'text-green-600' : 'text-orange-600'}`}>
                    {completionRate}%
                  </span>
                </div>
              )}
              {avgRating !== null ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg rating</span>
                  <span className="font-medium text-amber-600">
                    {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))} {avgRating.toFixed(1)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg rating</span>
                  <span className="text-gray-400 italic">No ratings yet</span>
                </div>
              )}
            </div>
          </div>

        {/* Resume */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Resume</h2>
          {tutor.resume_url ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 truncate">{tutor.resume_filename ?? 'resume.pdf'}</p>
              <div className="flex items-center gap-2">
                <a
                  href={tutor.resume_url}
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

        {/* Performance Score */}
        {score && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Performance Score</h2>
              <TutorScoreBadge score={score.composite} size="md" />
            </div>
            <div className="space-y-3">
              {([
                { label: 'Session Rating',     value: score.sessionRating },
                { label: 'Student Progress',   value: score.studentProgress },
                { label: 'Consistency',        value: score.consistency },
                { label: 'Parent Satisfaction',value: score.parentSatisfaction },
              ] as const).map(({ label, value }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-700">{value}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Last calculated {new Date(score.calculatedAt).toLocaleDateString()}
            </p>
          </div>
        )}

        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* Availability Editor */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Weekly Availability</h2>
              {tutor.timezone && (
                <span className="text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 px-2 py-0.5 rounded-full">
                  {new Intl.DateTimeFormat('en-US', { timeZone: tutor.timezone, timeZoneName: 'short' })
                    .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? tutor.timezone}
                </span>
              )}
            </div>
            <AvailabilityEditor tutorId={id} availability={availability} onRefresh={load} />
          </div>

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">Student</th>
                    <th className="table-header">Duration</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sessions.length === 0 && (
                    <tr><td colSpan={5} className="table-cell text-gray-400 text-center py-6">No sessions yet</td></tr>
                  )}
                  {sessions.map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="table-cell">{formatDateTime(s.scheduled_at)}</td>
                      <td className="table-cell">{s.student?.name ?? '—'}</td>
                      <td className="table-cell">{s.duration_minutes} min</td>
                      <td className="table-cell"><StatusBadge status={s.status} /></td>
                      <td className="table-cell"><StatusBadge status={s.payment_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Delete button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          <Archive className="w-4 h-4" />
          Archive Tutor
        </button>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Tutor" size="lg">
        <TutorForm
          tutor={tutor}
          onSuccess={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Archive confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Archive Tutor">
        <p className="text-gray-600 text-sm mb-6">
          Archive <span className="font-semibold text-gray-900">{tutor.name}</span>? They will be removed from all dropdowns and portal login.
          Historical sessions, contracts, and payroll records are preserved. You can reactivate them later from the Tutors list.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteOpen(false)} className="btn-secondary" disabled={deleting}>
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            {deleting ? 'Archiving…' : 'Confirm Archive'}
          </button>
        </div>
      </Modal>

      <Modal open={contractOpen} onClose={() => { setContractOpen(false); setPreselectedStudent(undefined); }} title="Send Contract" size="lg">
        <SendContractForm
          tutorId={id}
          defaultRate={tutor.hourly_rate}
          defaultStudentId={preselectedStudent}
          onSuccess={() => { setContractOpen(false); setPreselectedStudent(undefined); }}
          onCancel={() => { setContractOpen(false); setPreselectedStudent(undefined); }}
        />
      </Modal>

    </AdminLayout>
  );
}
