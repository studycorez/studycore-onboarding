'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Loader2, Upload } from 'lucide-react';

interface Props {
  tutorId: string;
  defaultRate: number;
  defaultStudentId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface StudentOption { id: string; name: string; game_plan_url: string | null; }

export default function SendContractForm({ tutorId, defaultRate, defaultStudentId, onSuccess, onCancel }: Props) {
  const supabase = createClient();
  const [students, setStudents]   = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState(defaultStudentId ?? '');
  const [hourlyRate, setHourlyRate] = useState(
    Math.min(40, Math.max(18, Math.round(defaultRate))) || 20
  );
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    supabase
      .from('students')
      .select('id, name, game_plan_url')
      .is('merged_into_id', null)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        const list = (data as StudentOption[]) ?? [];
        setStudents(list);
        if (defaultStudentId) {
          setSelectedStudent(list.find(s => s.id === defaultStudentId) ?? null);
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) { setError('Please select a student.'); return; }
    setSaving(true);
    setError('');

    const formData = new FormData();
    formData.append('tutor_id',    tutorId);
    formData.append('student_id',  studentId);
    formData.append('hourly_rate', String(hourlyRate));
    // Use student's existing game plan if available, otherwise use uploaded file
    if (selectedStudent?.game_plan_url) {
      formData.append('game_plan_url', selectedStudent.game_plan_url);
    } else if (pdfFile) {
      formData.append('pdf', pdfFile);
    }

    try {
      const res = await fetch('/api/contracts', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create contract'); setSaving(false); return; }
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-gray-500">
        This will create a contract and send the tutor a signing link via email.
      </p>

      {/* Student */}
      <div>
        <label className="label">Student *</label>
        <select
          value={studentId}
          onChange={e => {
            setStudentId(e.target.value);
            setSelectedStudent(students.find(s => s.id === e.target.value) ?? null);
          }}
          className="input"
          required
        >
          <option value="">Select a student…</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Hourly Rate */}
      <div>
        <label className="label">Hourly Rate *</label>
        <select
          value={hourlyRate}
          onChange={e => setHourlyRate(Number(e.target.value))}
          className="input"
        >
          {Array.from({ length: 23 }, (_, i) => i + 18).map(rate => (
            <option key={rate} value={rate}>${rate}/hour</option>
          ))}
        </select>
      </div>

      {/* PDF Upload — auto-attach from student profile if available */}
      <div>
        <label className="label">Game Plan PDF</label>
        {selectedStudent?.game_plan_url ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <Check className="w-4 h-4 flex-shrink-0" />
            Game plan from student profile will be attached automatically.
          </div>
        ) : (
          <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-navy-400 hover:bg-navy-50 transition-colors">
            <Upload className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 truncate">
              {pdfFile ? pdfFile.name : 'Click to upload PDF…'}
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Sending…' : 'Create & Send Contract'}
        </button>
      </div>
    </form>
  );
}
