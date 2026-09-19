import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, updateHourTracking } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';
import { sendCheckinBookingLink } from '@/lib/checkin';

export const dynamic = 'force-dynamic';

// Field UUIDs from the Tally session report form (rjXPvv)
const TALLY_FIELD_STUDENT = 'e23febda-1c6b-48ba-b850-69db570f6e58';
const TALLY_FIELD_HOURS   = '4942fa1e-a18c-4159-9b6b-bcea4c0f6ba6';
const TALLY_FIELD_STATUS  = 'e0cc4801-e9b8-4dda-a0f0-059197b13545'; // groupUuid for Green/Yellow/Red

function getFieldValue(fields: any[], id: string, labelFallback?: string): any {
  const byId    = fields.find((f: any) => f.key === id || f.id === id);
  const byLabel = labelFallback ? fields.find((f: any) => f.label === labelFallback) : null;
  return (byId ?? byLabel)?.value ?? null;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields: any[] = body?.data?.fields ?? [];

  const studentName  = getFieldValue(fields, TALLY_FIELD_STUDENT, 'student') ?? '';
  const sessionHours = parseFloat(getFieldValue(fields, TALLY_FIELD_HOURS) ?? '0');

  // Parse session status from Green/Yellow/Red field
  const rawStatus = (getFieldValue(fields, TALLY_FIELD_STATUS) ?? '') as string;
  const sessionStatus: 'green' | 'yellow' | 'red' =
    rawStatus.toLowerCase().includes('red')    ? 'red'    :
    rawStatus.toLowerCase().includes('yellow') ? 'yellow' : 'green';

  if (!studentName || !sessionHours || sessionHours <= 0) {
    console.log('[tally] missing student or hours — skipping');
    return NextResponse.json({ ok: true });
  }

  const tracking = await getContactForTracking(studentName);

  if (!tracking?.contactId) {
    await postToSlack(`⚠️ Session report for *${studentName}* — couldn't find contact in GHL. Hours not deducted.`);
    return NextResponse.json({ ok: true });
  }

  const {
    contactId, opportunityId, currentStageId,
    hoursPurchased, hoursCompleted, hoursRemaining, sessionsCompleted,
  } = tracking;

  const newCompleted = Math.round((hoursCompleted + sessionHours) * 10) / 10;
  const newRemaining = Math.max(0, Math.round((hoursRemaining - sessionHours) * 10) / 10);
  const newSessions  = sessionsCompleted + 1;

  await updateHourTracking(contactId, opportunityId, currentStageId, newCompleted, newRemaining, newSessions, sessionStatus);

  // Trigger check-in booking links at session milestones
  if (newSessions === 1 || newSessions === 3) {
    const type = newSessions === 1 ? 'Post-Session 1' : 'Post-Session 3';
    await sendCheckinBookingLink(contactId, studentName, type);
  }

  const statusEmoji = newRemaining <= 0 ? '🔴' : newRemaining <= 10 ? '🟡' : '🟢';
  await postToSlack(
    `${statusEmoji} Session report: *${studentName}* | ${sessionHours}h logged | ` +
    `${newCompleted}/${hoursPurchased || '?'}h total | ${newRemaining}h remaining (session ${newSessions})`
  );

  return NextResponse.json({ ok: true });
}
