import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { addHours, addMinutes, format } from 'date-fns';
import { sendReminderToStudent, sendReminderToTutor, sendSessionLogRequest, sendReportDueTutor, getStudentEmails, formatDt } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { awardXP, updateStreak, checkSessionCountBadges } from '@/lib/xp';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

/**
 * Returns true if the current time is within quiet hours (10pm–8am) in the given timezone.
 * No emails/SMS should be sent during this window.
 */
function isQuietHours(tz: string): boolean {
  try {
    const now = new Date();
    const hour = parseInt(
      now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
      10,
    );
    // Quiet: 22:00–07:59 (10pm to 8am exclusive)
    return hour >= 22 || hour < 8;
  } catch {
    return false; // unknown timezone → don't suppress
  }
}

const resend = new Resend(process.env.RESEND_API_KEY);
if (!process.env.RESEND_FROM_EMAIL) throw new Error('RESEND_FROM_EMAIL is not set');
const FROM = process.env.RESEND_FROM_EMAIL;
const ADMIN_EMAIL = 'info@studycore.net';
if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export const dynamic = 'force-dynamic';

function fmt(iso: string, tz = 'America/New_York') {
  return formatDt(iso, tz);
}

export async function GET() {
  const supabase = makeSupabase();
  const now = new Date();
  const sent24h: string[] = [], sent1h: string[] = [], sentLogs: string[] = [], sentMissed: string[] = [];
  const xpErrors: { sessionId: string; error: string }[] = [];

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
      const hoursUntil = (new Date(s.scheduled_at).getTime() - now.getTime()) / 3_600_000;
      if (hoursUntil > 25) continue; // guard: only send within next 25 hours
      const tz24 = student.timezone ?? 'America/New_York';
      if (isQuietHours(tz24)) continue;
      const smsTime24 = new Date(s.scheduled_at).toLocaleString('en-US', { timeZone: tz24, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
      const parentGreeting24 = student.parent_name ? student.parent_name.split(' ')[0] : (student.name ? student.name.split(' ')[0] : 'there');
      const parentSmsText24 = `Hi ${parentGreeting24}! Reminder: ${student.name} has a StudyCore session tomorrow at ${smsTime24} with ${tutor.name}. Join link will be sent 1 hour before. Questions? Reply to this message or email support@studycore.net`;
      const tutorSmsText24  = `Hi ${tutor.name.split(' ')[0]}! Reminder: you have a StudyCore session with ${student.name} tomorrow at ${smsTime24}. Zoom: ${s.zoom_join_url ?? '(see email)'}`;
      const allEmails24 = await getStudentEmails(student.id, student.email);

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, additionalEmails: allEmails24.slice(1), studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '24h', timezone: student.timezone ?? undefined }),
        sendReminderToTutor({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, zoomHostUrl: s.zoom_host_url, zoomJoinUrl: s.zoom_join_url, type: '24h', timezone: student.timezone ?? undefined }),
      ]);
      if (student.parent_phone) {
        await sendSMS(student.parent_phone, parentSmsText24).catch(err => console.error('24h parent SMS failed', s.id, err));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (tutor.phone) {
        await sendSMS(tutor.phone, tutorSmsText24).catch(err => console.error('24h tutor SMS failed', s.id, err));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
      const minutesUntil = (new Date(s.scheduled_at).getTime() - now.getTime()) / 60_000;
      if (minutesUntil > 65) continue; // guard: only send within next 65 minutes
      const tz1h = student.timezone ?? 'America/New_York';
      if (isQuietHours(tz1h)) continue;
      const smsTime1h = new Date(s.scheduled_at).toLocaleString('en-US', { timeZone: tz1h, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
      const parentGreeting1h = student.parent_name ? student.parent_name.split(' ')[0] : (student.name ? student.name.split(' ')[0] : 'there');
      const parentSmsText1h = `Hi ${parentGreeting1h}! ${student.name}'s session with ${tutor.name} starts in 1 hour at ${smsTime1h}. Zoom: ${s.zoom_join_url ?? APP_URL} - StudyCore Support: support@studycore.net`;
      const tutorSmsText1h  = `Hi ${tutor.name.split(' ')[0]}! Your session with ${student.name} starts in 1 hour at ${smsTime1h}. Zoom: ${s.zoom_join_url ?? '(see email)'}`;
      const allEmails1h = await getStudentEmails(student.id, student.email);

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, additionalEmails: allEmails1h.slice(1), studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '1h', timezone: student.timezone ?? undefined }),
        sendReminderToTutor({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, zoomHostUrl: s.zoom_host_url, zoomJoinUrl: s.zoom_join_url, type: '1h', timezone: student.timezone ?? undefined }),
      ]);
      if (student.parent_phone) {
        await sendSMS(student.parent_phone, parentSmsText1h).catch(err => console.error('1h parent SMS failed', s.id, err));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (tutor.phone) {
        await sendSMS(tutor.phone, tutorSmsText1h).catch(err => console.error('1h tutor SMS failed', s.id, err));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
      await sendSessionLogRequest({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, sessionId: s.id, notesToken: s.notes_token, appUrl: APP_URL, timezone: student.timezone ?? undefined });
      await supabase.from('sessions').update({ log_request_sent: true }).eq('id', s.id);
      sentLogs.push(s.id);

      // Award XP for completed session (awaited, errors collected but don't abort cron)
      try {
        await awardXP(supabase as any, student.id, 50, 'session_completed',
          `Completed session on ${format(new Date(s.scheduled_at), 'MMM d')}`,
          `session_completed:${s.id}`);
        await updateStreak(supabase as any, student.id);
        await checkSessionCountBadges(supabase as any, student.id);
      } catch (xpErr) {
        console.error('XP/badge award failed for session', s.id, xpErr);
        xpErrors.push({ sessionId: s.id, error: String(xpErr) });
      }
    } catch (err) { console.error('log request failed', s.id, err); }
  }

  // ── Auto-complete past sessions ───────────────────────────────────────────
  // Any session still 'scheduled' whose end time has passed is marked completed.
  // Admin can override to no_show after the fact if needed.
  const autoCompleted: string[] = [];
  const { data: pastScheduled } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, student_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString()); // started at or before now

  for (const s of pastScheduled ?? []) {
    const endMs = new Date(s.scheduled_at).getTime() + (s.duration_minutes ?? 60) * 60_000;
    if (endMs < now.getTime()) {
      autoCompleted.push(s.id);
    }
  }
  if (autoCompleted.length) {
    // For each session, set actual_duration_minutes = duration_minutes when auto-completing
    const affectedStudentIds = new Set<string>();
    for (const s of pastScheduled ?? []) {
      if (!autoCompleted.includes(s.id)) continue;
      await supabase.from('sessions')
        .update({ status: 'completed', actual_duration_minutes: s.duration_minutes ?? 60 })
        .eq('id', s.id);
      affectedStudentIds.add(s.student_id);
    }
    // Recompute used_hours for each affected student (status is now 'completed' above)
    for (const studentId of affectedStudentIds) {
      const { data: completedSessions } = await supabase
        .from('sessions')
        .select('duration_minutes')
        .eq('student_id', studentId)
        .in('status', ['completed', 'no_show_student']);
      const totalMinutes = (completedSessions ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
      const newUsedHours = Math.round((totalMinutes / 60) * 2) / 2;
      await supabase.from('students').update({ used_hours: newUsedHours }).eq('id', studentId);
    }
  }

  // ── Report-due emails ──────────────────────────────────────────────────────
  // Send tutor a "submit your report" email for completed sessions that ended
  // within the last 2 hours and haven't had the email sent yet.
  const sentReportDue: string[] = [];
  const { data: needsReport } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, tutor:tutors(email, name), student:students(name, timezone)')
    .eq('status', 'completed')
    .eq('report_sent_to_tutor', false)
    .gte('scheduled_at', addHours(now, -2).toISOString())
    .lte('scheduled_at', now.toISOString());

  for (const s of needsReport ?? []) {
    const tutor   = (s as any).tutor;
    const student = (s as any).student;
    const endMs   = new Date(s.scheduled_at).getTime() + (s.duration_minutes ?? 60) * 60_000;
    if (endMs > now.getTime()) continue; // hasn't ended yet
    if (!tutor?.email) continue;
    try {
      await sendReportDueTutor({
        tutorEmail: tutor.email,
        tutorName: tutor.name,
        studentName: student?.name ?? 'your student',
        scheduledAt: s.scheduled_at,
        timezone: student?.timezone ?? undefined,
      });
      await supabase.from('sessions').update({ report_sent_to_tutor: true }).eq('id', s.id);
      sentReportDue.push(s.id);
    } catch (err) { console.error('report-due email failed', s.id, err); }
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

  // Don't send missed-session alerts during admin quiet hours (admin is US/Eastern)
  const adminQuiet = isQuietHours('America/New_York');

  for (const s of maybeMissed ?? []) {
    const { tutor, student } = s as any;
    const sessionEnd = addMinutes(new Date(s.scheduled_at), s.duration_minutes || 60);
    if (sessionEnd > now) continue; // session hasn't ended yet in UTC
    if (adminQuiet) continue; // don't wake admin at night
    try {
      const studentTz = student?.timezone ?? 'America/New_York';
      const subject = `Possibly Missed Session — ${tutor?.name ?? 'Unknown'} & ${student?.name ?? 'Unknown'}`;
      const html = `
        <p>A session may have been missed (still "scheduled" after its end time).</p>
        <ul>
          <li><strong>Tutor:</strong> ${tutor?.name ?? '—'} (${tutor?.email ?? '—'})</li>
          <li><strong>Student:</strong> ${student?.name ?? '—'} (${studentTz})</li>
          <li><strong>Scheduled:</strong> ${fmt(s.scheduled_at, studentTz)}</li>
          <li><strong>Duration:</strong> ${s.duration_minutes ?? 60} min</li>
        </ul>
        <p>Please confirm whether this session occurred and update its status.</p>
      `;
      await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, reply_to: 'support@studycore.net', subject, html });
      await supabase.from('sessions').update({ missed_alert_sent: true }).eq('id', s.id);
      sentMissed.push(s.id);
    } catch (err) { console.error('missed alert failed', s.id, err); }
  }

  return NextResponse.json({ ok: true, sent24h: sent24h.length, sent1h: sent1h.length, sentLogRequests: sentLogs.length, autoCompleted: autoCompleted.length, sentReportDue: sentReportDue.length, sentMissedAlerts: sentMissed.length, xpErrors: xpErrors.length, xpErrorDetails: xpErrors, timestamp: now.toISOString() });
}
