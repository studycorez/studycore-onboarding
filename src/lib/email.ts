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
    cc:  ['info@studycore.net'],
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
