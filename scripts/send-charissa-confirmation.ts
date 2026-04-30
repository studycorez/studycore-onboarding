import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);

const STUDENT_ID = '50f283f8-8fdf-4ad3-b22f-f1033edbab7b';
const SUNDAY_UTC_TIMES = [
  '2026-05-11T03:00:00.000Z','2026-05-18T03:00:00.000Z','2026-05-25T03:00:00.000Z',
  '2026-06-01T03:00:00.000Z','2026-06-08T03:00:00.000Z','2026-06-15T03:00:00.000Z',
  '2026-06-22T03:00:00.000Z','2026-06-29T03:00:00.000Z','2026-07-06T03:00:00.000Z',
  '2026-07-13T03:00:00.000Z','2026-07-20T03:00:00.000Z','2026-07-27T03:00:00.000Z',
  '2026-08-03T03:00:00.000Z','2026-08-10T03:00:00.000Z','2026-08-17T03:00:00.000Z',
];

async function main() {
  // Fetch the sessions we just created
  const { data: sessions } = await supabase
    .from('sessions')
    .select('scheduled_at, zoom_join_url')
    .eq('student_id', STUDENT_ID)
    .in('scheduled_at', SUNDAY_UTC_TIMES)
    .order('scheduled_at', { ascending: true });

  if (!sessions?.length) { console.error('No sessions found'); return; }

  const rows = sessions.map((s, i) => {
    const dt = new Date(s.scheduled_at);
    const mt  = dt.toLocaleString('en-US', { timeZone: 'America/Denver',   weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true });
    const est = dt.toLocaleString('en-US', { timeZone: 'America/New_York', hour:'numeric', minute:'2-digit', hour12:true });
    return `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
        <td style="padding:10px 14px;font-size:13px;color:#111">${i + 1}</td>
        <td style="padding:10px 14px;font-size:13px;color:#111">${mt} MT</td>
        <td style="padding:10px 14px;font-size:13px;color:#111">${est} EST</td>
        <td style="padding:10px 14px;font-size:13px">
          <a href="${s.zoom_join_url}" style="color:#1d4ed8;text-decoration:none">Join Zoom</a>
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px">
      <h2 style="color:#0f172a;margin-bottom:4px">Charissa Alex-Baxter — New Sunday Sessions</h2>
      <p style="color:#64748b;margin-top:0;font-size:14px">
        15 recurring Sunday sessions created for <strong>Charissa Alex-Baxter</strong> with tutor <strong>Navya Pichika</strong>.
        Each session is 90 minutes at 9:00 PM MT / 11:00 PM EST.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#0f172a;color:#fff">
            <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600">#</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600">Date &amp; Time (MT)</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600">EST</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600">Zoom</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:20px">
        Sessions run May 10 – Aug 16, 2026 &nbsp;·&nbsp; 90 min each &nbsp;·&nbsp; Zoom meetings created for all sessions.
      </p>
    </div>`;

  const result = await resend.emails.send({
    from: 'StudyCore <noreply@studycore.net>',
    to:   ['info@studycore.net'],
    subject: 'New Sessions Created: Charissa Alex-Baxter — 15 Sunday Sessions (May–Aug 2026)',
    html,
  });

  console.log('Email sent:', JSON.stringify(result));
}

main().catch(console.error);
