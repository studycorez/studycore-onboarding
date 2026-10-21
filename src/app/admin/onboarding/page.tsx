'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Send, Eye, CheckCircle, UserPlus, X, AlertTriangle, ExternalLink } from 'lucide-react';
import GamePlanUpload, { type GamePlanUploadHandle } from '@/components/GamePlanUpload';

export const dynamic = 'force-dynamic';

interface Student {
  id: string;
  name: string;
  email: string;
  parent_name: string | null;
  parent_email: string | null;
  target_score: number | null;
  purchased_hours: number | null;
  onboarding_email_sent: boolean;
  game_plan_url: string | null;
}

type PipelineResult =
  | { type: 'success';       studentId: string; studentName: string; parentEmail: string }
  | { type: 'upload-failed'; studentId: string; studentName: string; message: string }
  | { type: 'email-failed';  studentId: string; studentName: string; message: string };

const inputStyle = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white';
const today = new Date().toISOString().slice(0, 10);

export default function OnboardingPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Existing-student send form ─────────────────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [form, setForm] = useState({
    parent_name: '',
    parent_email: '',
    student_name: '',
    hours_purchased: '',
    total_paid: '',
    purchase_date: today,
    target_score: '',
    program_start_date: '',
    custom_message: '',
    game_plan_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  // ── Create-new-student mode ────────────────────────────────────────────────
  const [createMode, setCreateMode]   = useState(false);
  const [createForm, setCreateForm]   = useState({ name: '', email: '', parent_name: '', parent_email: '' });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');

  // Program details for the one-click pipeline (separate from the existing-student form)
  const [createProgramForm, setCreateProgramForm] = useState({
    hours_purchased: '',
    total_paid: '',
    purchase_date: today,
    program_start_date: '',
    target_score: '',
    custom_message: '',
  });

  // Staged game plan ref + pipeline state
  const stagedUploadRef                             = useRef<GamePlanUploadHandle | null>(null);
  const [pipelineRunning, setPipelineRunning]       = useState(false);
  const [pipelineResult,  setPipelineResult]        = useState<PipelineResult | null>(null);

  // ── Load students ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, name, email, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent, game_plan_url')
        .order('name');
      setStudents(studentsData ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  // ── Existing-student handlers (unchanged) ──────────────────────────────────
  async function handleStudentSelect(studentId: string) {
    setSelectedStudentId(studentId);
    setSubmitted(false);
    setError('');
    if (!studentId) {
      setForm(f => ({ ...f, parent_name: '', parent_email: '', student_name: '', hours_purchased: '', target_score: '' }));
      return;
    }

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const res = await fetch(`/api/admin/contracts?status=signed&student_id=${studentId}`);
    const { contracts: allSigned } = await res.json();
    const contract = (allSigned ?? [])[0] ?? null;

    const purchaseDate = contract?.signed_at ? contract.signed_at.slice(0, 10) : today;
    const hours = student.purchased_hours ?? 0;
    const hourlyRate = contract ? contract.hourly_rate : 0;
    const totalPaid = hours && hourlyRate ? Math.round(hours * hourlyRate) : 0;

    setForm(f => ({
      ...f,
      student_name:     student.name,
      parent_name:      student.parent_name  ?? '',
      parent_email:     student.parent_email ?? '',
      target_score:     student.target_score ? String(student.target_score) : '',
      hours_purchased:  hours ? String(hours) : '',
      total_paid:       totalPaid ? String(totalPaid) : '',
      purchase_date:    purchaseDate,
      game_plan_url:    student.game_plan_url ?? '',
    }));
  }

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSend() {
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/admin/send-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, student_id: selectedStudentId || null }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to send. Please try again.');
      return;
    }

    setSubmitted(true);
    if (selectedStudentId) {
      setStudents(prev => prev.map(s => s.id === selectedStudentId ? { ...s, onboarding_email_sent: true } : s));
    }
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  async function refetchSelectedStudent() {
    if (!selectedStudentId) return;
    const { data } = await supabase
      .from('students')
      .select('id, name, email, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent, game_plan_url')
      .eq('id', selectedStudentId)
      .single();
    if (data) {
      setStudents(prev => prev.map(s => s.id === selectedStudentId ? { ...s, game_plan_url: (data as any).game_plan_url ?? null } : s));
      setForm(f => ({ ...f, game_plan_url: (data as any).game_plan_url ?? '' }));
    }
  }

  // ── Create-only (no email) — unchanged from commit 913ffff ─────────────────
  async function handleCreateStudent() {
    const name        = createForm.name.trim();
    const email       = createForm.email.trim();
    const parentName  = createForm.parent_name.trim();
    const parentEmail = createForm.parent_email.trim();

    if (!name) { setCreateError('Student name is required.'); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(parentEmail)) { setCreateError('A valid parent email is required.'); return; }
    if (email && !emailRe.test(email)) { setCreateError('Student email must be a valid address if provided.'); return; }

    setCreating(true);
    setCreateError('');

    if (email) {
      const { data: existing } = await supabase
        .from('students').select('id, name').eq('email', email).maybeSingle();
      if (existing) {
        setCreateError(`A student with email "${email}" already exists: ${(existing as any).name}. Select them from the dropdown instead.`);
        setCreating(false);
        return;
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('students')
      .insert({ name, email: email || null, parent_name: parentName || null, parent_email: parentEmail })
      .select('id, name, email, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent, game_plan_url')
      .single();

    if (insertErr || !inserted) {
      setCreateError(insertErr?.message ?? 'Failed to create student.');
      setCreating(false);
      return;
    }

    fetch('/api/webhooks/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'student_created', data: { id: inserted.id, name: inserted.name, email: inserted.email, grade: null, target_score: null } }),
    }).catch(() => {});

    setStudents(prev => [inserted as Student, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedStudentId(inserted.id);
    setForm(f => ({
      ...f,
      student_name:  inserted.name,
      parent_name:   (inserted as any).parent_name  ?? '',
      parent_email:  (inserted as any).parent_email ?? '',
      game_plan_url: '',
    }));

    setCreating(false);
    setCreateMode(false);
    setCreateForm({ name: '', email: '', parent_name: '', parent_email: '' });
  }

  // ── One-click pipeline: create + upload + extract + send ──────────────────
  async function handleSendOnboarding() {
    // ── a. Validate ────────────────────────────────────────────────────────
    const name        = createForm.name.trim();
    const email       = createForm.email.trim();
    const parentName  = createForm.parent_name.trim();
    const parentEmail = createForm.parent_email.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) { setCreateError('Student name is required.'); return; }
    if (!emailRe.test(parentEmail)) { setCreateError('A valid parent email is required.'); return; }
    if (email && !emailRe.test(email)) { setCreateError('Student email must be a valid address if provided.'); return; }
    if (!createProgramForm.hours_purchased) { setCreateError('Hours purchased is required.'); return; }
    if (!createProgramForm.total_paid)      { setCreateError('Total paid is required.'); return; }
    if (!createProgramForm.purchase_date)   { setCreateError('Purchase date is required.'); return; }

    // ── b. Confirm dialog — admin sees the address before any DB write ──────
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Create "${name}" and send onboarding email to ${parentEmail}?`)) return;

    setPipelineRunning(true);
    setCreateError('');
    setPipelineResult(null);

    // Duplicate guard on student email
    if (email) {
      const { data: existing } = await supabase
        .from('students').select('id, name').eq('email', email).maybeSingle();
      if (existing) {
        setCreateError(`A student with email "${email}" already exists: ${(existing as any).name}. Select them from the dropdown instead.`);
        setPipelineRunning(false);
        return;
      }
    }

    // ── c. Create student ──────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from('students')
      .insert({ name, email: email || null, parent_name: parentName || null, parent_email: parentEmail })
      .select('id, name, email, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent, game_plan_url')
      .single();

    if (insertErr || !inserted) {
      setCreateError(insertErr?.message ?? 'Failed to create student. Nothing was sent.');
      setPipelineRunning(false);
      return;
    }

    // Slack notification — fire-and-forget, same as StudentForm.tsx
    fetch('/api/webhooks/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'student_created', data: { id: inserted.id, name: inserted.name, email: inserted.email, grade: null, target_score: null } }),
    }).catch(() => {});

    const newId = inserted.id;
    let gamePlanUrl: string | null = null;

    // ── d. Upload staged game plan (if one was selected) ───────────────────
    if (stagedUploadRef.current?.hasStagedFile) {
      const uploadResult = await stagedUploadRef.current.commitStagedFile(newId);
      if ('error' in uploadResult) {
        // Student created, upload failed — do NOT send email automatically.
        setStudents(prev => [inserted as Student, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
        setPipelineResult({
          type: 'upload-failed',
          studentId: newId,
          studentName: name,
          message: `Student "${name}" was created, but the game plan upload failed: ${uploadResult.error}. The onboarding email was NOT sent. Upload the plan from the student page, then resend onboarding from there.`,
        });
        setPipelineRunning(false);
        return;
      }
      gamePlanUrl = uploadResult.url;
    }

    // ── e. Send onboarding email ───────────────────────────────────────────
    const emailRes = await fetch('/api/admin/send-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id:         newId,
        parent_email:       parentEmail,
        parent_name:        parentName,
        student_name:       name,
        hours_purchased:    createProgramForm.hours_purchased,
        total_paid:         createProgramForm.total_paid,
        purchase_date:      createProgramForm.purchase_date,
        target_score:       createProgramForm.target_score       || null,
        program_start_date: createProgramForm.program_start_date || null,
        custom_message:     createProgramForm.custom_message     || null,
        game_plan_url:      gamePlanUrl,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.json().catch(() => ({}));
      // Student + plan exist but email failed — show loudly, never swallow.
      setStudents(prev => [inserted as Student, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
      setPipelineResult({
        type: 'email-failed',
        studentId: newId,
        studentName: name,
        message: `Student "${name}" was created${gamePlanUrl ? ' with game plan attached' : ''}, but the onboarding email FAILED to send: ${body.error ?? 'unknown error'}. Resend the email from the student page.`,
      });
      setPipelineRunning(false);
      return;
    }

    // ── SUCCESS ────────────────────────────────────────────────────────────
    setStudents(prev =>
      [{ ...(inserted as Student), onboarding_email_sent: true }, ...prev]
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setPipelineResult({ type: 'success', studentId: newId, studentName: name, parentEmail });
    setCreateForm({ name: '', email: '', parent_name: '', parent_email: '' });
    setCreateProgramForm({ hours_purchased: '', total_paid: '', purchase_date: today, program_start_date: '', target_score: '', custom_message: '' });
    setPipelineRunning(false);
  }

  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Send a personalized welcome email to a parent when their student enrolls.
          </p>
        </div>
        <button
          onClick={() => { setCreateMode(m => !m); setCreateError(''); setPipelineResult(null); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${createMode ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-navy-700 text-white hover:bg-navy-800'}`}
        >
          {createMode ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {createMode ? 'Cancel' : 'Create New Student'}
        </button>
      </div>

      {/* ── Create-new-student pipeline card ── */}
      {createMode && (
        <div className="card p-6 mb-6 max-w-2xl space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">New Student</p>
            <p className="text-xs text-gray-500">Identity fields are typed manually — not extracted from the PDF.</p>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Student Name <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className={inputStyle} placeholder="Jane Smith" disabled={pipelineRunning} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Student Email</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className={inputStyle} placeholder="jane@example.com" disabled={pipelineRunning} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Name</label>
              <input type="text" value={createForm.parent_name} onChange={e => setCreateForm(f => ({ ...f, parent_name: e.target.value }))} className={inputStyle} placeholder="John Smith" disabled={pipelineRunning} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Email <span className="text-red-500">*</span></label>
              <input type="email" value={createForm.parent_email} onChange={e => setCreateForm(f => ({ ...f, parent_email: e.target.value }))} className={inputStyle} placeholder="parent@example.com" disabled={pipelineRunning} />
            </div>
          </div>

          {/* Staged game plan */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Game Plan PDF <span className="text-gray-400 font-normal normal-case">(optional)</span></p>
            <p className="text-xs text-gray-500 mb-3">Select the PDF now — it uploads after the student record is created.</p>
            <GamePlanUpload ref={stagedUploadRef} staged />
          </div>

          {/* Program Details */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Program Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hours Purchased <span className="text-red-500">*</span></label>
                <input type="number" min={1} value={createProgramForm.hours_purchased} onChange={e => setCreateProgramForm(f => ({ ...f, hours_purchased: e.target.value }))} className={inputStyle} placeholder="20" disabled={pipelineRunning} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Paid ($) <span className="text-red-500">*</span></label>
                <input type="number" min={0} value={createProgramForm.total_paid} onChange={e => setCreateProgramForm(f => ({ ...f, total_paid: e.target.value }))} className={inputStyle} placeholder="1400" disabled={pipelineRunning} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date <span className="text-red-500">*</span></label>
                <input type="date" value={createProgramForm.purchase_date} onChange={e => setCreateProgramForm(f => ({ ...f, purchase_date: e.target.value }))} className={inputStyle} disabled={pipelineRunning} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Program Start Date</label>
                <input type="date" value={createProgramForm.program_start_date} onChange={e => setCreateProgramForm(f => ({ ...f, program_start_date: e.target.value }))} className={inputStyle} disabled={pipelineRunning} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">SAT Target Score</label>
              <input type="number" min={400} max={1600} step={10} value={createProgramForm.target_score} onChange={e => setCreateProgramForm(f => ({ ...f, target_score: e.target.value }))} className={inputStyle} placeholder="e.g. 1400" disabled={pipelineRunning} />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Custom Message <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={createProgramForm.custom_message} onChange={e => setCreateProgramForm(f => ({ ...f, custom_message: e.target.value }))} rows={2} className={inputStyle} placeholder="Personal note to include in the email…" disabled={pipelineRunning} />
            </div>
          </div>

          {/* Validation / pipeline errors */}
          {createError && (
            <p className="text-red-600 text-sm">{createError}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleCreateStudent}
              disabled={creating || pipelineRunning}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creating ? 'Creating…' : 'Create Only'}
            </button>
            <button
              type="button"
              onClick={handleSendOnboarding}
              disabled={pipelineRunning || creating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-navy-700 text-white hover:bg-navy-800 disabled:opacity-50 transition-colors"
            >
              {pipelineRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {pipelineRunning ? 'Running…' : 'Create & Send Onboarding'}
            </button>
          </div>

          {/* Pipeline result banners */}
          {pipelineResult?.type === 'success' && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800">Created &amp; onboarding sent!</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    Onboarding email sent to <strong>{pipelineResult.parentEmail}</strong> for <strong>{pipelineResult.studentName}</strong>.
                  </p>
                  <a
                    href={`/students/${pipelineResult.studentId}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-green-700 hover:text-green-900 underline"
                  >
                    View student page <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
          {pipelineResult?.type === 'upload-failed' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Student created — game plan upload failed</p>
                  <p className="text-sm text-amber-700 mt-1">{pipelineResult.message}</p>
                  <a
                    href={`/students/${pipelineResult.studentId}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-amber-700 hover:text-amber-900 underline"
                  >
                    Go to student page to upload &amp; resend <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
          {pipelineResult?.type === 'email-failed' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">⚠ Onboarding email FAILED to send</p>
                  <p className="text-sm text-red-700 mt-1">{pipelineResult.message}</p>
                  <a
                    href={`/students/${pipelineResult.studentId}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
                  >
                    Go to student page to resend <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Existing-student send form ── */}
      {submitted ? (
        <div className="card p-10 max-w-lg flex flex-col items-center text-center gap-4">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <div>
            <p className="font-semibold text-gray-900 text-lg">Email sent!</p>
            <p className="text-gray-500 text-sm mt-1">
              Onboarding email sent to <strong>{form.parent_email}</strong>.
            </p>
          </div>
          <button
            onClick={() => {
              setSubmitted(false);
              setSelectedStudentId('');
              setForm({ parent_name: '', parent_email: '', student_name: '', hours_purchased: '', total_paid: '', purchase_date: today, target_score: '', program_start_date: '', custom_message: '', game_plan_url: '' });
            }}
            className="btn-primary mt-2"
          >
            Send Another
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-5xl">
          {/* Form */}
          <div className="card p-6 space-y-5">
            {/* Student Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auto-fill from Student <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={selectedStudentId}
                onChange={e => handleStudentSelect(e.target.value)}
                className={inputStyle}
              >
                <option value="">— select student to auto-fill —</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.onboarding_email_sent ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              {selectedStudent?.onboarding_email_sent && (
                <p className="text-xs text-amber-600 mt-1">Onboarding email was previously sent to this student.</p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recipient</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.student_name} onChange={e => setField('student_name', e.target.value)} className={inputStyle} placeholder="Jane Smith" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.parent_name} onChange={e => setField('parent_name', e.target.value)} className={inputStyle} placeholder="John Smith" required />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email <span className="text-red-500">*</span></label>
                <input type="email" value={form.parent_email} onChange={e => setField('parent_email', e.target.value)} className={inputStyle} placeholder="parent@email.com" required />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Program Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours Purchased <span className="text-red-500">*</span></label>
                  <input type="number" min={1} value={form.hours_purchased} onChange={e => setField('hours_purchased', e.target.value)} className={inputStyle} placeholder="20" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Paid ($) <span className="text-red-500">*</span></label>
                  <input type="number" min={0} value={form.total_paid} onChange={e => setField('total_paid', e.target.value)} className={inputStyle} placeholder="1400" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.purchase_date} onChange={e => setField('purchase_date', e.target.value)} className={inputStyle} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Program Start Date</label>
                  <input type="date" value={form.program_start_date} onChange={e => setField('program_start_date', e.target.value)} className={inputStyle} />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">SAT Target Score</label>
                <input type="number" min={400} max={1600} step={10} value={form.target_score} onChange={e => setField('target_score', e.target.value)} className={inputStyle} placeholder="e.g. 1400" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message from Admin <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={form.custom_message}
                onChange={e => setField('custom_message', e.target.value)}
                rows={3}
                className={inputStyle}
                placeholder="Personal note to include in the email…"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPreview(p => !p)}
                className="btn-secondary flex-1 justify-center"
              >
                <Eye className="w-4 h-4" />
                {preview ? 'Hide Preview' : 'Preview Email'}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={submitting || !form.parent_email || !form.parent_name || !form.student_name || !form.hours_purchased || !form.total_paid || !form.purchase_date}
                className="btn-primary flex-1 justify-center"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>

          {/* Game Plan Upload — existing students */}
          {selectedStudentId && (
            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Game Plan</p>
              <p className="text-xs text-gray-500 mb-3">Upload a game plan PDF — it will be linked in the onboarding email.</p>
              <GamePlanUpload
                studentId={selectedStudentId}
                existingUrl={selectedStudent?.game_plan_url ?? null}
                onComplete={refetchSelectedStudent}
              />
            </div>
          )}

          {/* Preview Panel */}
          {preview && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Preview</p>
                <p className="text-xs text-gray-400 mt-0.5">To: {form.parent_email || 'parent@email.com'}</p>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                <PreviewEmail form={form} />
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function PreviewEmail({ form }: { form: Record<string, string> }) {
  const parentFirst = form.parent_name.trim().split(/\s+/)[0] || 'there';
  const studentFirst = form.student_name.trim().split(/\s+/)[0] || 'your student';
  const hours = form.hours_purchased || '—';
  const paid = form.total_paid ? `$${Number(form.total_paid).toLocaleString()}` : '—';
  const purchaseDate = form.purchase_date ? new Date(form.purchase_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const startDate = form.program_start_date ? new Date(form.program_start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="p-4">
      {/* Header */}
      <div style={{ background: '#1e2a5e', padding: '24px 32px', textAlign: 'center', borderRadius: '8px 8px 0 0' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>StudyCore</div>
        <div style={{ fontSize: 11, color: '#a5b4fc', marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>SAT &amp; ACT Tutoring</div>
      </div>
      {/* Hero */}
      <div style={{ padding: '32px 32px 24px', textAlign: 'center', background: '#fff' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e2a5e', margin: '0 0 10px' }}>Welcome to StudyCore, {parentFirst}!</h1>
        <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, margin: 0 }}>{studentFirst} is officially enrolled and ready to start their SAT prep journey.</p>
      </div>
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 32px' }} />
      {/* Summary */}
      <div style={{ padding: '24px 32px', background: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Program Summary</div>
        <div style={{ background: '#f8faff', border: '1px solid #c3d1ff', borderRadius: 8, overflow: 'hidden' }}>
          {[
            ['Student', form.student_name || '—'],
            ['Hours Purchased', hours + ' hours'],
            ['Total Investment', paid],
            ['Purchase Date', purchaseDate],
            ...(startDate ? [['Program Starts', startDate]] : []),
          ].map(([label, value], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{label}</span>
              <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 32px' }} />
      {/* Tutor intro line */}
      <div style={{ padding: '24px 32px', background: '#fff' }}>
        <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '16px 20px' }}>
          You&apos;ll be introduced to your tutor within 24 hours. They&apos;ll reach out directly to lock in your first session.
        </p>
      </div>
      {/* Target Score */}
      {form.target_score && (
        <div style={{ padding: '0 32px 24px', background: '#fff' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1 }}>Target SAT Score</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#15803d' }}>{form.target_score}</div>
          </div>
        </div>
      )}
      {/* Custom Message */}
      {form.custom_message && (
        <div style={{ padding: '0 32px 24px', background: '#fff' }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Message from Your Program Director</div>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>{form.custom_message}</p>
          </div>
        </div>
      )}
      {/* Footer */}
      <div style={{ padding: '16px 32px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#9ca3af', textAlign: 'center', borderRadius: '0 0 8px 8px' }}>
        © {new Date().getFullYear()} StudyCore. All rights reserved.
      </div>
    </div>
  );
}
