'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Tutor } from '@/types';
import { Loader2, X, Plus } from 'lucide-react';

const TIMEZONES = [
  { label: 'EST (New York)',       value: 'America/New_York' },
  { label: 'CST (Chicago)',        value: 'America/Chicago' },
  { label: 'MST (Denver)',         value: 'America/Denver' },
  { label: 'PST (Los Angeles)',    value: 'America/Los_Angeles' },
  { label: 'GMT (London)',         value: 'Europe/London' },
  { label: 'IST (India)',          value: 'Asia/Kolkata' },
];

const schema = z.object({
  name:              z.string().min(2, 'Name required'),
  email:             z.string().email('Valid email required'),
  phone:             z.string().optional(),
  photo_url:         z.string().url('Must be a valid URL').optional().or(z.literal('')),
  bio:               z.string().optional(),
  hourly_rate:       z.coerce.number().min(0),
  payment_info:      z.string().optional(),
  zoom_user_id:      z.string().optional(),
  availability_mode: z.enum(['form', 'manual']),
  timezone:          z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const SUBJECT_OPTIONS = ['SAT Math', 'SAT Reading', 'SAT Writing', 'ACT Math', 'ACT English', 'ACT Science', 'ACT Reading'];

export default function TutorForm({
  tutor,
  onSuccess,
  onCancel,
}: {
  tutor?: Tutor;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [subjects, setSubjects] = useState<string[]>(tutor?.subjects ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:              tutor?.name ?? '',
      email:             tutor?.email ?? '',
      phone:             tutor?.phone ?? '',
      photo_url:         tutor?.photo_url ?? '',
      bio:               tutor?.bio ?? '',
      hourly_rate:       tutor?.hourly_rate ?? 0,
      payment_info:      tutor?.payment_info ?? '',
      zoom_user_id:      tutor?.zoom_user_id ?? '',
      availability_mode: tutor?.availability_mode ?? 'manual',
      timezone:          tutor?.timezone ?? 'America/New_York',
    },
  });

  const toggleSubject = (s: string) =>
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  async function onSubmit(data: FormData) {
    setSaving(true); setError('');
    const payload = { ...data, subjects, photo_url: data.photo_url || null, zoom_user_id: data.zoom_user_id || null, timezone: data.timezone || 'America/New_York' };
    const { error } = tutor
      ? await supabase.from('tutors').update(payload).eq('id', tutor.id)
      : await supabase.from('tutors').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input {...register('name')} className="input" placeholder="Jane Smith" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Email *</label>
          <input {...register('email')} className="input" type="email" placeholder="jane@example.com" />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone</label>
          <input {...register('phone')} className="input" placeholder="+1 (555) 000-0000" />
        </div>
        <div>
          <label className="label">Hourly Rate ($) *</label>
          <input {...register('hourly_rate')} className="input" type="number" step="0.01" min="0" />
          {errors.hourly_rate && <p className="text-red-500 text-xs mt-1">{errors.hourly_rate.message}</p>}
        </div>
      </div>

      <div>
        <label className="label">Photo URL</label>
        <input {...register('photo_url')} className="input" placeholder="https://..." />
        {errors.photo_url && <p className="text-red-500 text-xs mt-1">{errors.photo_url.message}</p>}
      </div>

      <div>
        <label className="label">Bio</label>
        <textarea {...register('bio')} className="input" rows={3} placeholder="Brief bio..." />
      </div>

      <div>
        <label className="label">Subjects</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SUBJECT_OPTIONS.map(s => (
            <button
              key={s} type="button"
              onClick={() => toggleSubject(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${subjects.includes(s) ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Payment Info</label>
          <input {...register('payment_info')} className="input" placeholder="Venmo @jane, bank note…" />
        </div>
        <div>
          <label className="label">Zoom User ID</label>
          <input {...register('zoom_user_id')} className="input" placeholder="jane@example.com or user ID" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Availability Mode</label>
          <select {...register('availability_mode')} className="input">
            <option value="manual">Manual (admin manages slots)</option>
            <option value="form">Form (tutor submits via link)</option>
          </select>
        </div>
        <div>
          <label className="label">Timezone</label>
          <select {...register('timezone')} className="input">
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Saving…' : tutor ? 'Save Changes' : 'Add Tutor'}
        </button>
      </div>
    </form>
  );
}
