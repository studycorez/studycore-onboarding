import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Timezone offset in hours (standard time; close enough for scheduling)
const TZ_OFFSET: Record<string, number> = { EST: -5, CST: -6, MST: -7, PST: -8 };

/**
 * Returns the ISO timestamp of the next upcoming occurrence of `dbDay`
 * (JS day-of-week, 0=Sun) at `timeStr` ("HH:mm") in the given timezone.
 */
function nextOccurrenceUTC(dbDay: number, timeStr: string, tz: string): string {
  const offsetHours = TZ_OFFSET[tz] ?? -5;
  const [h, m] = timeStr.split(':').map(Number);
  const nowUTC = new Date();

  for (let i = 0; i < 8; i++) {
    const candidate = new Date(nowUTC);
    candidate.setUTCDate(nowUTC.getUTCDate() + i);
    // Set hours in local time by adjusting for offset
    candidate.setUTCHours(h - offsetHours, m, 0, 0);
    // Check that the local day-of-week matches
    const localDay = new Date(candidate.getTime() + offsetHours * 3_600_000).getUTCDay();
    if (localDay === dbDay && candidate > nowUTC) {
      return candidate.toISOString();
    }
  }

  // Fallback: 7 days from now
  const fallback = new Date(nowUTC);
  fallback.setUTCDate(nowUTC.getUTCDate() + 7);
  return fallback.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, bio, subjects, hourly_rate, availability, sessions } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Parse subjects string into array
    const subjectsArray = subjects
      ? subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    // ── Upsert tutor by email ────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('tutors')
      .select('id, archived_at')
      .eq('email', email)
      .maybeSingle();

    // Silently reject archived tutors — generic response to avoid information disclosure
    if (existing?.archived_at !== null && existing?.archived_at !== undefined) {
      return NextResponse.json({ ok: true });
    }

    let tutorId: string;

    if (existing) {
      await supabase.from('tutors').update({
        name,
        phone:       phone ?? null,
        bio:         bio ?? null,
        subjects:    subjectsArray,
        hourly_rate: hourly_rate ? parseInt(hourly_rate) : null,
      }).eq('id', existing.id);
      tutorId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('tutors')
        .insert({ name, email, phone: phone ?? null, bio: bio ?? null, subjects: subjectsArray, hourly_rate: hourly_rate ? parseInt(hourly_rate) : null })
        .select('id')
        .single();
      if (insertError || !inserted) throw insertError ?? new Error('Failed to create tutor');
      tutorId = inserted.id;
    }

    // ── Replace availability ─────────────────────────────────────────────────
    await supabase.from('tutor_availability').delete().eq('tutor_id', tutorId);

    if (Array.isArray(availability) && availability.length > 0) {
      // Validate before inserting to avoid raw DB constraint errors
      for (const s of availability as { day: number; start: string; end: string }[]) {
        if (!s.start || !s.end) {
          return NextResponse.json({ error: 'Each availability block must have a start and end time.' }, { status: 400 });
        }
        if (s.end === '00:00') {
          return NextResponse.json({ error: 'End time cannot be midnight (00:00). Use 23:59 instead.' }, { status: 400 });
        }
        if (s.end <= s.start) {
          return NextResponse.json({ error: `Availability block has end time (${s.end}) that is not after start time (${s.start}).` }, { status: 400 });
        }
      }

      const rows = (availability as { day: number; start: string; end: string }[]).map(s => ({
        tutor_id:    tutorId,
        day_of_week: s.day,
        start_time:  s.start,
        end_time:    s.end,
        is_active:   true,
      }));
      const { error: availError } = await supabase.from('tutor_availability').insert(rows);
      if (availError) throw availError;
    }

    // ── Create sessions ──────────────────────────────────────────────────────
    type SessionPayload = {
      studentName: string;
      studentEmail: string | null;
      days: number[];
      startTime: string;
      endTime: string;
      timezone: string;
    };

    const validSessions: SessionPayload[] = (Array.isArray(sessions) ? sessions : [])
      .filter((s: SessionPayload) => s.studentName?.trim());

    for (const sess of validSessions) {
      if (sess.days.length === 0) continue;

      // Find or create student
      let studentId: string;

      if (sess.studentEmail) {
        const { data: found } = await supabase
          .from('students')
          .select('id')
          .eq('email', sess.studentEmail.toLowerCase())
          .maybeSingle();

        if (found) {
          studentId = found.id;
        } else {
          const { data: created, error: stuErr } = await supabase
            .from('students')
            .insert({ name: sess.studentName.trim(), email: sess.studentEmail.toLowerCase() })
            .select('id')
            .single();
          if (stuErr || !created) throw stuErr ?? new Error('Failed to create student');
          studentId = created.id;
        }
      } else {
        // No email — create placeholder
        const placeholderEmail = `${sess.studentName.trim().toLowerCase().replace(/\s+/g, '.')}@studycore.import`;
        const { data: ph, error: phErr } = await supabase
          .from('students')
          .insert({ name: sess.studentName.trim(), email: placeholderEmail })
          .select('id')
          .single();
        if (phErr || !ph) throw phErr ?? new Error('Failed to create placeholder student');
        studentId = ph.id;
      }

      // Create one session per selected day
      for (const dbDay of sess.days) {
        const scheduledAt = nextOccurrenceUTC(dbDay, sess.startTime, sess.timezone);
        const durationMinutes = (() => {
          const [sh, sm] = sess.startTime.split(':').map(Number);
          const [eh, em] = sess.endTime.split(':').map(Number);
          return Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
        })();

        await supabase.from('sessions').insert({
          tutor_id:        tutorId,
          student_id:      studentId,
          scheduled_at:    scheduledAt,
          duration_minutes: durationMinutes,
          status:          'scheduled',
          payment_status:  'pending',
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('tutor-form error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
