import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { Resend } from 'resend';
import { postToSlack } from '@/lib/slack';
import { findContactByStudentName, sendGhlSms } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

const ZOOM_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';
const TALLY_URL   = process.env.TALLY_SESSION_REPORT_URL ?? '';

// ─── Zoom signature verification ────────────────────────────────────────────
function verifySignature(rawBody: string, timestamp: string, sig: string): boolean {
  const msg      = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', ZOOM_SECRET).update(msg).digest('hex')}`;
  return expected === sig;
}

// ─── Parse student name from topic — handles formats like:
//   "Alex Thompson's SAT StudyCore Session"
//   "Alex Thompson's StudyCore SAT Session"
//   "Alex Thompson SAT StudyCore Session"
//   "StudyCore - Alex Thompson"
function parseStudentName(topic: string): string | null {
  if (!topic.toLowerCase().replace(/\s/g, '').includes('studycore')) return null;
  // Format: "StudyCore - Name"
  const dashMatch = topic.match(/StudyCore\s*[-–]\s*(.+?)(?:\s+x\s+.+)?$/i);
  if (dashMatch) return dashMatch[1].trim();
  // Format: "Name's ... StudyCore ..." or "Name SAT StudyCore ..."
  const nameMatch = topic.match(/^(.+?)(?:'s\s|\s+SAT\s|\s+StudyCore)/i);
  return nameMatch ? nameMatch[1].trim() : null;
}

// ─── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const timestamp = req.headers.get('x-zm-request-timestamp') ?? '';
  const sig       = req.headers.get('x-zm-signature') ?? '';

  let body: any;
  try { body = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Zoom URL validation handshake (fires once when you register the endpoint)
  if (body.event === 'endpoint.url_validation') {
    const plainToken     = body.payload?.plainToken ?? '';
    const encryptedToken = createHmac('sha256', ZOOM_SECRET).update(plainToken).digest('hex');
    return NextResponse.json({ plainToken, encryptedToken });
  }

  // Reject invalid signatures for all real events
  if (!ZOOM_SECRET || !verifySignature(rawBody, timestamp, sig)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const obj = body.payload?.object ?? {};

  if (body.event === 'meeting.ended')   await handleMeetingEnded(obj);
  if (body.event === 'meeting.started') await handleMeetingStarted(obj);

  return NextResponse.json({ ok: true });
}

// ─── meeting.ended → email tutor with Tally link ────────────────────────────
async function handleMeetingEnded(obj: any) {
  const hostEmail   = obj.host_email ?? '';
  const topic       = obj.topic ?? '';
  const duration    = obj.duration ?? 0;
  const studentName = parseStudentName(topic);

  // Only fire for StudyCore tutoring sessions — ignore interviews, internal meetings, etc.
  if (!studentName) return;

  // Ignore very short meetings — Fathom auto-joins, rescheduled sessions, accidental starts
  // Real sessions are 60–90 min. Anything under 15 min is not a real session.
  if (duration < 15) return;

  if (hostEmail && TALLY_URL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net',
        to:      hostEmail,
        subject: `Session Report — ${studentName ?? 'your session'}`,
        html: `
          <p>Hi,</p>
          <p>Your ${duration}-minute session${studentName ? ` with <strong>${studentName}</strong>` : ''} just ended.</p>
          <p>Please submit your session report — it takes under 3 minutes:</p>
          <p><a href="${TALLY_URL}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Submit Session Report →</a></p>
          <p style="color:#6B7280;font-size:13px;">If Yellow or Red status is flagged, the SSC will follow up within 24 hours.</p>
        `,
      });
    } catch (err) {
      console.error('[zoom] tutor email failed:', err);
    }
  }

  await postToSlack(
    `📋 Session ended: *${studentName ?? topic}* (${duration} min) — report form sent to ${hostEmail || 'unknown tutor'}`
  );
}

// ─── meeting.started → SMS parent + student ──────────────────────────────────
async function handleMeetingStarted(obj: any) {
  const topic       = obj.topic ?? '';
  const studentName = parseStudentName(topic);

  if (!studentName) {
    await postToSlack(`⚠️ Zoom session started with unrecognized topic: "${topic}" — no notifications sent. Rename meetings to: *StudyCore - Student Name*`);
    return;
  }

  const contact = await findContactByStudentName(studentName);

  if (!contact?.contactId) {
    await postToSlack(`⚠️ Session started for *${studentName}* — couldn't find contact in GHL. No SMS sent.`);
    return;
  }

  const smsJobs: Promise<void>[] = [];

  if (contact.parentPhone) {
    smsJobs.push(
      sendGhlSms(
        contact.contactId,
        `Hi ${contact.parentName || 'there'} — ${studentName}'s StudyCore session is starting now. 📚`
      )
    );
  }

  // Student SMS: only if they have a separate phone stored
  if (contact.studentPhone && contact.studentPhone !== contact.parentPhone) {
    smsJobs.push(
      sendGhlSms(
        contact.contactId,
        `Hi ${studentName} — your StudyCore session is starting now. Open your HiScores calendar for the Zoom link. 📚`
      )
    );
  }

  await Promise.allSettled(smsJobs);

  await postToSlack(`✅ Session started: *${studentName}* — ${smsJobs.length} SMS notification(s) sent`);
}
