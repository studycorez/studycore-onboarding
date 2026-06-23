'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Student } from '@/types';
import { Loader2 } from 'lucide-react';

const schema = z.object({
  name:         z.string().min(2, 'Name required'),
  email:        z.string().email('Valid email required'),
  phone:        z.string().optional(),
  parent_name:  z.string().optional(),
  parent_email: z.string().email('Valid email').optional().or(z.literal('')),
  grade:        z.coerce.number().int().min(9).max(12).optional(),
  target_score: z.coerce.number().int().min(400).max(1600).optional(),
  current_score:z.coerce.number().int().min(400).max(1600).optional(),
  notes:        z.string().optional(),
  hourly_rate:  z.coerce.number().positive('Must be positive').max(200).optional(),
});

type FormData = z.infer<typeof schema>;

interface PrefilledData {
  name?: string;
  parent_name?: string;
  parent_email?: string;
  notes?: string;
}

export default function StudentForm({
  student, onSuccess, onCancel, prefilledData, fromRequestId,
}: {
  student?: Student;
  onSuccess: (newId?: string) => void;
  onCancel: () => void;
  prefilledData?: PrefilledData;
  fromRequestId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(
      fromRequestId
        ? schema.refine(d => d.hourly_rate != null && d.hourly_rate > 0, {
            message: 'Hourly rate is required for tutor requests',
            path: ['hourly_rate'],
          })
        : schema
    ),
    defaultValues: {
      name:          student?.name ?? prefilledData?.name ?? '',
      email:         student?.email ?? '',
      phone:         student?.phone ?? '',
      parent_name:   student?.parent_name ?? prefilledData?.parent_name ?? '',
      parent_email:  student?.parent_email ?? prefilledData?.parent_email ?? '',
      grade:         student?.grade ?? undefined,
      target_score:  student?.target_score ?? undefined,
      current_score: student?.current_score ?? undefined,
      notes:         student?.notes ?? prefilledData?.notes ?? '',
      hourly_rate:   undefined,
    },
  });

  async function onSubmit(data: FormData) {
    setSaving(true); setError('');
    const { hourly_rate, ...studentData } = data;
    const payload = { ...studentData, parent_email: studentData.parent_email || null, grade: studentData.grade || null, target_score: studentData.target_score || null, current_score: studentData.current_score || null };
    if (student) {
      const { error } = await supabase.from('students').update(payload).eq('id', student.id);
      if (error) { setError(error.message); setSaving(false); return; }
      onSuccess();
    } else {
      const { data: inserted, error } = await supabase.from('students').insert(payload).select('id,name,email,grade,target_score').single();
      if (error) { setError(error.message); setSaving(false); return; }
      // Fire-and-forget Slack notification
      if (inserted) {
        fetch('/api/webhooks/slack-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'student_created', data: inserted }),
        }).catch(() => {});
      }
      // Complete tutor request if this was from a student-add request
      if (fromRequestId && inserted && hourly_rate) {
        try {
          const res = await fetch(`/api/admin/student-requests/${fromRequestId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: inserted.id, hourly_rate }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => null);
            console.error('[StudentForm] Request completion failed:', d?.error);
          }
        } catch (err) {
          console.error('[StudentForm] Request completion error:', err);
        }
      }
      onSuccess(inserted?.id);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {fromRequestId && (
        <div className="bg-navy-50 border border-navy-200 rounded-lg px-3 py-2 text-sm text-navy-700">
          Adding student from tutor request. Hourly rate is required to auto-create the contract.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input {...register('name')} className="input" placeholder="John Smith" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Email *</label>
          <input {...register('email')} className="input" type="email" placeholder="john@example.com" />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone</label>
          <input {...register('phone')} className="input" placeholder="+1 (555) 000-0000" />
        </div>
        <div>
          <label className="label">Grade</label>
          <select {...register('grade')} className="input">
            <option value="">Select grade</option>
            {[9,10,11,12].map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Parent/Guardian Name</label>
          <input {...register('parent_name')} className="input" placeholder="Jane Smith" />
        </div>
        <div>
          <label className="label">Parent/Guardian Email</label>
          <input {...register('parent_email')} className="input" type="email" placeholder="parent@example.com" />
          {errors.parent_email && <p className="text-red-500 text-xs mt-1">{errors.parent_email.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Current Score</label>
          <input {...register('current_score')} className="input" type="number" placeholder="1050" min="400" max="1600" />
        </div>
        <div>
          <label className="label">Target Score</label>
          <input {...register('target_score')} className="input" type="number" placeholder="1400" min="400" max="1600" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Hourly Rate ($){fromRequestId ? ' *' : ''}</label>
          <input {...register('hourly_rate')} className="input" type="number" placeholder="50" min="1" max="200" step="1" />
          {errors.hourly_rate && <p className="text-red-500 text-xs mt-1">{errors.hourly_rate.message}</p>}
        </div>
        <div />
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea {...register('notes')} className="input" rows={3} placeholder="Any relevant info about this student..." />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Saving…' : student ? 'Save Changes' : 'Add Student'}
        </button>
      </div>
    </form>
  );
}
