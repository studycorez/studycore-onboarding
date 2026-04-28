import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addHours, addMinutes, format } from 'date-fns';
import { sendReminderToStudent, sendReminderToTutor, sendSessionLogRequest } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';

export const dynamic = 'force-dynamic';

function fmt(iso: string) {
  return format(new Date(iso), "EEEE, MMMM d 'at' h:mm a");
}

export async function GET() {
  const now = new Date();
  const sent24h: string[] = [], sent1h: string[] = [], sentLogs: string[] = [];

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

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '24h' }),
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

      await Promise.allSettled([
        sendReminderToStudent({ studentEmail: student.email, parentEmail: student.parent_email, studentName: student.name, tutorName: tutor.name, scheduledAt: s.scheduled_at, zoomJoinUrl: s.zoom_join_url, type: '1h' }),
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
      await sendSessionLogRequest({ tutorEmail: tutor.email, tutorName: tutor.name, studentName: student.name, scheduledAt: s.scheduled_at, sessionId: s.id, appUrl: APP_URL });
      await supabase.from('sessions').update({ log_request_sent: true }).eq('id', s.id);
      sentLogs.push(s.id);
    } catch (err) { console.error('log request failed', s.id, err); }
  }

  return NextResponse.json({ ok: true, sent24h: sent24h.length, sent1h: sent1h.length, sentLogRequests: sentLogs.length, timestamp: now.toISOString() });
}
