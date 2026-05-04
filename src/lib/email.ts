import { Resend } from 'resend';
import { format } from 'date-fns';
import { createClient } from '@supabase/supabase-js';
import { notifyEmailSent } from '@/lib/slack';

export const DEFAULT_TZ = 'America/New_York';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Returns all unique email addresses for a student: primary first, then any additional ones.
export async function getStudentEmails(studentId: string, primaryEmail: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from('student_emails')
    .select('email')
    .eq('student_id', studentId);
  const emails = [primaryEmail];
  for (const row of data ?? []) {
    if (!emails.includes(row.email)) emails.push(row.email);
  }
  return emails;
}

const resend = new Resend(process.env.RESEND_API_KEY);
if (!process.env.RESEND_FROM_EMAIL) throw new Error('RESEND_FROM_EMAIL is not set');
const FROM = process.env.RESEND_FROM_EMAIL;
const BRAND = 'StudyCore';
const NAVY = '#1e2090';

function baseLayout(content: string) {
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
  .header{background:${NAVY};padding:24px 32px;}
  .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-.3px;}
  .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
  .body{padding:32px;}
  .body h2{color:#111827;margin:0 0 16px;font-size:18px;}
  .body p{color:#374151;line-height:1.6;margin:0 0 12px;font-size:15px;}
  .info-box{background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin:20px 0;}
  .info-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;}
  .info-row .label{color:#6b7280;font-weight:500;}
  .info-row .value{color:#111827;font-weight:600;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;margin:8px 4px 8px 0;}
  .btn-secondary{background:#e5e7eb;color:#111827;}
  .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">${content}<div class="footer">&copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved. Questions? Contact us at <a href="mailto:support@studycore.net" style="color:#9ca3af">support@studycore.net</a> or reply to this email.</div></div></body></html>`;
}

/**
 * Format a UTC ISO timestamp in a given IANA timezone with an explicit TZ label.
 * Defaults to America/New_York (EST/EDT) when no timezone is provided.
 */
export function formatDt(iso: string, tz = 'America/New_York'): string {
  const d = new Date(iso);
  const tzLabel = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value ?? '';
  const main = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
    hour:    'numeric',
    minute:  '2-digit',
    hour12:  true,
  }).format(d);
  return tzLabel ? `${main} ${tzLabel}` : main;
}

// ── SESSION CANCELLATION ──────────────────────────────────────────────────

export async function sendCancellationToStudent(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Cancellation</p></div>
    <div class="body">
      <h2>Your session has been cancelled</h2>
      <p>Hi ${params.studentName},</p>
      <p>We wanted to let you know that your upcoming tutoring session has been cancelled.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Date & Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
      </div>
      <p>If you have any questions or would like to reschedule, please reply to this email.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: params.toEmails,
    reply_to: 'support@studycore.net',
    subject: `Session Cancelled: ${formatDt(params.scheduledAt, tz)} with ${params.tutorName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Cancellation notice', to: params.toEmails[0], studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

export async function sendCancellationToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Cancellation</p></div>
    <div class="body">
      <h2>Session cancelled</h2>
      <p>Hi ${params.tutorName},</p>
      <p>The following session has been cancelled by the StudyCore team:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Date & Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
      </div>
      <p>If you have any questions, please reach out to our team.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `Session Cancelled: ${params.studentName} on ${formatDt(params.scheduledAt, tz)}`,
    html,
  });
  notifyEmailSent({ type: '📧 Cancellation notice (tutor)', to: params.tutorEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

// ── BOOKING CONFIRMATION ──────────────────────────────────────────────────

export async function sendBookingConfirmationToStudent(params: {
  studentEmail: string;
  parentEmail?: string | null;
  additionalEmails?: string[];
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  zoomJoinUrl?: string | null;
  targetScore?: number | null;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const to = [params.studentEmail];
  if (params.parentEmail && !to.includes(params.parentEmail)) to.push(params.parentEmail);
  for (const e of params.additionalEmails ?? []) { if (!to.includes(e)) to.push(e); }
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Confirmation</p></div>
    <div class="body">
      <h2>Your session is booked! 🎉</h2>
      <p>Hi ${params.studentName}, your SAT tutoring session has been confirmed. Here are your details:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        ${params.targetScore ? `<div class="info-row"><span class="label">Target Score</span><span class="value">${params.targetScore}</span></div>` : ''}
      </div>
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>` : '<p><em>Zoom link will be added shortly.</em></p>'}
      <p style="margin-top:20px"><strong>To prepare:</strong> Review any practice problems your tutor assigned. Have a pencil, scratch paper, and your practice materials ready.</p>
    </div>`);
  const _r = await resend.emails.send({ from: FROM, to, reply_to: 'support@studycore.net', subject: `Session Confirmed: ${formatDt(params.scheduledAt, tz)} with ${params.tutorName}`, html });
  notifyEmailSent({ type: '📅 Booking confirmation', to: params.studentEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

export async function sendBookingConfirmationToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  durationMinutes: number;
  zoomHostUrl?: string | null;
  zoomJoinUrl?: string | null;
  targetScore?: number | null;
  studentNotes?: string | null;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>New Session Booked</p></div>
    <div class="body">
      <h2>New session scheduled</h2>
      <p>Hi ${params.tutorName}, a new session has been booked for you.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        ${params.targetScore ? `<div class="info-row"><span class="label">Target Score</span><span class="value">${params.targetScore}</span></div>` : ''}
        ${params.studentNotes ? `<div class="info-row"><span class="label">Notes</span><span class="value">${params.studentNotes}</span></div>` : ''}
      </div>
      ${params.zoomHostUrl ? `<a href="${params.zoomHostUrl}" class="btn">Open Zoom Host Link</a>` : ''}
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn btn-secondary">Join Link (share with student)</a>` : ''}
    </div>`);
  const _r = await resend.emails.send({ from: FROM, to: [params.tutorEmail], reply_to: 'support@studycore.net', subject: `New Session: ${params.studentName} on ${formatDt(params.scheduledAt, tz)}`, html });
  notifyEmailSent({ type: '📅 Booking confirmation (tutor)', to: params.tutorEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

// ── REMINDERS ─────────────────────────────────────────────────────────────

export async function sendReminderToStudent(params: {
  studentEmail: string;
  parentEmail?: string | null;
  additionalEmails?: string[];
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  zoomJoinUrl?: string | null;
  type: '24h' | '1h';
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const to = [params.studentEmail];
  if (params.parentEmail && !to.includes(params.parentEmail)) to.push(params.parentEmail);
  for (const e of params.additionalEmails ?? []) { if (!to.includes(e)) to.push(e); }
  const label = params.type === '24h' ? 'tomorrow' : 'in 1 hour';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Reminder</p></div>
    <div class="body">
      <h2>Your session is ${label}</h2>
      <p>Hi ${params.studentName}, just a reminder that your session with ${params.tutorName} is coming up!</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
      </div>
      ${params.zoomJoinUrl
        ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>`
        : params.type === '24h'
          ? `<p style="color:#666;font-size:14px;margin-top:16px;">Your Zoom link will be sent again 1 hour before your session.</p>`
          : `<p style="color:#666;font-size:14px;margin-top:16px;">Please contact your tutor for the Zoom join link.</p>`}
    </div>`);
  const subject = params.type === '24h'
    ? `Reminder: Session tomorrow with ${params.tutorName}`
    : `Starting soon: Session with ${params.tutorName} in 1 hour`;
  const _r = await resend.emails.send({ from: FROM, to, reply_to: 'support@studycore.net', subject, html });
  const reminderLabel = params.type === '24h' ? '⏰ 24hr reminder' : '⏰ 1hr reminder';
  notifyEmailSent({ type: reminderLabel, to: params.studentEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

export async function sendReminderToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  zoomHostUrl?: string | null;
  zoomJoinUrl?: string | null;
  type: '24h' | '1h';
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const label = params.type === '24h' ? 'tomorrow' : 'in 1 hour';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Reminder</p></div>
    <div class="body">
      <h2>Session ${label} — ${params.studentName}</h2>
      <p>Hi ${params.tutorName}, your session with ${params.studentName} is ${label}.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
      </div>
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>` : ''}
      ${params.zoomHostUrl ? `<a href="${params.zoomHostUrl}" class="btn btn-secondary">Open Host Link</a>` : ''}
      ${!params.zoomJoinUrl && !params.zoomHostUrl
        ? `<p style="color:#666;font-size:14px;margin-top:16px;">Zoom links will appear here once the meeting is configured. Check your Zoom account or contact support.</p>`
        : ''}
    </div>`);
  const subject = params.type === '24h'
    ? `Reminder: Session tomorrow with ${params.studentName}`
    : `Starting soon: Session with ${params.studentName} in 1 hour`;
  const _r = await resend.emails.send({ from: FROM, to: [params.tutorEmail], reply_to: 'support@studycore.net', subject, html });
  const reminderLabelT = params.type === '24h' ? '⏰ 24hr reminder (tutor)' : '⏰ 1hr reminder (tutor)';
  notifyEmailSent({ type: reminderLabelT, to: params.tutorEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

// ── POST-SESSION FOLLOW-UP ─────────────────────────────────────────────────

export async function sendPostSessionToStudent(params: {
  studentEmail: string;
  parentEmail?: string | null;
  studentName: string;
  tutorName: string;
}) {
  const to = [params.studentEmail];
  if (params.parentEmail) to.push(params.parentEmail);
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Complete</p></div>
    <div class="body">
      <h2>Great work, ${params.studentName}! 🌟</h2>
      <p>Your session with ${params.tutorName} is complete. Keep up the momentum — consistent practice is the key to SAT success.</p>
      <p><strong>Next steps:</strong> Review your session notes, complete any assigned practice problems, and feel free to schedule your next session!</p>
      <p>Have questions? Reply to this email and our team will get back to you.</p>
    </div>`);
  const _r = await resend.emails.send({ from: FROM, to, reply_to: 'support@studycore.net', subject: `Session Complete — Great work, ${params.studentName}!`, html });
  notifyEmailSent({ type: '📧 Post-session follow-up', to: params.studentEmail, studentName: params.studentName, tutorName: params.tutorName }).catch(() => {});
  return _r;
}

export async function sendPostSessionToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  sessionId: string;
  appUrl: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Complete — Notes Needed</p></div>
    <div class="body">
      <h2>Please submit your session notes</h2>
      <p>Hi ${params.tutorName}, your session with ${params.studentName} has been marked complete. Please log in and add your session notes and feedback.</p>
      <a href="${params.appUrl}/sessions" class="btn">Submit Session Notes</a>
    </div>`);
  const _r = await resend.emails.send({ from: FROM, to: [params.tutorEmail], reply_to: 'support@studycore.net', subject: `Please submit notes: Session with ${params.studentName}`, html });
  notifyEmailSent({ type: '📧 Post-session notes request (tutor)', to: params.tutorEmail, studentName: params.studentName, tutorName: params.tutorName }).catch(() => {});
  return _r;
}

// ── LOW HOURS ALERT ────────────────────────────────────────────────────────

export async function sendLowHoursAlert(params: {
  studentName: string;
  remainingHours: number;
  parentName?: string | null;
  parentEmail?: string | null;
  studentEmail?: string | null;
}) {
  const contactLine = [
    params.parentName,
    params.parentEmail,
    params.studentEmail,
  ].filter(Boolean).join(' — ') || 'No contact on file';

  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Low Hours Alert</p></div>
    <div class="body">
      <h2>⚠️ A student is running low on hours</h2>
      <p>This is an automated alert. The following student has fewer than 5 hours remaining and may need to purchase more sessions.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Hours Remaining</span><span class="value" style="color:#dc2626">${params.remainingHours.toFixed(1)} hrs</span></div>
        <div class="info-row"><span class="label">Parent Contact</span><span class="value">${contactLine}</span></div>
      </div>
      <p>Please reach out to the family to discuss renewing their package.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    reply_to: 'support@studycore.net',
    subject: `Low Hours Alert: ${params.studentName} has ${params.remainingHours.toFixed(1)} hrs remaining`,
    html,
  });
  notifyEmailSent({ type: '📧 Low hours alert', to: 'info@studycore.net', studentName: params.studentName, sessionDate: `${params.remainingHours.toFixed(1)} hrs remaining` }).catch(() => {});
  return _r;
}

// ── CONTRACT ───────────────────────────────────────────────────────────────

export async function sendContractToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  hourlyRate: number;
  contractId: string;
  gamePlanUrl: string | null;
  appUrl: string;
}) {
  const contractUrl = `${params.appUrl}/contracts/${params.contractId}`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Action Required: Contract Signature</p></div>
    <div class="body">
      <h2>Please sign your tutor commitment contract</h2>
      <p>Hi ${params.tutorName}, you've been assigned to tutor <strong>${params.studentName}</strong> through ${BRAND}. Please review and sign your commitment contract before sessions can be scheduled.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Rate</span><span class="value">$${params.hourlyRate}/hour</span></div>
        ${params.gamePlanUrl ? `<div class="info-row"><span class="label">Game Plan</span><span class="value"><a href="${params.gamePlanUrl}" style="color:#1e2090">View PDF</a></span></div>` : ''}
      </div>
      <a href="${contractUrl}" class="btn">Review &amp; Sign Contract</a>
      <p style="margin-top:16px;font-size:13px;color:#6b7280">Or copy this link: ${contractUrl}</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `Action Required: Sign your ${BRAND} contract for ${params.studentName}`,
    html,
  });
  notifyEmailSent({ type: '📋 Contract email', to: params.tutorEmail, tutorName: params.tutorName, studentName: params.studentName }).catch(() => {});
  return _r;
}

export async function sendViolationWarning(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  violationCount: number;
}) {
  const isTermination = params.violationCount >= 3;
  const label = params.violationCount === 1 ? '1st Warning' : params.violationCount === 2 ? 'Final Warning (2nd)' : 'Contract Terminated';
  const consequence = isTermination
    ? 'Your contract has been <strong>terminated effective immediately</strong>. All unpaid session earnings have been forfeited per the terms of your agreement.'
    : params.violationCount === 2
    ? 'This is your <strong>final warning</strong>. One more violation will result in immediate contract termination and forfeiture of all unpaid earnings.'
    : 'Per your contract, pay for this session has been forfeited. A repeat violation will result in a final warning.';

  const html = baseLayout(`
    <div class="header" style="background:${isTermination ? '#991b1b' : '#92400e'}"><h1>${BRAND}</h1><p>${label}</p></div>
    <div class="body">
      <h2>${isTermination ? '⛔ Contract Terminated' : '⚠️ Violation Notice'}</h2>
      <p>Hi ${params.tutorName}, a commitment violation has been recorded on your contract for <strong>${params.studentName}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Violation #</span><span class="value">${params.violationCount}</span></div>
      </div>
      <p>${consequence}</p>
      ${!isTermination ? '<p>Please ensure you provide at least 24 hours notice for any future cancellations.</p>' : ''}
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: isTermination
      ? `Contract Terminated — ${params.studentName}`
      : `${label}: Commitment Violation — ${params.studentName}`,
    html,
  });
  notifyEmailSent({ type: `⚠️ Violation warning (Strike ${params.violationCount})`, to: params.tutorEmail, tutorName: params.tutorName, studentName: params.studentName }).catch(() => {});
  return _r;
}

// ── SESSION REPORT TO PARENT ──────────────────────────────────────────────
export async function sendSessionReport(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  tutorNotes: string;
  homeworkAssigned: string | null;
  sessionRating: number;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const stars = '★'.repeat(params.sessionRating) + '☆'.repeat(5 - params.sessionRating);
  const ratingLabels = ['', 'Needs significant work', 'Below expectations', 'Met expectations', 'Above expectations', 'Excellent'];
  const ratingLabel = ratingLabels[params.sessionRating] ?? '';

  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Report</p></div>
    <div class="body">
      <h2>Session report for ${params.studentName}</h2>
      <p>Here's a summary of today's tutoring session with <strong>${params.tutorName}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Session Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        <div class="info-row"><span class="label">Performance</span><span class="value" style="color:#f59e0b">${stars} <span style="color:#374151">${ratingLabel}</span></span></div>
      </div>
      <p style="font-weight:600;margin-bottom:4px">What was covered:</p>
      <p style="background:#f9fafb;border-left:3px solid ${NAVY};padding:10px 14px;border-radius:0 4px 4px 0;font-size:14px">${params.tutorNotes.replace(/\n/g, '<br>')}</p>
      ${params.homeworkAssigned ? `
      <p style="font-weight:600;margin-bottom:4px;margin-top:16px">Homework assigned:</p>
      <p style="background:#f0fdf4;border-left:3px solid #22c55e;padding:10px 14px;border-radius:0 4px 4px 0;font-size:14px">${params.homeworkAssigned.replace(/\n/g, '<br>')}</p>
      ` : ''}
      <p style="margin-top:20px;color:#6b7280;font-size:13px">Questions? Contact us at support@studycore.net or reply to this email.</p>
    </div>
  `);

  const _r = await resend.emails.send({
    from: FROM,
    to: params.toEmails,
    reply_to: 'support@studycore.net',
    subject: `Session report: ${params.studentName} with ${params.tutorName} — ${format(new Date(params.scheduledAt), 'MMM d')}`,
    html,
  });
  notifyEmailSent({ type: '📝 Session report', to: params.toEmails[0], studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

// —— SESSION LOG REQUEST ————————————————————————————————
export async function sendSessionLogRequest(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  sessionId: string;
  notesToken: string;
  appUrl: string;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const logUrl = `${params.appUrl}/sessions/${params.sessionId}/notes?token=${params.notesToken}`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Notes Request</p></div>
    <div class="body">
      <h2>Session complete — please log your notes 📋</h2>
      <p>Hi ${params.tutorName}, your session with <strong>${params.studentName}</strong> on ${formatDt(params.scheduledAt, tz)} has ended.</p>
      <p>Please take 2 minutes to submit your session notes and homework assigned.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Session Time</span><span class="value">${formatDt(params.scheduledAt, tz)}</span></div>
      </div>
      <a href="${logUrl}" class="btn">Submit Session Notes</a>
    </div>
  `);
  const _r = await resend.emails.send({ from: FROM, to: [params.tutorEmail], reply_to: 'support@studycore.net', subject: `Please log your session notes — ${params.studentName}`, html });
  notifyEmailSent({ type: '📧 Session log request', to: params.tutorEmail, tutorName: params.tutorName, studentName: params.studentName, sessionDate: formatDt(params.scheduledAt, tz) }).catch(() => {});
  return _r;
}

// ── WEEKLY PARENT PROGRESS REPORT ─────────────────────────────────────────

export async function sendWeeklyReport(params: {
  studentName: string;
  parentName: string | null;
  parentEmail: string;
  additionalEmails?: string[];
  weekStart: string;
  weekEnd: string;
  sessions: {
    scheduledAt: string;
    tutorName: string;
    durationMinutes: number;
    wentWell: string | null;
    issues: string | null;
    homeworkAssigned?: string | null;
    notesSubmitted?: boolean;
  }[];
  latestProgress: {
    mathScore: number | null;
    readingScore: number | null;
    writingScore: number | null;
    totalScore: number | null;
    confidenceLevel: number | null;
  } | null;
  purchasedHours: number;
  usedHours: number;
  nextSession: { scheduledAt: string; tutorName: string } | null;
  timezone?: string;
  // ── enhancements ──────────────────────────────────────────────────────────
  streak?: number;
  scoreTrend?: { prevScore: number; currScore: number; delta: number } | null;
  burnRate?: { avgHoursPerWeek: number; weeksRemaining: number | null } | null;
  homeworkItems?: { sessionDate: string; homework: string; submitted: boolean }[];
  aiSummary?: string | null;
  testDateCountdown?: { daysRemaining: number; pctThrough: number; testDate: string } | null;
}) {
  const tz        = params.timezone ?? DEFAULT_TZ;
  const greeting  = params.parentName ? `Hi ${params.parentName},` : 'Hi,';
  const weekLabel = `${format(new Date(params.weekStart), 'MMM d')} – ${format(new Date(params.weekEnd), 'MMM d, yyyy')}`;
  const remaining = params.purchasedHours - params.usedHours;
  const pct       = params.purchasedHours > 0
    ? Math.min(100, Math.round((params.usedHours / params.purchasedHours) * 100))
    : 0;
  const barColor  = pct >= 80 ? '#dc2626' : pct >= 60 ? '#f59e0b' : '#16a34a';

  const H2 = `margin:24px 0 12px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;`;

  // ── 1. Streak badge ──────────────────────────────────────────────────────
  const streakBadge = (params.streak ?? 0) > 0
    ? `<div style="margin-top:8px;"><span style="display:inline-block;background:#fbbf24;color:#78350f;padding:3px 12px;border-radius:99px;font-size:12px;font-weight:700;">🔥 ${params.streak}-week streak</span></div>`
    : '';

  // ── 2. AI personalised summary ───────────────────────────────────────────
  const aiBox = params.aiSummary
    ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0;font-size:15px;color:#92400e;line-height:1.7;">${params.aiSummary}</p>
       </div>`
    : '';

  // ── 3. Sessions table ────────────────────────────────────────────────────
  const sessionRows = params.sessions.length === 0
    ? `<tr><td colspan="5" style="padding:12px 16px;color:#9ca3af;text-align:center;font-size:14px;">No sessions were held this week.</td></tr>`
    : params.sessions.map(s => {
        const hw = s.homeworkAssigned
          ? `<br><span style="color:#6b7280;font-size:12px;">HW: ${s.homeworkAssigned.slice(0, 60)}${s.homeworkAssigned.length > 60 ? '…' : ''}</span>`
          : '';
        const hwStatus = s.homeworkAssigned
          ? (s.notesSubmitted
              ? `<span style="color:#16a34a;font-size:12px;font-weight:600;">✓ submitted</span>`
              : `<span style="color:#9ca3af;font-size:12px;">pending</span>`)
          : `<span style="color:#d1d5db;font-size:12px;">—</span>`;
        return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(s.scheduledAt))}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.tutorName}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.durationMinutes} min</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.wentWell ? s.wentWell.slice(0, 100) + (s.wentWell.length > 100 ? '…' : '') : '—'}${s.issues ? `<br><span style="color:#f59e0b;font-size:13px;">⚠️ ${s.issues.slice(0, 80)}</span>` : ''}${hw}</td>
          <td style="padding:10px 16px;font-size:14px;white-space:nowrap;">${hwStatus}</td>
        </tr>`;
      }).join('');

  // ── 4. Score trend ───────────────────────────────────────────────────────
  const scoreTrendHtml = params.scoreTrend
    ? (() => {
        const { prevScore, currScore, delta } = params.scoreTrend;
        const up    = delta >= 0;
        const arrow = up ? '↑' : '↓';
        const color = up ? '#16a34a' : '#dc2626';
        return `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 20px;margin:16px 0;">
          <p style="margin:0;font-size:16px;color:#166534;">
            <strong>Practice Score:</strong>&nbsp;
            ${prevScore}
            <span style="color:#6b7280;"> → </span>
            <strong style="font-size:18px;">${currScore}</strong>&nbsp;
            <span style="color:${color};font-weight:700;">${arrow} ${up ? '+' : ''}${delta} pts</span>
          </p>
        </div>`;
      })()
    : '';

  // ── 5. Progress scores ───────────────────────────────────────────────────
  let progressHtml = '';
  if (!params.latestProgress || (!params.latestProgress.mathScore && !params.latestProgress.readingScore && !params.latestProgress.writingScore)) {
    progressHtml = `<p style="color:#9ca3af;font-size:14px;margin:0;">No section-score updates this week.</p>`;
  } else {
    const p = params.latestProgress;
    const stars = p.confidenceLevel
      ? '★'.repeat(p.confidenceLevel) + '☆'.repeat(5 - p.confidenceLevel)
      : null;
    progressHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${p.mathScore    ? `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px 0;font-size:14px;color:#6b7280;width:50%">Math</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${p.mathScore}</td></tr>` : ''}
        ${p.readingScore ? `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px 0;font-size:14px;color:#6b7280;">Reading</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${p.readingScore}</td></tr>` : ''}
        ${p.writingScore ? `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px 0;font-size:14px;color:#6b7280;">Writing</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${p.writingScore}</td></tr>` : ''}
        ${p.totalScore   ? `<tr><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">Total</td><td style="padding:8px 0;font-size:16px;font-weight:700;color:${NAVY};">${p.totalScore}</td></tr>` : ''}
      </table>
      ${stars ? `<p style="margin:12px 0 0;font-size:15px;color:#f59e0b;">${stars} <span style="color:#374151;font-size:13px;">Tutor confidence rating</span></p>` : ''}`;
  }

  // ── 6. Hours burn rate ───────────────────────────────────────────────────
  const lowWarning = remaining < 5
    ? `<p style="margin:12px 0 0;color:#dc2626;font-weight:600;font-size:14px;">⚠️ Running low — please purchase additional hours</p>`
    : '';
  const burnRateHtml = params.burnRate
    ? `<p style="font-size:14px;color:#374151;margin:10px 0 0;">
        📈 Averaging <strong>${params.burnRate.avgHoursPerWeek} hrs/week</strong> over the last 3 weeks
        ${params.burnRate.weeksRemaining != null
          ? ` · <strong>~${params.burnRate.weeksRemaining} week${params.burnRate.weeksRemaining !== 1 ? 's' : ''}</strong> of hours remaining at this pace`
          : ''}
       </p>`
    : '';

  // ── 7. Homework section ──────────────────────────────────────────────────
  const hwSection = params.homeworkItems?.length
    ? `<h2 style="${H2}">📝 Homework</h2>
       <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
         ${params.homeworkItems.map(h => `
           <tr style="border-bottom:1px solid #f3f4f6;">
             <td style="padding:8px 0;font-size:14px;color:#374151;width:100px;">${format(new Date(h.sessionDate), 'MMM d')}</td>
             <td style="padding:8px 0;font-size:14px;color:#374151;">${h.homework}</td>
             <td style="padding:8px 0;font-size:13px;white-space:nowrap;text-align:right;">
               ${h.submitted
                 ? `<span style="color:#16a34a;font-weight:600;">✓ submitted</span>`
                 : `<span style="color:#9ca3af;">pending</span>`}
             </td>
           </tr>`).join('')}
       </table>`
    : '';

  // ── 8. Test date countdown ───────────────────────────────────────────────
  const tdc = params.testDateCountdown;
  const testSection = tdc
    ? (() => {
        const tdcBar   = tdc.pctThrough;
        const tdcColor = tdcBar >= 80 ? '#dc2626' : tdcBar >= 50 ? '#f59e0b' : NAVY;
        return `
        <h2 style="${H2}">🎯 Test Date Countdown</h2>
        <p style="font-size:15px;color:#374151;margin:0 0 10px;">
          <strong>${tdc.daysRemaining} day${tdc.daysRemaining !== 1 ? 's' : ''}</strong> until the test
          (${format(new Date(tdc.testDate), 'MMMM d, yyyy')})
        </p>
        <div style="width:100%;height:10px;border-radius:99px;overflow:hidden;background:#e5e7eb;margin:4px 0;">
          <div style="width:${tdcBar}%;height:10px;border-radius:99px;background:${tdcColor};"></div>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin:4px 0 0;">${tdcBar}% through the programme</p>`;
      })()
    : '';

  // ── 9. Next steps ────────────────────────────────────────────────────────
  const nextSessionHtml = params.nextSession
    ? `<p style="margin:0;font-size:15px;color:#374151;">Next session: <strong>${formatDt(params.nextSession.scheduledAt, tz)}</strong> with <strong>${params.nextSession.tutorName}</strong>.</p>`
    : `<p style="margin:0;font-size:15px;color:#9ca3af;">No sessions currently scheduled. Please book the next session.</p>`;

  // ── Assemble ─────────────────────────────────────────────────────────────
  const html = baseLayout(`
    <div class="header">
      <h1>${BRAND}</h1>
      <p>Weekly Progress Report — ${params.studentName}</p>
      ${streakBadge}
    </div>
    <div class="body">
      <p>${greeting}</p>
      <p>Here is <strong>${params.studentName}</strong>'s weekly progress report for <strong>${weekLabel}</strong>.</p>

      ${aiBox}

      <h2 style="${H2}">📅 This Week's Sessions</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Date</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Tutor</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Duration</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Notes</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Homework</th>
          </tr>
        </thead>
        <tbody>${sessionRows}</tbody>
      </table>

      ${scoreTrendHtml}

      <h2 style="${H2}">📊 Progress Update</h2>
      ${progressHtml}

      ${hwSection}

      <h2 style="${H2}">⏱ Hours Summary</h2>
      <div class="info-box">
        <div class="info-row"><span class="label">Purchased</span><span class="value">${params.purchasedHours} hrs</span></div>
        <div class="info-row"><span class="label">Used</span><span class="value">${params.usedHours.toFixed(1)} hrs</span></div>
        <div class="info-row"><span class="label">Remaining</span><span class="value" style="color:${remaining < 5 ? '#dc2626' : '#16a34a'}">${remaining.toFixed(1)} hrs</span></div>
      </div>
      <div style="width:100%;height:10px;border-radius:99px;overflow:hidden;margin:8px 0 4px;">
        <div style="width:${pct}%;height:10px;border-radius:99px;background:${barColor};"></div>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin:0;">${pct}% used</p>
      ${burnRateHtml}
      ${lowWarning}

      ${testSection}

      <h2 style="${H2}">🗓 Next Steps</h2>
      ${nextSessionHtml}
    </div>`);

  const to = [params.parentEmail];
  for (const e of params.additionalEmails ?? []) { if (!to.includes(e)) to.push(e); }
  const _r = await resend.emails.send({
    from: FROM,
    to,
    reply_to: 'support@studycore.net',
    subject: `StudyCore Weekly Report — ${params.studentName} (${weekLabel})`,
    html,
  });
  notifyEmailSent({ type: '📊 Weekly report', to: params.parentEmail, studentName: params.studentName }).catch(() => {});
  return _r;
}

// ── RESCHEDULE NOTIFICATION ────────────────────────────────────────────────

export async function sendRescheduleNotification(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  parentEmail: string | null;
  originalTime: string;
  newTime: string;
  reason: string;
  notes?: string | null;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const to = [params.tutorEmail];
  if (params.parentEmail) to.push(params.parentEmail);
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Rescheduled</p></div>
    <div class="body">
      <h2>Session has been rescheduled</h2>
      <p>A session for <strong>${params.studentName}</strong> has been rescheduled. Please update your calendar.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Original Time</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${formatDt(params.originalTime, tz)}</span></div>
        <div class="info-row"><span class="label">New Time</span><span class="value">${formatDt(params.newTime, tz)}</span></div>
        <div class="info-row"><span class="label">Reason</span><span class="value">${params.reason}</span></div>
        ${params.notes ? `<div class="info-row"><span class="label">Notes</span><span class="value">${params.notes}</span></div>` : ''}
      </div>
      <p style="color:#6b7280;font-size:13px">Your Zoom link remains the same — only the time has changed.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to,
    reply_to: 'support@studycore.net',
    subject: `Session Rescheduled: ${params.studentName} → ${formatDt(params.newTime, tz)}`,
    html,
  });
  notifyEmailSent({ type: '📧 Reschedule notification', to: params.tutorEmail, studentName: params.studentName, tutorName: params.tutorName, sessionDate: formatDt(params.newTime, tz) }).catch(() => {});
  return _r;
}

// ── RESCHEDULE REQUEST (from tutor session log) ────────────────────────────

export async function sendRescheduleRequest(params: {
  tutorName: string;
  studentName: string;
  sessionId: string;
  reason: string;
  preferredTime: string | null;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Reschedule Request</p></div>
    <div class="body">
      <h2>Tutor has requested a reschedule</h2>
      <p><strong>${params.tutorName}</strong> flagged a session with <strong>${params.studentName}</strong> as needing to be rescheduled.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Session ID</span><span class="value" style="font-family:monospace;font-size:13px">${params.sessionId}</span></div>
        <div class="info-row"><span class="label">Reason</span><span class="value">${params.reason}</span></div>
        ${params.preferredTime ? `<div class="info-row"><span class="label">Preferred Time</span><span class="value">${params.preferredTime}</span></div>` : ''}
      </div>
      <p>Please log in to StudyCore to reschedule this session.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    reply_to: 'support@studycore.net',
    subject: `Reschedule Request: ${params.studentName} w/ ${params.tutorName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Reschedule request', to: 'info@studycore.net', studentName: params.studentName, tutorName: params.tutorName }).catch(() => {});
  return _r;
}

// ── TUTOR SWITCH NOTIFICATIONS ─────────────────────────────────────────────

export async function sendTutorSwitchToOldTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  reason: string;
  cancelledSessions: { scheduledAt: string }[];
}) {
  const sessionList = params.cancelledSessions.length
    ? params.cancelledSessions.map(s => `<li style="padding:4px 0;font-size:14px;color:#374151;">${formatDt(s.scheduledAt)}</li>`).join('')
    : '<li style="padding:4px 0;font-size:14px;color:#9ca3af;">No upcoming sessions were scheduled.</li>';

  const html = baseLayout(`
    <div class="header" style="background:#92400e"><h1>${BRAND}</h1><p>Tutor Assignment Update</p></div>
    <div class="body">
      <h2>You have been unassigned from ${params.studentName}</h2>
      <p>Hi ${params.tutorName}, effective immediately you are no longer assigned to tutor <strong>${params.studentName}</strong> through ${BRAND}.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Reason</span><span class="value">${params.reason}</span></div>
      </div>
      <p><strong>The following upcoming sessions have been cancelled:</strong></p>
      <ul style="margin:8px 0 16px;padding-left:20px;">${sessionList}</ul>
      <p>Thank you for your work with this student. If you have any questions please reach out to your admin.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `Assignment Update: You have been unassigned from ${params.studentName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Tutor unassignment', to: params.tutorEmail, tutorName: params.tutorName, studentName: params.studentName }).catch(() => {});
  return _r;
}

export async function sendTutorSwitchToNewTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  studentEmail: string;
  reason: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>New Student Assignment</p></div>
    <div class="body">
      <h2>You've been assigned to ${params.studentName}</h2>
      <p>Hi ${params.tutorName}, you have been assigned as the new tutor for <strong>${params.studentName}</strong>. A contract will be sent to you shortly for signature before sessions can be scheduled.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Student Email</span><span class="value">${params.studentEmail}</span></div>
      </div>
      <p>Please look out for your contract email from ${BRAND}. Once signed, your admin will schedule your first session.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `New Assignment: You've been assigned to ${params.studentName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Tutor assignment', to: params.tutorEmail, tutorName: params.tutorName, studentName: params.studentName }).catch(() => {});
  return _r;
}

export async function sendTutorSwitchToParent(params: {
  parentEmail: string;
  parentName: string | null;
  studentName: string;
  oldTutorName: string;
  newTutorName: string;
}) {
  const greeting = params.parentName ? `Hi ${params.parentName},` : 'Hi,';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Tutor Update</p></div>
    <div class="body">
      <h2>Your tutor assignment has changed</h2>
      <p>${greeting}</p>
      <p>We're writing to let you know that <strong>${params.studentName}</strong>'s tutor assignment has been updated. Rest assured — the quality of instruction and continuity of the SAT prep program remain our top priority.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Previous Tutor</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${params.oldTutorName}</span></div>
        <div class="info-row"><span class="label">New Tutor</span><span class="value">${params.newTutorName}</span></div>
      </div>
      <p>Your admin will be in touch shortly to confirm your next scheduled session. If you have any questions or concerns please reply to this email.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    reply_to: 'support@studycore.net',
    subject: `Tutor Update for ${params.studentName}: Assigned to ${params.newTutorName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Tutor switch (parent)', to: params.parentEmail, studentName: params.studentName, tutorName: params.newTutorName }).catch(() => {});
  return _r;
}

export async function sendTutorSwitchSummary(params: {
  studentName: string;
  oldTutorName: string;
  newTutorName: string;
  reason: string;
  cancelledCount: number;
  notes: string | null;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Tutor Switch Summary</p></div>
    <div class="body">
      <h2>Tutor switch completed</h2>
      <p>A tutor switch has been processed. A new contract still needs to be sent to the new tutor.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Previous Tutor</span><span class="value">${params.oldTutorName}</span></div>
        <div class="info-row"><span class="label">New Tutor</span><span class="value">${params.newTutorName}</span></div>
        <div class="info-row"><span class="label">Reason</span><span class="value">${params.reason}</span></div>
        <div class="info-row"><span class="label">Sessions Cancelled</span><span class="value">${params.cancelledCount}</span></div>
        ${params.notes ? `<div class="info-row"><span class="label">Notes</span><span class="value">${params.notes}</span></div>` : ''}
      </div>
      <p><strong>Next step:</strong> Send a new contract to ${params.newTutorName} for ${params.studentName}. You were redirected to their tutor profile page to do this.</p>
    </div>`);
  const _r = await resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    reply_to: 'support@studycore.net',
    subject: `Tutor Switch: ${params.studentName} → ${params.newTutorName}`,
    html,
  });
  notifyEmailSent({ type: '📧 Tutor switch summary', to: 'info@studycore.net', studentName: params.studentName, tutorName: params.newTutorName }).catch(() => {});
  return _r;
}

// ── PAYROLL SUMMARY ────────────────────────────────────────────────────────

export async function sendPayrollSummary(params: {
  periodStart: string;
  periodEnd: string;
  lines: {
    tutorName: string;
    sessionsCount: number;
    totalMinutes: number;
    hourlyRate: number;
    amountOwed: number;
  }[];
  totalAmount: number;
  appUrl: string;
}) {
  const tableRows = params.lines.map(l => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;font-size:14px">${l.tutorName}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px">${l.sessionsCount}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px">${(l.totalMinutes / 60).toFixed(2)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px">$${l.hourlyRate}/hr</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:14px;font-weight:600;color:#111827">$${l.amountOwed.toFixed(2)}</td>
    </tr>
  `).join('');

  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Weekly Payroll Summary</p></div>
    <div class="body">
      <h2>Payroll: ${params.periodStart} – ${params.periodEnd}</h2>
      <p style="color:#6b7280;font-size:14px">Here is the payroll breakdown for the week ending ${params.periodEnd}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin:20px 0">
        <thead>
          <tr style="background:#f0f4ff">
            <th style="padding:10px 14px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Tutor</th>
            <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Sessions</th>
            <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Hours</th>
            <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Rate</th>
            <th style="padding:10px 14px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Amount</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb">
            <td colspan="4" style="padding:12px 14px;font-weight:700;font-size:14px;color:#111827">Total Payout</td>
            <td style="padding:12px 14px;text-align:right;font-weight:700;font-size:15px;color:${NAVY}">$${params.totalAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <a href="${params.appUrl}/admin/payroll" class="btn">Review Payroll</a>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    reply_to: 'support@studycore.net',
    subject: `Payroll Summary: ${params.periodStart} – ${params.periodEnd} ($${params.totalAmount.toFixed(2)})`,
    html,
  });
  notifyEmailSent({ type: '💵 Payroll summary', to: 'info@studycore.net', sessionDate: `$${params.totalAmount.toFixed(2)} | ${params.periodStart} – ${params.periodEnd}` }).catch(() => {});
  return _r;
}

// ── TUTOR SETUP LINK ────────────────────────────────────────────────────────

export async function sendTutorSetupLink(params: {
  tutorName: string;
  tutorEmail: string;
  token: string;
  appUrl: string;
}) {
  const setupUrl = `${params.appUrl}/tutor-portal/setup?token=${params.token}`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Tutor Portal Invitation</p></div>
    <div class="body">
      <h2>Set up your StudyCore portal</h2>
      <p>Hi ${params.tutorName},</p>
      <p>You've been invited to the StudyCore Tutor Portal. Click the button below to set your password and access your dashboard, students, sessions, and resources.</p>
      <a href="${setupUrl}" class="btn" style="display:inline-block;margin:20px 0">Set Up My Portal</a>
      <div class="info-box">
        <div class="info-row"><span class="label">Link expires</span><span class="value">7 days from now</span></div>
        <div class="info-row"><span class="label">Portal URL</span><span class="value">${params.appUrl}/tutor-portal/login</span></div>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">If you weren't expecting this email, you can ignore it.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `Set up your StudyCore Tutor Portal`,
    html,
  });
  notifyEmailSent({ type: '📧 Tutor setup link', to: params.tutorEmail, tutorName: params.tutorName }).catch(() => {});
  return _r;
}

// ── PARENT ONBOARDING EMAIL ───────────────────────────────────────────────

export async function sendParentOnboardingEmail(params: {
  parentEmail: string;
  parentName: string | null;
  studentName: string;
  magicLink: string;
  tutorName?: string | null;
}) {
  const firstName   = params.parentName ? params.parentName.trim().split(/\s+/)[0] : null;
  const studentFirst = params.studentName.trim().split(/\s+/)[0];
  const year        = new Date().getFullYear();

  const tutorCard = `
  <div style="padding: 0 40px 32px;">
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 24px;">
      <div style="font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Meet ${studentFirst}'s Tutor</div>
      <div style="font-size: 14px; color: #4b5563; line-height: 1.5;">Your child has been matched with a dedicated SAT tutor who will guide them every step of the way. Log into the parent portal to view their tutor's profile, ratings, and background.</div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to StudyCore</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">

<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

  <!-- Header -->
  <div style="background:#1e2a5e;padding:32px 40px;text-align:center;">
    <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">StudyCore</div>
    <div style="font-size:13px;color:#a5b4fc;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">SAT &amp; ACT Tutoring</div>
  </div>

  <!-- Hero -->
  <div style="padding:48px 40px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:12px;">🎉</div>
    <h1 style="font-size:26px;font-weight:700;color:#1e2a5e;margin:0 0 16px;line-height:1.25;">Welcome to StudyCore${firstName ? `, ${firstName}` : ''}!</h1>
    <p style="font-size:16px;color:#4b5563;line-height:1.6;margin:0 0 32px;"><strong style="color:#111827;">${params.studentName}</strong>'s tutoring sessions are all set up. Your parent portal gives you real-time visibility into every session, score, and milestone.</p>
    <a href="${params.magicLink}" style="display:inline-block;background:#1e2a5e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;">Access Your Parent Portal &rarr;</a>
    <p style="font-size:12px;color:#9ca3af;margin-top:12px;">This link expires in 7 days. You can always request a new one.</p>
  </div>

  <!-- Divider -->
  <div style="height:1px;background:#e5e7eb;margin:0 40px;"></div>

  <!-- Features -->
  <div style="padding:40px;background:#f9fafb;">
    <h2 style="font-size:14px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;text-align:center;margin:0 0 28px;">What you can do in the portal</h2>

    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <div style="font-size:24px;margin-bottom:8px;">📊</div>
      <div style="font-size:16px;font-weight:700;color:#1e2a5e;margin-bottom:6px;">Track Score Progress</div>
      <div style="font-size:14px;color:#6b7280;line-height:1.5;">See practice test scores over time with a projected score chart and goal line.</div>
    </div>

    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <div style="font-size:24px;margin-bottom:8px;">📝</div>
      <div style="font-size:16px;font-weight:700;color:#1e2a5e;margin-bottom:6px;">Read Session Notes</div>
      <div style="font-size:14px;color:#6b7280;line-height:1.5;">After every session, get a detailed summary of what was covered, homework assigned, and tutor observations.</div>
    </div>

    <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
      <div style="font-size:24px;margin-bottom:8px;">📅</div>
      <div style="font-size:16px;font-weight:700;color:#1e2a5e;margin-bottom:6px;">View Upcoming Sessions</div>
      <div style="font-size:14px;color:#6b7280;line-height:1.5;">See ${studentFirst}'s full schedule and join Zoom sessions directly from the portal.</div>
    </div>
  </div>

  <!-- Tutor card (conditional) -->
  ${tutorCard}

  <!-- Second CTA -->
  <div style="padding:0 40px 48px;text-align:center;">
    <a href="${params.magicLink}" style="display:inline-block;background:#1e2a5e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;">Get Started &rarr;</a>
  </div>

  <!-- Footer -->
  <div style="background:#f3f4f6;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
    <div style="font-size:13px;color:#9ca3af;">&copy; ${year} StudyCore &middot; Questions? Contact us at <a href="mailto:support@studycore.net" style="color:#1e2a5e;text-decoration:none;">support@studycore.net</a></div>
    <div style="font-size:12px;color:#d1d5db;margin-top:4px;">Sent from noreply@studycore.net</div>
  </div>

</div>

</body>
</html>`;

  const _r = await resend.emails.send({
    from: FROM,
    to:   [params.parentEmail],
    reply_to: 'support@studycore.net',
    subject: `Welcome to StudyCore — ${params.studentName}'s Parent Portal is Ready`,
    html,
  });
  notifyEmailSent({ type: '🎉 Parent onboarding', to: params.parentEmail, studentName: params.studentName }).catch(() => {});
  return _r;
}

// ── PARENT MAGIC LINK ─────────────────────────────────────────────────────

export async function sendParentMagicLink(params: {
  parentEmail: string;
  magicLink: string;
  studentNames: string[];
}) {
  const names = params.studentNames.length > 0
    ? ` for <strong>${params.studentNames.join(', ')}</strong>`
    : '';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Parent Portal</p></div>
    <div class="body">
      <h2>Your login link is ready</h2>
      <p>Click the button below to access the Parent Portal${names}. No password required — this link will sign you in automatically.</p>
      <a href="${params.magicLink}" class="btn" style="display:inline-block;margin:20px 0">Access Parent Portal</a>
      <div class="info-box">
        <div class="info-row"><span class="label">Link expires</span><span class="value">7 days from now</span></div>
        <div class="info-row"><span class="label">Link is single-device</span><span class="value">Works on any browser</span></div>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">If you didn't request this email, you can safely ignore it.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    reply_to: 'support@studycore.net',
    subject: 'Your StudyCore Parent Portal Login Link',
    html,
  });
  notifyEmailSent({ type: '📧 Parent magic link', to: params.parentEmail }).catch(() => {});
  return _r;
}

// ── STUDENT PORTAL SETUP EMAIL ────────────────────────────────────────────────

export async function sendStudentSetupLink(params: {
  studentName: string;
  studentEmail: string;
  token: string;
  appUrl: string;
}) {
  const setupUrl = `${params.appUrl}/student-portal/setup?token=${params.token}`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Student Portal Invitation</p></div>
    <div class="body">
      <h2>Welcome to StudyCore! 🚀</h2>
      <p>Hi ${params.studentName},</p>
      <p>Your tutor has set up a StudyCore Student Portal account for you. Click below to set your password and access your personal dashboard with XP, badges, leaderboard rankings, and more.</p>
      <a href="${setupUrl}" class="btn" style="display:inline-block;margin:20px 0">Set Up My Portal</a>
      <div class="info-box">
        <div class="info-row"><span class="label">Link expires</span><span class="value">48 hours from now</span></div>
        <div class="info-row"><span class="label">Portal URL</span><span class="value">${params.appUrl}/student-portal/login</span></div>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">If you weren't expecting this email, you can ignore it.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.studentEmail],
    reply_to: 'support@studycore.net',
    subject: 'Set up your StudyCore Student Portal',
    html,
  });
  notifyEmailSent({ type: '📧 Student setup link', to: params.studentEmail, studentName: params.studentName }).catch(() => {});
  return _r;
}

// ── PAYROLL PAYMENT NOTIFICATION ─────────────────────────────────────────────

export async function sendPaymentNotification(params: {
  tutorEmail: string;
  tutorName: string;
  periodStart: string;
  periodEnd: string;
  sessionsCount: number;
  totalHours: number;
  amountOwed: number;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Payment Notification</p></div>
    <div class="body">
      <h2>You've been paid! 🎉</h2>
      <p>Hi ${params.tutorName},</p>
      <p>Your payment for the following period has been processed:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Period</span><span class="value">${params.periodStart} – ${params.periodEnd}</span></div>
        <div class="info-row"><span class="label">Sessions</span><span class="value">${params.sessionsCount}</span></div>
        <div class="info-row"><span class="label">Total Hours</span><span class="value">${params.totalHours.toFixed(2)}</span></div>
        <div class="info-row"><span class="label">Amount</span><span class="value" style="color:#059669;font-size:18px">$${params.amountOwed.toFixed(2)}</span></div>
      </div>
      <p style="font-size:13px;color:#9ca3af">If you have questions about your payment, please reply to this email.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    reply_to: 'support@studycore.net',
    subject: `Payment received — $${params.amountOwed.toFixed(2)} for ${params.periodStart} to ${params.periodEnd}`,
    html,
  });
  notifyEmailSent({ type: '💵 Payroll confirmation', to: params.tutorEmail, tutorName: params.tutorName, sessionDate: `$${params.amountOwed.toFixed(2)}` }).catch(() => {});
  return _r;
}

// ── NPS SURVEY EMAIL ─────────────────────────────────────────────────────────

export async function sendNPSSurvey(params: {
  recipientEmail: string;
  recipientName: string;
  surveyUrl: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Quick Feedback Request</p></div>
    <div class="body">
      <h2>How are we doing? 🌟</h2>
      <p>Hi ${params.recipientName},</p>
      <p>You've completed several sessions with StudyCore — congrats on the progress! We'd love to hear how things are going.</p>
      <p>It takes just 30 seconds:</p>
      <a href="${params.surveyUrl}" class="btn" style="display:inline-block;margin:20px 0">Share My Feedback</a>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">This survey link is unique to you. You can only respond once. If you weren't expecting this email, you can ignore it.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.recipientEmail],
    reply_to: 'support@studycore.net',
    subject: 'Quick question — how are we doing?',
    html,
  });
  notifyEmailSent({ type: '⭐ NPS survey', to: params.recipientEmail, studentName: params.recipientName }).catch(() => {});
  return _r;
}

// ── MID-WEEK CHECK-IN ────────────────────────────────────────────────────────

export async function sendMidweekCheckin(params: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  tutorName: string;
  nextSessionAt: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Mid-Week Check-In</p></div>
    <div class="body">
      <h2>How's ${params.studentName} doing?</h2>
      <p>Hi ${params.parentName},</p>
      <p>We hope the week is going well! Just wanted to check in on ${params.studentName}'s progress and remind you that an upcoming session with ${params.tutorName} is on the way.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Next Session</span><span class="value">${formatDt(params.nextSessionAt)}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
      </div>
      <p>If you have any questions or feedback, feel free to reply to this email — we're always here to help.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    reply_to: 'support@studycore.net',
    subject: `Mid-week check-in: ${params.studentName}'s upcoming session`,
    html,
  });
  notifyEmailSent({ type: '📆 Mid-week check-in', to: params.parentEmail, studentName: params.studentName, tutorName: params.tutorName }).catch(() => {});
  return _r;
}

// ── RE-ENGAGEMENT EMAIL ──────────────────────────────────────────────────────

export async function sendReengagementEmail(params: {
  parentEmail: string;
  parentName: string;
  studentName: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>We Miss You!</p></div>
    <div class="body">
      <h2>It's been a while, ${params.parentName}</h2>
      <p>We noticed that ${params.studentName} hasn't had a session scheduled recently. We'd love to get back on track!</p>
      <p>Reply to this email or reach out to us to schedule your next session. Let's keep the momentum going.</p>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">You're receiving this because ${params.studentName} hasn't had a session in the last 14 days.</p>
    </div>`);

  const _r = await resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    reply_to: 'support@studycore.net',
    subject: `We miss you — let's book ${params.studentName}'s next session`,
    html,
  });
  notifyEmailSent({ type: '🔄 Re-engagement', to: params.parentEmail, studentName: params.studentName }).catch(() => {});
  return _r;
}

// ── RESCHEDULE REQUEST EMAILS ──────────────────────────────────────────────

export async function sendRescheduleRequestToAdmin(params: {
  studentName: string;
  tutorName: string;
  requestedBy: 'parent' | 'student';
  originalTime: string;
  requestedTime: string;
  note?: string | null;
  requestId: string;
  appUrl: string;
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Reschedule Request</p></div>
    <div class="body">
      <h2>New Reschedule Request</h2>
      <p>A ${params.requestedBy} has requested to reschedule a session.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Requested By</span><span class="value">${params.requestedBy}</span></div>
        <div class="info-row"><span class="label">Original Time</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${formatDt(params.originalTime)}</span></div>
        <div class="info-row"><span class="label">Requested Time</span><span class="value">${formatDt(params.requestedTime)}</span></div>
        ${params.note ? `<div class="info-row"><span class="label">Note</span><span class="value">${params.note}</span></div>` : ''}
      </div>
      <a href="${params.appUrl}/admin/reschedule-requests" class="btn">Review Request</a>
    </div>`);
  return resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    reply_to: 'support@studycore.net',
    subject: `Reschedule Request: ${params.studentName} → ${formatDt(params.requestedTime)}`,
    html,
  });
}

export async function sendRescheduleRequestConfirmation(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  originalTime: string;
  requestedTime: string;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Request Received</p></div>
    <div class="body">
      <h2>Your reschedule request has been submitted</h2>
      <p>We've received your request to reschedule ${params.studentName}'s session. We'll confirm within 24 hours.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Current Time</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${formatDt(params.originalTime, tz)}</span></div>
        <div class="info-row"><span class="label">Requested Time</span><span class="value">${formatDt(params.requestedTime, tz)}</span></div>
      </div>
      <p style="color:#6b7280;font-size:13px">If you need to make changes, please reply to this email or contact support@studycore.net.</p>
    </div>`);
  return resend.emails.send({
    from: FROM,
    to: params.toEmails,
    reply_to: 'support@studycore.net',
    subject: `Reschedule Request Received — we'll confirm within 24 hours`,
    html,
  });
}

export async function sendRescheduleApproved(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  originalTime: string;
  newTime: string;
  zoomJoinUrl?: string | null;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Reschedule Confirmed</p></div>
    <div class="body">
      <h2>Your session has been rescheduled ✓</h2>
      <p>Your reschedule request has been approved. Here are the updated session details.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Original Time</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${formatDt(params.originalTime, tz)}</span></div>
        <div class="info-row"><span class="label">New Time</span><span class="value">${formatDt(params.newTime, tz)}</span></div>
      </div>
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>` : ''}
      <p style="color:#6b7280;font-size:13px">Your Zoom link remains the same — only the time has changed.</p>
    </div>`);
  return resend.emails.send({
    from: FROM,
    to: params.toEmails,
    reply_to: 'support@studycore.net',
    subject: `Session Rescheduled ✓ — ${params.studentName} on ${formatDt(params.newTime, tz)}`,
    html,
  });
}

export async function sendRescheduleDenied(params: {
  toEmails: string[];
  studentName: string;
  tutorName: string;
  originalTime: string;
  requestedTime: string;
  timezone?: string;
}) {
  const tz = params.timezone ?? DEFAULT_TZ;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Reschedule Update</p></div>
    <div class="body">
      <h2>Reschedule request could not be fulfilled</h2>
      <p>Unfortunately, we were unable to approve the reschedule request for ${params.studentName}'s session at ${formatDt(params.requestedTime, tz)}.</p>
      <p>The original session at <strong>${formatDt(params.originalTime, tz)}</strong> with ${params.tutorName} remains scheduled.</p>
      <p>Please contact us directly at <a href="mailto:support@studycore.net">support@studycore.net</a> and we'll work with you to find a suitable time.</p>
    </div>`);
  return resend.emails.send({
    from: FROM,
    to: params.toEmails,
    reply_to: 'support@studycore.net',
    subject: `Reschedule Request Update — ${params.studentName}`,
    html,
  });
}

export async function sendParentMessageForward(params: {
  parentEmail: string;
  studentName: string;
  body: string;
}) {
  const html = `<p><strong>From:</strong> ${params.parentEmail}</p>
<p><strong>Student:</strong> ${params.studentName}</p>
<hr>
<p>${params.body.replace(/\n/g, '<br>')}</p>`;
  return resend.emails.send({
    from: FROM!,
    to: 'support@studycore.net',
    reply_to: params.parentEmail,
    subject: `New Parent Message — ${params.studentName}`,
    html,
  });
}

export async function sendStudentOnboardingEmail(params: {
  studentName: string;
  studentEmail: string;
  tempPassword: string;
  appUrl: string;
}) {
  const loginUrl = `${params.appUrl}/student-portal/login`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Welcome to StudyCore!</p></div>
    <div class="body">
      <h2>Hi ${params.studentName}, welcome aboard! 🎉</h2>
      <p>Your StudyCore student account is ready. Log in to track your sessions, complete homework, climb the leaderboard, and earn XP as you reach your goals.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Email</span><span class="value">${params.studentEmail}</span></div>
        <div class="info-row"><span class="label">Temporary Password</span><span class="value">${params.tempPassword}</span></div>
        <div class="info-row"><span class="label">Login URL</span><span class="value">${loginUrl}</span></div>
      </div>
      <a href="${loginUrl}" class="btn">Log In Now</a>
      <h3 style="margin-top:28px;margin-bottom:8px;font-size:15px;font-weight:600;color:#1f2937">What you can do in the portal:</h3>
      <ul style="padding-left:20px;margin:0;color:#374151;font-size:14px;line-height:1.8">
        <li><strong>📅 Session Schedule</strong> — View all upcoming sessions with your tutor</li>
        <li><strong>📚 Homework Tracker</strong> — See assignments and mark them complete</li>
        <li><strong>🏆 Leaderboard</strong> — Compete with other students for the top spot</li>
        <li><strong>⚡ XP &amp; Levels</strong> — Earn XP for sessions, homework, and progress</li>
        <li><strong>📈 Score Progress</strong> — Track your improvement toward your target score</li>
      </ul>
      <p style="margin-top:20px;color:#6b7280;font-size:13px">We recommend changing your password after your first login. Questions? Reply to this email or text us at +1 (925) 481-5501.</p>
    </div>`);
  return resend.emails.send({
    from: FROM!,
    to: [params.studentEmail],
    reply_to: 'support@studycore.net',
    subject: `Welcome to StudyCore, ${params.studentName}! Your account is ready 🎉`,
    html,
  });
}
