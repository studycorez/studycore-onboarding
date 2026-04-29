import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { addHours, addMinutes, format } from 'date-fns';
import { sendReminderToStudent, sendReminderToTutor, sendSessionLogRequest, getStudentEmails } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { awardXP, updateStreak, checkSessionCountBadges } from '@/lib/xp';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const ADMIN_EMAIL = 'info@studycore.net';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';

export const dynamic = 'force-dynamic';

function fmt(iso: string) {
  return format(new Date(iso), "EEEE, MMMM d 'at' h:mm a");
}

export async function GET() {
  const now = new Date();
  const sent24h: string[] = [], sent1h: string[] = [], sentLogs: string[] = [], sentMissed: string[] = [];

  // ── 24h reminders ─────────────────────────────────────────────────────────
  const { data: sessions24 } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('status', 'scheduled')
    .eq('reminder_24h_sent', false)
    .gte('scheduled_at', addHours(now, 23).toISOString())
    .lte('scheduled_at', addHours(now, 25).toISOString());

  for (const s of sessions24 ?? []) {
    const { tutor, student } = s as any;
    try {
      const smsText = `Hi ${student.name}, reminder: your StudyCore SAT session with ${tutor.name} is tomorrow at ${fmt(s.scheduled_at)}. Join here: ${s.zoom_join_url ?? APP_URL}`;
      const allEmails24 = await getStudentEmails(student.id, student.email);

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, additionalEmails: allEmails24.slice(1), studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '24h' }),
        sendReminderToTutor({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, zoomHostUrl: s.zoom_host_url, type: '24h' }),
        ...(student.phone ? [sendSMS(student.phone, smsText)] : []),
      ]);
      await supabase.from('sessions').update({ reminder_24h_sent: true }).eq('id', s.id);
      sent24h.push(s.id);
    } catch (err) { console.error('24h failed', s.id, err); }
  }

  // ── 1h reminders ──────────────────────────────────────────────────────────
  const { data: sessions1h } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('status', 'scheduled')
    .eq('reminder_1h_sent', false)
    .gte('scheduled_at', addMinutes(now, 45).toISOString())
    .lte('scheduled_at', addMinutes(now, 75).toISOString());

  for (const s of sessions1h ?? []) {
    const { tutor, student } = s as any;
    try {
      const smsText = `Hi ${student.name}, your StudyCore session with ${tutor.name} starts in 1 hour. Join: ${s.zoom_join_url ?? APP_URL}`;
      const allEmails1h = await getStudentEmails(student.id, student.email);

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, additionalEmails: allEmails1h.slice(1), studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '1h' }),
        sendReminderToTutor({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, zoomHostUrl: s.zoom_host_url, type: '1h' }),
        ...(student.phone ? [sendSMS(student.phone, smsText)] : []),
      ]);
      await supabase.from('sessions').update({ reminder_1h_sent: true }).eq('id', s.id);
      sent1h.push(s.id);
    } catch (err) { console.error('1h failed', s.id, err); }
  }

  // ── Post-session log requests ──────────────────────────────────────────────
  const { data: ended } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('status', 'scheduled')
    .eq('log_request_sent', false)
    .lte('scheduled_at', addMinutes(now, -30).toISOString())
    .gte('scheduled_at', addMinutes(now, -180).toISOString());

  for (const s of ended ?? []) {
    const { tutor, student } = s as any;
    const sessionEnd = addMinutes(new Date(s.scheduled_at), s.duration_minutes || 60);
    if (sessionEnd > now) continue;
    try {
      await sendSessionLogRequest({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, sessionId: s.id, notesToken: s.notes_token, appUrl: APP_URL });
      await supabase.from('sessions').update({ log_request_sent: true }).eq('id', s.id);
      sentLogs.push(s.id);

      // Award XP for completed session (non-blocking)
      awardXP(supabase as any, student.id, 50, 'session_completed', `Completed session on ${format(new Date(s.scheduled_at), 'MMM d')}`)
        .then(() => updateStreak(supabase as any, student.id))
        .then(() => checkSessionCountBadges(supabase as any, student.id))
        .catch(console.error);
    } catch (err) { console.error('log request failed', s.id, err); }
  }

  // ── Possibly missed sessions ───────────────────────────────────────────────
  // Sessions still 'scheduled' but their end time has already passed (within 6h window)
  const { data: maybeMissed } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(*), student:students(*)')
    .eq('status', 'scheduled')
    .eq('missed_alert_sent', false)
    .lte('scheduled_at', addMinutes(now, -30).toISOString())  // started at least 30min ago
    .gte('scheduled_at', addMinutes(now, -360).toISOString()); // within past 6h

  for (const s of maybeMissed ?? []) {
    const { tutor, student } = s as any;
    const sessionEnd = addMinutes(new Date(s.scheduled_at), s.duration_minutes || 60);
    if (sessionEnd > now) continue; // session hasn't ended yet
    try {
      const subject = `Possibly Missed Session — ${tutor?.name ?? 'Unknown'} & ${student?.name ?? 'Unknown'}`;
      const html = `
        <p>A session may have been missed (still "scheduled" after its end time).</p>
        <ul>
          <li><strong>Tutor:</strong> ${tutor?.name ?? '—'} (${tutor?.email ?? '—'})</li>
          <li><strong>Student:</strong> ${student?.name ?? '—'}</li>
          <li><strong>Scheduled:</strong> ${fmt(s.scheduled_at)}</li>
          <li><strong>Duration:</strong> ${s.duration_minutes ?? 60} min</li>
        </ul>
        <p>Please confirm whether this session occurred and update its status.</p>
      `;
      await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, subject, html });
      await supabase.from('sessions').update({ missed_alert_sent: true }).eq('id', s.id);
      sentMissed.push(s.id);
    } catch (err) { console.error('missed alert failed', s.id, err); }
  }

  return NextResponse.json({ ok: true, sent24h: sent24h.length, sent1h: sent1h.length, sentLogRequests: sentLogs.length, sentMissedAlerts: sentMissed.length, timestamp: now.toISOString() });
}
