import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@studycore.net';
const NAVY = '#1e2090';

function baseLayout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
  .header{background:${NAVY};padding:24px 32px;}
  .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
  .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
  .body{padding:32px;}
  .body h2{color:#111827;margin:0 0 16px;font-size:18px;}
  .body p{color:#374151;line-height:1.6;margin:0 0 12px;font-size:15px;}
  .info-box{background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin:20px 0;}
  .info-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;}
  .info-row .label{color:#6b7280;font-weight:500;}
  .info-row .value{color:#111827;font-weight:600;}
  .btn{display:inline-block;background:${NAVY};color:#fff !important;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;margin:8px 4px 8px 0;}
  .btn-secondary{background:#e5e7eb;color:#111827 !important;}
  .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">${content}
<div class="footer">&copy; ${new Date().getFullYear()} StudyCore. Questions? <a href="mailto:support@studycore.net" style="color:#9ca3af">support@studycore.net</a></div>
</div></body></html>`;
}

export async function sendOnboardingEmail(params: {
  parentName:            string;
  parentEmail:           string;
  studentName:           string;
  currentScore?:         string;
  targetScore?:          string;
  packageHours?:         string;
  sessionFrequency?:     string;
  preferredDays?:        string;
  preferredTime?:        string;
  targetStartDate?:      string;
  gameplanUrl?:          string;
  diagnosticCompleteUrl: string;
  parentFormUrl?:        string;
  studentFormUrl?:       string;
}): Promise<void> {
  const diagnosticUrl = process.env.HIGH_SCORES_DIAGNOSTIC_URL ?? 'https://learn.studycore.net';
  const infoRows: [string, string][] = [
    ['Student', params.studentName],
    ...(params.currentScore     ? [['Current Score', params.currentScore] as [string,string]]   : []),
    ...(params.targetScore      ? [['Target Score', params.targetScore] as [string,string]]     : []),
    ...(params.packageHours     ? [['Package', `${params.packageHours} hours`] as [string,string]] : []),
    ...(params.sessionFrequency ? [['Frequency', params.sessionFrequency] as [string,string]]   : []),
    ...(params.preferredDays    ? [['Preferred Days', [params.preferredDays, params.preferredTime].filter(Boolean).join(' at ')] as [string,string]] : []),
    ...(params.targetStartDate  ? [['Target Start', params.targetStartDate] as [string,string]] : []),
  ];

  const html = baseLayout(`
    <div class="header"><h1>Welcome to StudyCore</h1><p>You're officially enrolled — here's what happens next</p></div>
    <div class="body">
      <h2>Hi ${params.parentName},</h2>
      <p>We're excited to have ${params.studentName} in the program. To get your tutor assigned as fast as possible, we need one thing first: <strong>the diagnostic test.</strong></p>
      <div class="info-box">${infoRows.map(([l,v]) => `<div class="info-row"><span class="label">${l}</span><span class="value">${v}</span></div>`).join('')}</div>
      <h2>Step 1 — Complete the Diagnostic</h2>
      <p>The diagnostic tells us exactly where ${params.studentName} needs the most help. It takes 60–90 minutes and can be done at home.</p>
      <a href="${diagnosticUrl}" class="btn">Take the Diagnostic →</a>
      <h2>Step 2 — Confirm When You're Done</h2>
      <p>Once submitted, click below to notify our team. This is one click and immediately starts the matching process.</p>
      <a href="${params.diagnosticCompleteUrl}" class="btn btn-secondary">I've Completed the Diagnostic ✓</a>
      ${(params.parentFormUrl || params.studentFormUrl) ? `
      <h2>While You Wait</h2>
      <p>Complete these two short forms so we can match your student with the perfect tutor. They take about 10 minutes each.</p>
      ${params.parentFormUrl ? `<a href="${params.parentFormUrl}" class="btn" style="color:#fff">Parent Onboarding Form →</a>` : ''}
      ${params.studentFormUrl ? `<a href="${params.studentFormUrl}" class="btn btn-secondary">Student Onboarding Form →</a>` : ''}
      ` : ''}
      <h2>Step 3 — Meet Your Tutor</h2>
      <p>Within <strong>24 hours</strong> of confirming, you'll receive your tutor's name, Zoom link, and first session date.</p>
      ${params.gameplanUrl ? `<p style="margin-top:20px">View your personalized gameplan: <a href="${params.gameplanUrl}" style="color:${NAVY};font-weight:600">View Gameplan →</a></p>` : ''}
      <p style="margin-top:24px;color:#9ca3af;font-size:13px">Questions? Reply to this email and we'll get back to you shortly.</p>
    </div>
  `);

  await resend.emails.send({
    from: FROM,
    to: params.parentEmail,
    subject: `Welcome to StudyCore — Next Steps for ${params.studentName}`,
    html,
  });
}

export async function sendMatchConfirmationToParent(params: {
  parentName:    string;
  parentEmail:   string;
  studentName:   string;
  tutorName:     string;
  tutorBio?:     string;
  zoomUrl?:      string;
  firstSession?: string;
  sessionFreq?:  string;
}): Promise<void> {
  const html = baseLayout(`
    <div class="header"><h1>Your Tutor Has Been Assigned</h1><p>You're ready to start — here are your session details</p></div>
    <div class="body">
      <h2>Hi ${params.parentName},</h2>
      <p>Great news — ${params.studentName} has been matched with a tutor and is ready to begin!</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Tutor</span><span class="value">${params.tutorName}</span></div>
        ${params.firstSession ? `<div class="info-row"><span class="label">First Session</span><span class="value">${params.firstSession}</span></div>` : ''}
        ${params.sessionFreq  ? `<div class="info-row"><span class="label">Frequency</span><span class="value">${params.sessionFreq}</span></div>` : ''}
      </div>
      ${params.tutorBio ? `<p>${params.tutorBio}</p>` : ''}
      ${params.zoomUrl ? `<p>Your Zoom link for all sessions:</p><a href="${params.zoomUrl}" class="btn">Join Zoom Session</a>` : ''}
      <p style="margin-top:20px">If you have any questions before your first session, reply to this email and we'll be right with you.</p>
    </div>
  `);
  await resend.emails.send({
    from: FROM,
    to: params.parentEmail,
    subject: `${params.studentName}'s Tutor Is Confirmed — Session Details Inside`,
    html,
  });
}

export async function sendMatchConfirmationToTutor(params: {
  tutorName:     string;
  tutorEmail:    string;
  studentName:   string;
  currentScore?: string;
  targetScore?:  string;
  availability?: string;
  sessionFreq?:  string;
  gameplanUrl?:  string;
  zoomUrl?:      string;
  firstSession?: string;
  notes?:        string;
}): Promise<void> {
  const html = baseLayout(`
    <div class="header"><h1>New Student Assignment</h1><p>You've been matched with a new student</p></div>
    <div class="body">
      <h2>Hi ${params.tutorName},</h2>
      <p>You've been assigned a new student. Here's everything you need to get started.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Student</span><span class="value">${params.studentName}</span></div>
        ${params.currentScore ? `<div class="info-row"><span class="label">Current Score</span><span class="value">${params.currentScore}</span></div>` : ''}
        ${params.targetScore  ? `<div class="info-row"><span class="label">Target Score</span><span class="value">${params.targetScore}</span></div>` : ''}
        ${params.sessionFreq  ? `<div class="info-row"><span class="label">Frequency</span><span class="value">${params.sessionFreq}</span></div>` : ''}
        ${params.availability ? `<div class="info-row"><span class="label">Availability</span><span class="value">${params.availability}</span></div>` : ''}
        ${params.firstSession ? `<div class="info-row"><span class="label">First Session</span><span class="value">${params.firstSession}</span></div>` : ''}
      </div>
      ${params.gameplanUrl ? `<p>Review the student's gameplan before your first session: <a href="${params.gameplanUrl}" style="color:${NAVY};font-weight:600">View Gameplan →</a></p>` : ''}
      ${params.zoomUrl ? `<p>Your Zoom link for all sessions with this student:</p><a href="${params.zoomUrl}" class="btn">Open Zoom Link</a>` : ''}
      ${params.notes ? `<p style="margin-top:16px"><strong>Notes:</strong> ${params.notes}</p>` : ''}
      <p style="margin-top:20px">Questions? Reply to this email or reach us at <a href="mailto:support@studycore.net" style="color:${NAVY}">support@studycore.net</a>.</p>
    </div>
  `);
  await resend.emails.send({
    from: FROM,
    to: params.tutorEmail,
    subject: `New Student: ${params.studentName} — Action Required`,
    html,
  });
}
