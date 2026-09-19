/**
 * HiScores webhook handler.
 * Fires on attempt.finished events.
 * Looks up the student by ID via HiScores GraphQL, then moves GHL pipeline stage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { getContactForTracking, moveStageForFullLength, HOUR_CF } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const HS_GRAPHQL = 'https://api.highscores.ai/public/graphql';

// Only track completions of this specific full-length diagnostic assessment
const FULLENGTH_ASSESSMENT_ID = '6a878811079a7d3dda7db64b';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function getStudentNameById(studentId: string): Promise<string> {
  const query = `
    query {
      studentReport {
        students {
          id
          name
        }
      }
    }
  `;
  try {
    const res = await fetch(HS_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.HISCORES_API_KEY ?? '' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const students: { id: string; name: string }[] = data?.data?.studentReport?.students ?? [];
    return students.find(s => s.id === studentId)?.name ?? '';
  } catch {
    return '';
  }
}

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: true });
  }

  // HiScores payload: { id, type, createdAt, locationId, data: { object: { id, assessmentId, studentId, status } } }
  const eventType = body?.type ?? '';
  if (eventType !== 'attempt.finished') {
    return NextResponse.json({ ok: true });
  }

  const attemptObj   = body?.data?.object ?? {};
  const studentId    = attemptObj?.studentId ?? '';
  const assessmentId = attemptObj?.assessmentId ?? '';

  // Only process the tracked full-length assessment
  if (assessmentId !== FULLENGTH_ASSESSMENT_ID) {
    console.log(`[hiscores] skipping assessmentId=${assessmentId} — not the tracked full-length`);
    return NextResponse.json({ ok: true });
  }

  if (!studentId) {
    await postToSlack('⚠️ HiScores attempt.finished — no studentId in payload');
    return NextResponse.json({ ok: true });
  }

  const studentName = await getStudentNameById(studentId);

  if (!studentName) {
    await postToSlack(`⚠️ HiScores attempt.finished — couldn't resolve studentId ${studentId} to a name`);
    return NextResponse.json({ ok: true });
  }

  const tracking = await getContactForTracking(studentName);
  if (!tracking?.contactId) {
    await postToSlack(`⚠️ HiScores attempt.finished: *${studentName}* — couldn't find contact in GHL`);
    await sendCheckinBookingLink('', studentName, 'Post-Practice Test');
    return NextResponse.json({ ok: true });
  }

  const { contactId, opportunityId } = tracking;

  // Read current full-length count from GHL
  let currentCount = 0;
  if (HOUR_CF.FULL_LENGTH_COUNT) {
    const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders() });
    if (contactRes.ok) {
      const contactData = await contactRes.json();
      const cf = (contactData.contact?.customFields ?? []).find((f: any) => f.id === HOUR_CF.FULL_LENGTH_COUNT);
      currentCount = parseInt(cf?.fieldValueString ?? '0', 10) || 0;
    }
  }

  const newCount = currentCount + 1;

  if (opportunityId) {
    await moveStageForFullLength(opportunityId, contactId, newCount);
  }

  await sendCheckinBookingLink(contactId, studentName, 'Post-Practice Test');
  await postToSlack(`📊 HiScores attempt #${newCount}: *${studentName}* — stage moved + booking link sent`);

  return NextResponse.json({ ok: true });
}
