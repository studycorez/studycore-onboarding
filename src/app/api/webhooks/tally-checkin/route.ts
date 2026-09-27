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

  // ── SSC Check-in (form: kdL086) ──────────────────────────────────────────
  if (formId === 'kdL086') {
    const student    = getHidden(fields, 'student');
    const checkInType= getHidden(fields, 'check_in_type') || getField(fields, 'Check-in type');
    const attended   = getField(fields, 'attend');
    const status     = getField(fields, 'status');
    const takeaways  = getField(fields, 'takeaways');
    const followUp   = getField(fields, 'Follow-up');
    const sscName    = getField(fields, 'SSC name');

    // Check-in type specific fields
    const compositeScore  = getField(fields, 'Composite score') || getField(fields, 'Official SAT composite');
    const mathScore       = getField(fields, 'Math score');
    const rwScore         = getField(fields, 'Reading/Writing score');
    const trending        = getField(fields, 'trending');
    const nextStep        = getField(fields, 'Next step');
    const hitTarget       = getField(fields, 'hit their target');
    const tqcFlags        = getField(fields, 'flags to pass');
    const needsRematch    = getField(fields, 'tutor introduced');
    const week1Booked     = getField(fields, 'week-1 check-in booked');

    const urgent = status.toLowerCase().includes('red') || followUp.toLowerCase().includes('yes');
    const emoji  = status.toLowerCase().includes('red') ? '🔴' : status.toLowerCase().includes('yellow') ? '🟡' : '🟢';

    // Build type-specific detail line
    let detailLine = '';
    if (checkInType === 'Post-Practice Test' || checkInType === 'Post-SAT Results') {
      detailLine = `Scores — Composite: ${compositeScore} | Math: ${mathScore} | RW: ${rwScore}` +
        (trending ? ` | Trend: ${trending}` : '') +
        (hitTarget ? ` | Hit target: ${hitTarget}` : '') +
        (nextStep ? ` | Next: ${nextStep}` : '');
    } else if (checkInType === 'Onboarding Call') {
      detailLine = (needsRematch?.toLowerCase().includes('re-match') ? '⚠️ Tutor re-match needed' : 'Tutor accepted') +
        ` | Week-1 call booked: ${week1Booked}` +
        (tqcFlags ? ` | TQC flags: ${tqcFlags}` : '');
    }

    await postToSlack(
      `${emoji} SSC Check-in: *${student || 'Unknown'}* | ${checkInType} | Attended: ${attended}\n` +
      `Status: ${status} | Follow-up needed: ${followUp} | SSC: ${sscName}\n` +
      (detailLine ? `${detailLine}\n` : '') +
      (takeaways ? `Notes: ${takeaways}` : '') +
      (urgent ? '\n⚠️ *Requires follow-up within 48h*' : '')
    );

    // Auto-advance pipeline stage based on which check-in type was completed
    if (student && checkInType) {
      const tracking = await getContactForTracking(student);
      if (tracking?.opportunityId) {

        if (checkInType === 'Post-Practice Test') {
          // Increment full-length count and move to appropriate phase stage
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
