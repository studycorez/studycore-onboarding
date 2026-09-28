/**
 * Tally webhook handler for SSC and TQCC check-in form submissions.
 * Logs to Slack and flags urgent statuses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { postToSlack } from '@/lib/slack';
import { getContactForTracking, moveStageForCheckin, moveStageForFullLength, HOUR_CF } from '@/lib/ghl-support';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export const dynamic = 'force-dynamic';

function getField(fields: any[], label: string): string {
  const f = fields.find((f: any) =>
    f.label?.toLowerCase().includes(label.toLowerCase()) ||
    f.title?.toLowerCase().includes(label.toLowerCase())
  );
  if (!f) return '';
  if (Array.isArray(f.value)) return f.value.join(', ');
  return f.value ?? '';
}

function getHidden(fields: any[], name: string): string {
  const f = fields.find((f: any) => f.label === name || f.title === name);
  return Array.isArray(f?.value) ? f.value[0] : f?.value ?? '';
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const formId = body?.data?.formId ?? body?.formId ?? '';
  const fields: any[] = body?.data?.fields ?? [];

  // ── SSC Check-in (form: BzvYE1) ──────────────────────────────────────────
  if (formId === 'BzvYE1') {
    const student     = getField(fields, 'Student Name');
    const checkInType = getField(fields, 'Check-in type');
    const sscName     = getField(fields, 'Your name');
    const attended    = getField(fields, 'Who attended');
    const status      = getField(fields, 'Overall status');
    const concerns    = getField(fields, 'concerns or red flags');
    const founderAttn = getField(fields, 'founder attention');
    const notes       = getField(fields, 'Summary notes');
    const weeklyTime  = getField(fields, 'Agreed weekly check-in');

    // Check-in type specific fields
    const compositeScore = getField(fields, 'Practice test score') || getField(fields, 'Official SAT score');
    const mathScore      = getField(fields, 'Math score');
    const rwScore        = getField(fields, 'Reading/Writing score');
    const trending       = getField(fields, 'trending');
    const hitTarget      = getField(fields, 'hit their target') || getField(fields, 'Did they hit their target');
    const nextStep       = getField(fields, 'Next step');

    const urgent = founderAttn.toLowerCase().includes('yes');
    const emoji  = status.toLowerCase().includes('red') ? '🔴' : status.toLowerCase().includes('yellow') ? '🟡' : '🟢';

    let detailLine = '';
    if (checkInType?.toLowerCase().includes('practice test') || checkInType?.toLowerCase().includes('sat')) {
      detailLine = `Scores — Composite: ${compositeScore || '—'} | Math: ${mathScore || '—'} | RW: ${rwScore || '—'}` +
        (trending ? ` | Trend: ${trending}` : '') +
        (hitTarget ? ` | Hit target: ${hitTarget}` : '') +
        (nextStep ? ` | Next: ${nextStep}` : '');
    } else if (checkInType === 'Onboarding Call' && weeklyTime) {
      detailLine = `Weekly check-in time: ${weeklyTime}`;
    }

    await postToSlack(
      `${emoji} SSC Check-in: *${student || 'Unknown'}* | ${checkInType} | Attended: ${attended}\n` +
      `Status: ${status} | SSC: ${sscName}\n` +
      (detailLine ? `${detailLine}\n` : '') +
      (notes ? `Notes: ${notes}` : '') +
      (concerns ? `\nConcerns: ${concerns}` : '') +
      (urgent ? '\n⚠️ *Requires founder attention*' : '')
    );

    // Auto-advance pipeline stage
    if (student && checkInType) {
      const tracking = await getContactForTracking(student);
      if (tracking?.opportunityId) {
        if (checkInType?.toLowerCase().includes('practice test')) {
          let currentCount = 0;
          if (HOUR_CF.FULL_LENGTH_COUNT) {
            const contactRes = await fetch(`${GHL_BASE}/contacts/${tracking.contactId}`, { headers: ghlHeaders() });
            if (contactRes.ok) {
              const contactData = await contactRes.json();
              const cf = (contactData.contact?.customFields ?? []).find((f: any) => f.id === HOUR_CF.FULL_LENGTH_COUNT);
              currentCount = parseInt(cf?.fieldValueString ?? '0', 10) || 0;
            }
          }
          const newCount = currentCount + 1;
          await moveStageForFullLength(tracking.opportunityId, tracking.contactId, newCount, student);
        } else {
          await moveStageForCheckin(tracking.opportunityId, checkInType, student);
        }
      }
    }
  }

  // ── TQCC Tutor Check-in (form: vGR08A) ───────────────────────────────────
  if (formId === 'vGR08A') {
    const tutorName   = getHidden(fields, 'tutor_name') || getField(fields, 'tutor');
    const studentName = getHidden(fields, 'student_name');
    const attended    = getField(fields, 'tutor attend');
    const recordings  = getField(fields, 'recordings');
    const reports     = getField(fields, 'reports');
    const rating      = getField(fields, 'rating');
    const escalation  = getField(fields, 'Escalation');
    const concerns    = getField(fields, 'Concerns');
    const tqccName    = getField(fields, 'TQCC name');

    const urgent = escalation.toLowerCase().includes('yes') || attended.toLowerCase().includes('no');
    const emoji  = urgent ? '🔴' : rating.startsWith('5') || rating.startsWith('4') ? '🟢' : '🟡';

    await postToSlack(
      `${emoji} TQCC Check-in: *${tutorName || 'Unknown tutor'}* | Student: ${studentName || 'N/A'}\n` +
      `Attended: ${attended} | Recordings: ${recordings} | Reports: ${reports} | Rating: ${rating}\n` +
      `TQCC: ${tqccName}` +
      (concerns ? `\nFlags: ${concerns}` : '') +
      (urgent ? '\n⚠️ *Escalation flagged — review immediately*' : '')
    );
  }

  return NextResponse.json({ ok: true });
}
