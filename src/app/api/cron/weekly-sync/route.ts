/**
 * Weekly cron — sends SSC booking link to all active students with ≥1 session completed.
 * Runs every Monday at 9 AM ET (14:00 UTC).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
const PIPELINE_ID = 'a9Ytm6ovrr5OK9PHJGrJ';

const STUDENT_NAME_CF    = 'SVWWOw5yr7q7POnmp3eY';
const SESSIONS_COMPLETED = 'W9EtK6usUyCjMROF3MpW';

// Stages that represent active students receiving tutoring
const ACTIVE_STAGES = new Set([
  '0f27807f-987a-44a4-9e3e-6399c4f73ff4', // Active – Pre Check-in
  'd3e839e1-1128-4308-9d51-93b8f2b7dd0d', // 3-Session Check-in Done
  '6f509959-ee9b-430b-aadd-18e7fdb915be', // Active
  '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23', // Low Hours (<10h)
]);

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let page = 1;
  let hasMore = true;
  const sent: string[] = [];
  const skipped: string[] = [];

  while (hasMore) {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${PIPELINE_ID}&limit=100&page=${page}`,
      { headers: ghlHeaders(), cache: 'no-store' },
    );
    if (!res.ok) break;

    const { opportunities = [], meta } = await res.json();
    hasMore = meta?.currentPage < meta?.totalPages;
    page++;

    for (const opp of opportunities) {
      // Only active stages
      if (!ACTIVE_STAGES.has(opp.pipelineStageId)) continue;

      const contact = opp.contact ?? {};
      const getField = (id: string) =>
        (contact.customFields ?? []).find((f: any) => f.id === id)?.fieldValueString ?? '';

      const studentName      = getField(STUDENT_NAME_CF) || opp.name || '';
      const sessionsCompleted = parseFloat(getField(SESSIONS_COMPLETED) || '0');

      // Only send to students who've had at least 1 session
      if (!studentName || sessionsCompleted < 1) {
        skipped.push(studentName || opp.id);
        continue;
      }

      await sendCheckinBookingLink(contact.id ?? '', studentName, 'Weekly Sync');
      sent.push(studentName);
    }
  }

  await postToSlack(
    `📅 Weekly sync cron: ${sent.length} booking link(s) sent\n` +
    (sent.length ? sent.map(s => `• ${s}`).join('\n') : '_none_')
  );

  return NextResponse.json({ ok: true, sent: sent.length, skipped: skipped.length });
}
