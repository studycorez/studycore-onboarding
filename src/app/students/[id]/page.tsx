'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import StudentForm from '@/components/students/StudentForm';
import StudentAvailabilityEditor from '@/components/students/StudentAvailabilityEditor';
import { StatusBadge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import type { Student, StudentAvailability, StudentProgress, Session } from '@/types';
import { ArrowLeft, Edit, Mail, Phone, User, Check, X, Upload, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent]         = useState<Student | null>(null);
  const [availability, setAvail]      = useState<StudentAvailability[]>([]);
  const [progress, setProgress]       = useState<StudentProgress[]>([]);
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [editOpen, setEditOpen]           = useState(false);
  const [loading, setLoading]             = useState(true);
  const [editingHours, setEditingHours]   = useState(false);
  const [hoursInput, setHoursInput]       = useState('');
  const [hoursSaving, setHoursSaving]     = useState(false);

  // Game plan state
  const [uploading, setUploading]         = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [aiResult, setAiResult]           = useState<{ hours: number; reasoning: string } | null>(null);
  const [aiModalOpen, setAiModalOpen]     = useState(false);
  const [aiHoursEdit, setAiHoursEdit]     = useState('');
  const [confirmingSaving, setConfirmingSaving] = useState(false);

  const supabase = createClient();

  const load = useCallback(async () => {
    const [s, a, p, sess] = await Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),
      supabase.from('student_availability').select('*').eq('student_id', id).order('day_of_week').order('start_time'),
      supabase.from('student_progress').select('*').eq('student_id', id).order('recorded_at'),
      supabase.from('sessions').select('*, tutor:tutors(name)').eq('student_id', id).order('scheduled_at', { ascending: false }).limit(20),
    ]);
    setStudent(s.data);
    setAvail(a.data ?? []);
    setProgress(p.data ?? []);
    setSessions(sess.data as any ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const chartData = progress.map(p => ({
    date: format(new Date(p.recorded_at), 'MMM d'),
    Math: p.math_score,
    Reading: p.reading_score,
    Writing: p.writing_score,
    Total: p.total_score,
  }));

  async function saveHours() {
    const val = parseFloat(hoursInput);
    if (isNaN(val) || val < 0) return;
    setHoursSaving(true);
    await supabase
      .from('students')
      .update({ purchased_hours: val, low_hours_alerted: false })
      .eq('id', id);
    setHoursSaving(false);
    setEditingHours(false);
    load();
  }

  async function handleGamePlanUpload(file: File) {
    setUploading(true);
    // Upload to storage
    const { error: upErr } = await supabase.storage
      .from('game-plans')
      .upload(`student-${id}/gameplan.pdf`, file, { upsert: true, contentType: 'application/pdf' });

    if (upErr) { setUploading(false); alert('Upload failed: ' + upErr.message); return; }

    // Get public/signed URL
    const { data: urlData } = await supabase.storage
      .from('game-plans')
      .createSignedUrl(`student-${id}/gameplan.pdf`, 60 * 60 * 24 * 365);

    const gamePlanUrl = urlData?.signedUrl ?? null;

    // Save URL + timestamp to student record
    await supabase.from('students').update({
      game_plan_url: gamePlanUrl,
      game_plan_uploaded_at: new Date().toISOString(),
    }).eq('id', id);

    setUploading(false);
    await load();

    // Trigger AI extraction
    setExtracting(true);
    try {
      const res = await fetch(`/api/students/${id}/extract-hours`, { method: 'POST' });
      const data = await res.json();
      if (data.hours != null) {
        setAiResult({ hours: data.hours, reasoning: data.reasoning });
        setAiHoursEdit(String(data.hours));
        setAiModalOpen(true);
      }
    } catch { /* extraction failure is non-fatal */ }
    setExtracting(false);
  }

  async function confirmAiHours() {
    const val = parseFloat(aiHoursEdit);
    if (isNaN(val) || val < 0) return;
    setConfirmingSaving(true);
    await supabase.from('students').update({
      purchased_hours: val,
      low_hours_alerted: false,
    }).eq('id', id);
    setConfirmingSaving(false);
    setAiModalOpen(false);
    setAiResult(null);
    load();
  }

  if (loading) return <AdminLayout><div className="animate-pulse h-64 card rounded-xl" /></AdminLayout>;
  if (!student) return <AdminLayout><p className="text-gray-500">Student not found.</p></AdminLayout>;

  const latestProgress   = progress[progress.length - 1];
  const purchasedHours   = student?.purchased_hours ?? 0;
  const usedHours        = student?.used_hours ?? 0;
  const remainingHours   = purchasedHours - usedHours;
  const pctUsed          = purchasedHours > 0 ? Math.min(100, (usedHours / purchasedHours) * 100) : 0;
  const isLow            = purchasedHours > 0 && remainingHours < 5;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
          <button onClick={() => setEditOpen(true)} className="btn-secondary">
            <Edit className="w-4 h-4" /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile */}
        <div className="col-span-1 space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7 text-navy-500" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{student.name}</h2>
                {student.grade && <p className="text-gray-500 text-sm">Grade {student.grade}</p>}
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4" />{student.email}</div>
              {student.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" />{student.phone}</div>}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Scores</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Current</p>
                  <p className="text-xl font-bold text-gray-900">{latestProgress?.total_score ?? student.current_score ?? '—'}</p>
                </div>
                <div className="bg-navy-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-navy-600">Target</p>
                  <p className="text-xl font-bold text-navy-900">{student.target_score ?? '—'}</p>
                </div>
              </div>
            </div>

            {student.parent_name && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Parent/Guardian</p>
                <p className="text-sm text-gray-700 font-medium">{student.parent_name}</p>
                {student.parent_email && <p className="text-sm text-gray-500">{student.parent_email}</p>}
              </div>
            )}

            {student.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{student.notes}</p>
              </div>
            )}
          </div>

          {/* Hours Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Hours</p>
              {isLow && (
                <span className="text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">Low</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Purchased</p>
                <p className="text-lg font-bold text-gray-900">{purchasedHours}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Used</p>
                <p className="text-lg font-bold text-gray-900">{usedHours.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Remaining</p>
                <p className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                  {remainingHours.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
              <div
                className={`h-2 rounded-full transition-all ${pctUsed >= 80 ? 'bg-red-500' : pctUsed >= 60 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>

            {/* Edit purchased hours */}
            {editingHours ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={hoursInput}
                  onChange={e => setHoursInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveHours(); if (e.key === 'Escape') setEditingHours(false); }}
                  className="input text-sm py-1.5 flex-1"
                  autoFocus
                />
                <button onClick={saveHours} disabled={hoursSaving} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingHours(false)} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setHoursInput(String(purchasedHours)); setEditingHours(true); }}
                className="w-full text-xs text-navy-600 hover:text-navy-800 font-medium text-center py-1 rounded-lg hover:bg-navy-50 transition-colors"
              >
                Edit purchased hours
              </button>
            )}
          </div>
          {/* Game Plan Card */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3">Game Plan</p>

            {student.game_plan_url && (
              <a
                href={student.game_plan_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-navy-700 hover:text-navy-900 font-medium mb-3"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                View current game plan
              </a>
            )}

            {(uploading || extracting) ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                {uploading ? 'Uploading…' : 'Extracting hours with AI…'}
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-navy-700 hover:bg-navy-50 rounded-lg px-3 py-2 border border-dashed border-gray-300 hover:border-navy-300 transition-colors">
                <Upload className="w-4 h-4 flex-shrink-0" />
                {student.game_plan_url ? 'Replace game plan PDF' : 'Upload game plan PDF'}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleGamePlanUpload(f); e.target.value = ''; }}
                />
              </label>
            )}

            {student.game_plan_uploaded_at && (
              <p className="text-xs text-gray-400 mt-2">
                Uploaded {new Date(student.game_plan_uploaded_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* Progress Chart */}
          {chartData.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Score Progress</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis domain={[400, 1600]} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Total" stroke="#1e2090" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Math" stroke="#6b84ff" strokeWidth={1.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Reading" stroke="#10b981" strokeWidth={1.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Availability */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Weekly Availability</h2>
            <StudentAvailabilityEditor studentId={id} availability={availability} onRefresh={load} />
          </div>

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session History</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Tutor</th>
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
                    <td className="table-cell">{s.tutor?.name ?? '—'}</td>
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Student" size="lg">
        <StudentForm
          student={student}
          onSuccess={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* AI hours confirmation modal */}
      <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="AI Hours Detected">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            AI detected <span className="font-semibold text-gray-900">{aiResult?.hours} hours</span> in the game plan. Set this as {student.name}&apos;s purchased hours?
          </p>
          {aiResult?.reasoning && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">
              {aiResult.reasoning}
            </div>
          )}
          <div>
            <label className="label">Hours (edit if needed)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={aiHoursEdit}
              onChange={e => setAiHoursEdit(e.target.value)}
              className="input"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setAiModalOpen(false)}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAiHours}
              disabled={confirmingSaving}
              className="btn-primary flex-1 justify-center"
            >
              {confirmingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmingSaving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
