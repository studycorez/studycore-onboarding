import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state,
  });
}

export async function exchangeGoogleCode(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

async function getAuthedClient(tutorId: string) {
  // Show archived tutors here — fetches by specific ID to read/update Google OAuth tokens; archival does not revoke calendar access
  const { data: tutor } = await supabase
    .from('tutors')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('id', tutorId)
    .single();

  if (!tutor?.google_refresh_token) return null;

  const client = getOAuth2Client();
  client.setCredentials({
    access_token:  tutor.google_access_token,
    refresh_token: tutor.google_refresh_token,
    expiry_date:   tutor.google_token_expires_at
      ? new Date(tutor.google_token_expires_at).getTime()
      : undefined,
  });

  // Persist refreshed tokens if they change
  client.on('tokens', async (tokens) => {
    const update: Record<string, unknown> = {};
    if (tokens.access_token)  update.google_access_token = tokens.access_token;
    if (tokens.expiry_date)   update.google_token_expires_at = new Date(tokens.expiry_date).toISOString();
    if (Object.keys(update).length) {
      await supabase.from('tutors').update(update).eq('id', tutorId);
    }
  });

  return client;
}

export async function syncSessionToGoogleCalendar(sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(id, name, google_calendar_connected, google_access_token, google_refresh_token, google_token_expires_at), student:students(name, email)')
    .eq('id', sessionId)
    .single();

  if (!session) return;
  const tutor = session.tutor as any;
  if (!tutor?.google_calendar_connected) return;

  const client = await getAuthedClient(tutor.id);
  if (!client) return;

  const cal = google.calendar({ version: 'v3', auth: client });
  const startDt = new Date(session.scheduled_at);
  const endDt   = new Date(startDt.getTime() + session.duration_minutes * 60_000);
  const student  = session.student as any;

  const event = {
    summary: `SAT Tutoring — ${student?.name ?? 'Student'}`,
    description: session.zoom_join_url
      ? `Zoom: ${session.zoom_join_url}`
      : undefined,
    start: { dateTime: startDt.toISOString(), timeZone: 'UTC' },
    end:   { dateTime: endDt.toISOString(),   timeZone: 'UTC' },
    attendees: student?.email ? [{ email: student.email }] : undefined,
  };

  const { data: created } = await cal.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  if (created?.id) {
    await supabase.from('sessions').update({ google_event_id: created.id }).eq('id', sessionId);
  }
}

export async function updateGoogleCalendarEvent(sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from('sessions')
    .select('*, tutor:tutors(id, google_calendar_connected), student:students(name, email)')
    .eq('id', sessionId)
    .single();

  if (!session?.google_event_id) return;
  const tutor = session.tutor as any;
  if (!tutor?.google_calendar_connected) return;

  const client = await getAuthedClient(tutor.id);
  if (!client) return;

  const cal = google.calendar({ version: 'v3', auth: client });
  const startDt = new Date(session.scheduled_at);
  const endDt   = new Date(startDt.getTime() + session.duration_minutes * 60_000);
  const student  = session.student as any;

  await cal.events.patch({
    calendarId: 'primary',
    eventId:    session.google_event_id,
    requestBody: {
      summary: `SAT Tutoring — ${student?.name ?? 'Student'}`,
      start: { dateTime: startDt.toISOString(), timeZone: 'UTC' },
      end:   { dateTime: endDt.toISOString(),   timeZone: 'UTC' },
    },
  });
}

export async function deleteGoogleCalendarEvent(sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from('sessions')
    .select('google_event_id, tutor_id, tutor:tutors(id, google_calendar_connected)')
    .eq('id', sessionId)
    .single();

  if (!session?.google_event_id) return;
  const tutor = session.tutor as any;
  if (!tutor?.google_calendar_connected) return;

  const client = await getAuthedClient(tutor.id ?? session.tutor_id);
  if (!client) return;

  const cal = google.calendar({ version: 'v3', auth: client });
  await cal.events.delete({
    calendarId: 'primary',
    eventId:    session.google_event_id,
  });

  await supabase.from('sessions').update({ google_event_id: null }).eq('id', sessionId);
}
