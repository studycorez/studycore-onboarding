/**
 * One-time backfill: send a Zoom join link email to every parent and tutor
 * for all upcoming scheduled sessions.
 *
 * Run:  npx tsx scripts/backfill-zoom-emails.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM   = process.env.RESEND_FROM_EMAIL!;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.RESEND_API_KEY || !FROM) {
  console.error('Missing required env vars.');
  process.exit(1);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function emailHtml(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px}
    .wrap{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
    .header{background:#1e3a5f;padding:24px 32px;color:#fff;text-align:center}
    .header h1{margin:0;font-size:22px;font-weight:700}
    .header p{margin:4px 0 0;font-size:13px;opacity:.8}
    .body{padding:28px 32px;color:#111827}
    h2{margin:0 0 12px;font-size:18px;color:#111827}
    p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151}
    .info-box{background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0}
    .info-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
    .label{color:#6b7280;font-weight:500}
    .value{color:#111827;font-weight:600;text-align:right}
    .btn{display:inline-block;background:#1e3a5f;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;margin:16px 0 8px}
    .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center}
  </style></head><body><div class="wrap">
    <div class="header"><h1>StudyCore</h1><p>${title}</p></div>
    <div class="body">${body}</div>
    <div class="footer">&copy; ${new Date().getFullYear()} StudyCore · <a href="mailto:support@studycore.net" style="color:#9ca3af">support@studycore.net</a></div>
  </div></body></html>`;
}

async function main() {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, zoom_join_url, zoom_host_url, student:students(id, name, email, parent_email, parent_name, timezone), tutor:tutors(id, name, email)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .not('zoom_join_url', 'is', null)
    .order('scheduled_at');

  if (error) { console.error('DB error:', error); process.exit(1); }
  console.log(`Sending Zoom link emails for ${sessions?.length ?? 0} upcoming sessions…\n`);

  let ok = 0, fail = 0;

  for (const s of sessions ?? []) {
    const student = s.student as any;
    const tutor   = s.tutor as any;
    if (!student || !tutor) { console.warn(`  ⚠ Session ${s.id} missing student or tutor — skipping`); continue; }

    const dateStr = fmtDate(s.scheduled_at);

    // Email to parent (and student if different address)
    const parentRecipients = Array.from(new Set([student.email, student.parent_email].filter(Boolean))) as string[];
    try {
      await resend.emails.send({
        from: FROM,
        to: parentRecipients,
        reply_to: 'support@studycore.net',
        subject: `Your Zoom link for ${student.name}'s session on ${dateStr}`,
        html: emailHtml('Your Zoom Join Link', `
          <h2>Zoom Link for Upcoming Session</h2>
          <p>Here is the Zoom join link for ${student.name}'s upcoming tutoring session.</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Student</span><span class="value">${student.name}</span></div>
            <div class="info-row"><span class="label">Tutor</span><span class="value">${tutor.name}</span></div>
            <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${dateStr}</span></div>
            <div class="info-row"><span class="label">Duration</span><span class="value">${s.duration_minutes} min</span></div>
          </div>
          <a href="${s.zoom_join_url}" class="btn">Join Zoom Meeting</a>
          <p style="font-size:12px;color:#6b7280;margin-top:8px">You can join up to 30 minutes before the session starts. No host needed.</p>
        `),
      });
      console.log(`  ✓ Parent email → ${parentRecipients.join(', ')}  (${student.name} | ${dateStr})`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Parent email FAILED for session ${s.id}:`, e);
      fail++;
    }

    // Email to tutor
    try {
      await resend.emails.send({
        from: FROM,
        to: [tutor.email],
        reply_to: 'support@studycore.net',
        subject: `Your Zoom link for session with ${student.name} on ${dateStr}`,
        html: emailHtml('Your Zoom Join Link', `
          <h2>Zoom Link for Upcoming Session</h2>
          <p>Here is the Zoom link for your upcoming session with ${student.name}.</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Student</span><span class="value">${student.name}</span></div>
            <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${dateStr}</span></div>
            <div class="info-row"><span class="label">Duration</span><span class="value">${s.duration_minutes} min</span></div>
          </div>
          <a href="${s.zoom_join_url}" class="btn">Join Zoom Meeting</a>
          ${s.zoom_host_url ? `<p style="margin-top:8px"><a href="${s.zoom_host_url}" style="font-size:13px;color:#6b7280">Open host link (start meeting as host)</a></p>` : ''}
          <p style="font-size:12px;color:#6b7280;margin-top:8px">Students can join without you — join_before_host is enabled.</p>
        `),
      });
      console.log(`  ✓ Tutor email  → ${tutor.email}  (${student.name} | ${dateStr})`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Tutor email FAILED for session ${s.id}:`, e);
      fail++;
    }

    // Brief pause to avoid Resend rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nDone: ${ok} emails sent, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
