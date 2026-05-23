'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Send, Eye, CheckCircle } from 'lucide-react';

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

const inputStyle = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400 bg-white';
const today = new Date().toISOString().slice(0, 10);

export default function OnboardingPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Fetch their signed contract for hours + purchase date
    const { data: contract } = await supabase
      .from('contracts')
      .select('hourly_rate, signed_at')
      .eq('student_id', studentId)
      .eq('status', 'signed')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const purchaseDate = contract?.signed_at ? contract.signed_at.slice(0, 10) : today;
    const hours = student.purchased_hours ?? 0;
    const hourlyRate = contract ? contract.hourly_rate : 0;
    const totalPaid = hours && hourlyRate ? Math.round(hours * hourlyRate) : 0;

    setForm(f => ({
      ...f,
      student_name: student.name,
      parent_name: student.parent_name ?? '',
      parent_email: student.parent_email ?? '',
      target_score: student.target_score ? String(student.target_score) : '',
      hours_purchased: hours ? String(hours) : '',
      total_paid: totalPaid ? String(totalPaid) : '',
      purchase_date: purchaseDate,
      game_plan_url: student.game_plan_url ?? '',
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
    // Update local state to reflect sent
    if (selectedStudentId) {
      setStudents(prev => prev.map(s => s.id === selectedStudentId ? { ...s, onboarding_email_sent: true } : s));
    }
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding Email</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send a personalized welcome email to a parent when their student enrolls.
        </p>
      </div>

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
