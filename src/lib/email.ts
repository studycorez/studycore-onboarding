import { Resend } from 'resend';
import { format } from 'date-fns';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
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
</style></head><body><div class="wrap">${content}<div class="footer">&copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved.</div></div></body></html>`;
}

function formatDt(iso: string) {
  return format(new Date(iso), "EEEE, MMMM d, yyyy 'at' h:mm a");
}

// ── BOOKING CONFIRMATION ──────────────────────────────────────────────────

export async function sendBookingConfirmationToStudent(params: {
  studentEmail: string;
  parentEmail?: string | null;
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  durationMinutes: number;
  zoomJoinUrl?: string | null;
  targetScore?: number | null;
}) {
  const to = [params.studentEmail];
  if (params.parentEmail) to.push(params.parentEmail);
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Confirmation</p></div>
    <div class="body">
      <h2>Your session is booked! 🎉</h2>
      <p>Hi ${params.studentName}, your SAT tutoring session has been confirmed. Here are your details:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        ${params.targetScore ? `<div class="info-row"><span class="label">Target Score</span><span class="value">${params.targetScore}</span></div>` : ''}
      </div>
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>` : '<p><em>Zoom link will be added shortly.</em></p>'}
      <p style="margin-top:20px"><strong>To prepare:</strong> Review any practice problems your tutor assigned. Have a pencil, scratch paper, and your practice materials ready.</p>
    </div>`);
  return resend.emails.send({ from: FROM, to, subject: `Session Confirmed: ${formatDt(params.scheduledAt)} with ${params.tutorName}`, html });
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
}) {
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>New Session Booked</p></div>
    <div class="body">
      <h2>New session scheduled</h2>
      <p>Hi ${params.tutorName}, a new session has been booked for you.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${params.durationMinutes} minutes</span></div>
        ${params.targetScore ? `<div class="info-row"><span class="label">Target Score</span><span class="value">${params.targetScore}</span></div>` : ''}
        ${params.studentNotes ? `<div class="info-row"><span class="label">Notes</span><span class="value">${params.studentNotes}</span></div>` : ''}
      </div>
      ${params.zoomHostUrl ? `<a href="${params.zoomHostUrl}" class="btn">Open Zoom Host Link</a>` : ''}
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn btn-secondary">Join Link (share with student)</a>` : ''}
    </div>`);
  return resend.emails.send({ from: FROM, to: [params.tutorEmail], subject: `New Session: ${params.studentName} on ${formatDt(params.scheduledAt)}`, html });
}

// ── REMINDERS ─────────────────────────────────────────────────────────────

export async function sendReminderToStudent(params: {
  studentEmail: string;
  parentEmail?: string | null;
  studentName: string;
  tutorName: string;
  scheduledAt: string;
  zoomJoinUrl?: string | null;
  type: '24h' | '1h';
}) {
  const to = [params.studentEmail];
  if (params.parentEmail) to.push(params.parentEmail);
  const label = params.type === '24h' ? 'tomorrow' : 'in 1 hour';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Reminder</p></div>
    <div class="body">
      <h2>Your session is ${label}</h2>
      <p>Hi ${params.studentName}, just a reminder that your session with ${params.tutorName} is coming up!</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
      </div>
      ${params.zoomJoinUrl ? `<a href="${params.zoomJoinUrl}" class="btn">Join Zoom Meeting</a>` : ''}
    </div>`);
  const subject = params.type === '24h'
    ? `Reminder: Session tomorrow with ${params.tutorName}`
    : `Starting soon: Session with ${params.tutorName} in 1 hour`;
  return resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendReminderToTutor(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  zoomHostUrl?: string | null;
  type: '24h' | '1h';
}) {
  const label = params.type === '24h' ? 'tomorrow' : 'in 1 hour';
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Reminder</p></div>
    <div class="body">
      <h2>Session ${label} — ${params.studentName}</h2>
      <p>Hi ${params.tutorName}, your session with ${params.studentName} is ${label}.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
      </div>
      ${params.zoomHostUrl ? `<a href="${params.zoomHostUrl}" class="btn">Open Zoom Host Link</a>` : ''}
    </div>`);
  const subject = params.type === '24h'
    ? `Reminder: Session tomorrow with ${params.studentName}`
    : `Starting soon: Session with ${params.studentName} in 1 hour`;
  return resend.emails.send({ from: FROM, to: [params.tutorEmail], subject, html });
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
  return resend.emails.send({ from: FROM, to, subject: `Session Complete — Great work, ${params.studentName}!`, html });
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
  return resend.emails.send({ from: FROM, to: [params.tutorEmail], subject: `Please submit notes: Session with ${params.studentName}`, html });
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

  return resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    subject: `Low Hours Alert: ${params.studentName} has ${params.remainingHours.toFixed(1)} hrs remaining`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    subject: `Action Required: Sign your ${BRAND} contract for ${params.studentName}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    subject: isTermination
      ? `Contract Terminated — ${params.studentName}`
      : `${label}: Commitment Violation — ${params.studentName}`,
    html,
  });
}

// —— SESSION LOG REQUEST ————————————————————————————————
export async function sendSessionLogRequest(params: {
  tutorEmail: string;
  tutorName: string;
  studentName: string;
  scheduledAt: string;
  sessionId: string;
  appUrl: string;
}) {
  const logUrl = `${params.appUrl}/session-log/${params.sessionId}`;
  const html = baseLayout(`
    <div class="header"><h1>${BRAND}</h1><p>Session Log Request</p></div>
    <div class="body">
      <h2>Session complete — please submit your log 📋</h2>
      <p>Hi ${params.tutorName}, your session with <strong>${params.studentName}</strong> on ${formatDt(params.scheduledAt)} has ended.</p>
      <p>Please take 2 minutes to fill out your session log.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        <div class="info-row"><span class="label">Session Time</span><span class="value">${formatDt(params.scheduledAt)}</span></div>
      </div>
      <a href="${logUrl}" class="btn">Submit Session Log</a>
    </div>
  `);
  return resend.emails.send({ from: FROM, to: [params.tutorEmail], subject: `Session Log: ${params.studentName} — please submit notes`, html });
}

// ── WEEKLY PARENT PROGRESS REPORT ─────────────────────────────────────────

export async function sendWeeklyReport(params: {
  studentName: string;
  parentName: string | null;
  parentEmail: string;
  weekStart: string;  // ISO date string
  weekEnd: string;    // ISO date string
  sessions: {
    scheduledAt: string;
    tutorName: string;
    durationMinutes: number;
    wentWell: string | null;
    issues: string | null;
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
}) {
  const greeting = params.parentName ? `Hi ${params.parentName},` : 'Hi,';
  const weekLabel = `${format(new Date(params.weekStart), 'MMM d')} – ${format(new Date(params.weekEnd), 'MMM d, yyyy')}`;
  const remaining = params.purchasedHours - params.usedHours;
  const pct = params.purchasedHours > 0 ? Math.min(100, Math.round((params.usedHours / params.purchasedHours) * 100)) : 0;
  const barColor = pct >= 80 ? '#dc2626' : pct >= 60 ? '#f59e0b' : '#16a34a';

  // Section 1 — Sessions
  const sessionRows = params.sessions.length === 0
    ? `<tr><td colspan="4" style="padding:12px 16px;color:#9ca3af;text-align:center;font-size:14px;">No sessions were held this week.</td></tr>`
    : params.sessions.map(s => `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${format(new Date(s.scheduledAt), 'EEE, MMM d')}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.tutorName}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.durationMinutes} min</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;">${s.wentWell ? s.wentWell.slice(0, 120) + (s.wentWell.length > 120 ? '…' : '') : '—'}${s.issues ? `<br><span style="color:#f59e0b;font-size:13px;">⚠️ ${s.issues.slice(0, 80)}</span>` : ''}</td>
        </tr>`).join('');

  // Section 2 — Progress
  let progressHtml = '';
  if (!params.latestProgress || (!params.latestProgress.mathScore && !params.latestProgress.readingScore && !params.latestProgress.writingScore)) {
    progressHtml = `<p style="color:#9ca3af;font-size:14px;margin:0;">No score updates this week.</p>`;
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
        ${p.totalScore   ? `<tr><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">Total / Composite</td><td style="padding:8px 0;font-size:16px;font-weight:700;color:${NAVY};">${p.totalScore}</td></tr>` : ''}
      </table>
      ${stars ? `<p style="margin:12px 0 0;font-size:15px;color:#f59e0b;">${stars} <span style="color:#374151;font-size:13px;">Tutor confidence rating</span></p>` : ''}`;
  }

  // Section 3 — Hours bar (inline CSS only, no background shorthand)
  const lowWarning = remaining < 5
    ? `<p style="margin:12px 0 0;color:#dc2626;font-weight:600;font-size:14px;">⚠️ Running low — please purchase additional hours</p>`
    : '';

  // Section 4 — Next session
  const nextSessionHtml = params.nextSession
    ? `<p style="margin:0;font-size:15px;color:#374151;">Your next session is scheduled for <strong>${format(new Date(params.nextSession.scheduledAt), "EEEE, MMMM d 'at' h:mm a")}</strong> with <strong>${params.nextSession.tutorName}</strong>.</p>`
    : `<p style="margin:0;font-size:15px;color:#9ca3af;">No sessions currently scheduled. Please book your next session.</p>`;

  const html = baseLayout(`
    <div class="header">
      <h1>${BRAND}</h1>
      <p>Weekly Progress Report — ${params.studentName}</p>
    </div>
    <div class="body">
      <p>${greeting}</p>
      <p>Here is <strong>${params.studentName}</strong>'s weekly progress report for <strong>${weekLabel}</strong>.</p>

      <h2 style="margin:24px 0 12px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">📅 This Week's Sessions</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Date</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Tutor</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Duration</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Covered</th>
          </tr>
        </thead>
        <tbody>${sessionRows}</tbody>
      </table>

      <h2 style="margin:24px 0 12px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">📊 Progress Update</h2>
      ${progressHtml}

      <h2 style="margin:24px 0 12px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">⏱ Hours Summary</h2>
      <div class="info-box">
        <div class="info-row"><span class="label">Purchased</span><span class="value">${params.purchasedHours} hrs</span></div>
        <div class="info-row"><span class="label">Used</span><span class="value">${params.usedHours.toFixed(1)} hrs</span></div>
        <div class="info-row"><span class="label">Remaining</span><span class="value" style="color:${remaining < 5 ? '#dc2626' : '#16a34a'}">${remaining.toFixed(1)} hrs</span></div>
      </div>
      <div style="width:100%;height:10px;border-radius:99px;overflow:hidden;margin:8px 0 4px;">
        <div style="width:${pct}%;height:10px;border-radius:99px;background:${barColor};"></div>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin:0;">${pct}% used</p>
      ${lowWarning}

      <h2 style="margin:24px 0 12px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">🗓 Next Steps</h2>
      ${nextSessionHtml}
    </div>`);

  return resend.emails.send({
    from: FROM,
    to:  [params.parentEmail],
    cc: ['info@studycore.net'],
    subject: `StudyCore Weekly Report — ${params.studentName} (${weekLabel})`,
    html,
  });
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
}) {
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
        <div class="info-row"><span class="label">Original Time</span><span class="value" style="text-decoration:line-through;color:#9ca3af">${formatDt(params.originalTime)}</span></div>
        <div class="info-row"><span class="label">New Time</span><span class="value">${formatDt(params.newTime)}</span></div>
        <div class="info-row"><span class="label">Reason</span><span class="value">${params.reason}</span></div>
        ${params.notes ? `<div class="info-row"><span class="label">Notes</span><span class="value">${params.notes}</span></div>` : ''}
      </div>
      <p style="color:#6b7280;font-size:13px">Your Zoom link remains the same — only the time has changed.</p>
    </div>`);
  return resend.emails.send({
    from: FROM,
    to,
    cc: ['info@studycore.net'],
    subject: `Session Rescheduled: ${params.studentName} → ${formatDt(params.newTime)}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    subject: `Reschedule Request: ${params.studentName} w/ ${params.tutorName}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    subject: `Assignment Update: You have been unassigned from ${params.studentName}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    subject: `New Assignment: You've been assigned to ${params.studentName}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    subject: `Tutor Update for ${params.studentName}: Assigned to ${params.newTutorName}`,
    html,
  });
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
  return resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    subject: `Tutor Switch: ${params.studentName} → ${params.newTutorName}`,
    html,
  });
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

  return resend.emails.send({
    from: FROM,
    to: ['info@studycore.net'],
    subject: `Payroll Summary: ${params.periodStart} – ${params.periodEnd} ($${params.totalAmount.toFixed(2)})`,
    html,
  });
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
        <div class="info-row"><span class="label">Link expires</span><span class="value">48 hours from now</span></div>
        <div class="info-row"><span class="label">Portal URL</span><span class="value">${params.appUrl}/tutor-portal/login</span></div>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:16px">If you weren't expecting this email, you can ignore it.</p>
    </div>`);

  return resend.emails.send({
    from: FROM,
    to: [params.tutorEmail],
    subject: `Set up your StudyCore Tutor Portal`,
    html,
  });
}

// ── PARENT ONBOARDING EMAIL ───────────────────────────────────────────────

export async function sendParentOnboardingEmail(params: {
  parentEmail: string;
  parentName: string | null;
  studentName: string;
  magicLink: string;
}) {
  const greeting = params.parentName ? `Hi ${params.parentName},` : 'Hi,';
  const NAVY = '#1e2090';
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.09);}
  .header{background:${NAVY};padding:28px 36px;}
  .header h1{color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-.3px;}
  .header p{color:#9ab0ff;margin:5px 0 0;font-size:14px;}
  .body{padding:36px;}
  .body p{color:#374151;line-height:1.7;margin:0 0 14px;font-size:15px;}
  .cta-wrap{text-align:center;margin:28px 0;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;}
  .steps{margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
  .step{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid #f3f4f6;}
  .step:last-child{border-bottom:none;}
  .step-num{width:28px;height:28px;border-radius:50%;background:${NAVY};color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
  .step-title{font-weight:600;color:#111827;font-size:14px;margin:0 0 3px;}
  .step-desc{color:#6b7280;font-size:13px;margin:0;line-height:1.5;}
  .resources{background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px 24px;margin:24px 0;}
  .resources h3{margin:0 0 12px;font-size:15px;color:#1e2090;font-weight:700;}
  .resource-item{margin-bottom:14px;}
  .resource-title{font-weight:600;color:#111827;font-size:14px;}
  .resource-body{color:#6b7280;font-size:13px;line-height:1.55;margin:3px 0 0;}
  ul.tips{margin:4px 0 0 16px;padding:0;color:#6b7280;font-size:13px;line-height:1.7;}
  .footer{padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">
  <div class="header">
    <h1>StudyCore</h1>
    <p>Welcome — Your Next Steps</p>
  </div>
  <div class="body">
    <p>${greeting}</p>
    <p>We're excited to have <strong>${params.studentName}</strong> join StudyCore! To get the most out of your tutoring experience, please complete a few quick onboarding steps. It only takes a few minutes.</p>

    <div class="cta-wrap">
      <a href="${params.magicLink}" class="btn">Access Your Parent Portal →</a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:-10px">Link is valid for 7 days. No password needed.</p>

    <p style="margin-top:24px;font-weight:600;color:#111827;font-size:15px;">Your 5 onboarding steps:</p>

    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div>
          <p class="step-title">Portal Access</p>
          <p class="step-desc">Click the link above to log into your parent portal. You're already on your way!</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div>
          <p class="step-title">Complete the Student Intake Form</p>
          <p class="step-desc">Tell us about ${params.studentName}'s current scores, target score, test date, and learning style so we can personalize their program.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div>
          <p class="step-title">Schedule a Kickoff Call</p>
          <p class="step-desc">Join a short 15-minute intro call with your tutor to align on goals and answer any questions.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div>
          <p class="step-title">Review the Game Plan</p>
          <p class="step-desc">Once your tutor creates a personalized study plan for ${params.studentName}, review and acknowledge it in the portal.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">5</div>
        <div>
          <p class="step-title">Confirm the Session Schedule</p>
          <p class="step-desc">Review the upcoming session schedule and confirm it works for your family's calendar.</p>
        </div>
      </div>
    </div>

    <div class="resources">
      <h3>📚 Resources for Parents</h3>

      <div class="resource-item">
        <div class="resource-title">How sessions work</div>
        <div class="resource-body">All sessions are held via Zoom. You'll receive a join link in each booking confirmation email. After each session, your tutor will log notes on what was covered and any follow-up items. You can view all session history and progress scores in the parent portal.</div>
      </div>

      <div class="resource-item">
        <div class="resource-title">Supporting your student at home</div>
        <ul class="tips">
          <li>Encourage 30–60 min of independent SAT practice between sessions</li>
          <li>Review the tutor's session notes together so you know what to focus on</li>
          <li>Make sure your student has a quiet, distraction-free study space</li>
          <li>Stay positive — consistent progress beats cramming every time</li>
        </ul>
      </div>

      <div class="resource-item">
        <div class="resource-title">How to reach us</div>
        <div class="resource-body">Questions? Email us anytime at <a href="mailto:info@studycore.net" style="color:${NAVY}">info@studycore.net</a>. We typically respond within one business day.</div>
      </div>
    </div>

    <p>We're looking forward to helping ${params.studentName} reach their goal. Let's get started!</p>
    <p style="margin-top:20px;font-weight:600;color:#111827;">The StudyCore Team</p>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} StudyCore. All rights reserved.<br>
    <a href="mailto:info@studycore.net" style="color:#9ca3af">info@studycore.net</a>
  </div>
</div></body></html>`;

  return resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    subject: `Welcome to StudyCore — Your Next Steps for ${params.studentName}`,
    html,
  });
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

  return resend.emails.send({
    from: FROM,
    to: [params.parentEmail],
    subject: 'Your StudyCore Parent Portal Login Link',
    html,
  });
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

  return resend.emails.send({
    from: FROM,
    to: [params.studentEmail],
    subject: 'Set up your StudyCore Student Portal',
    html,
  });
}
