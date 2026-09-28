import { NextRequest, NextResponse } from 'next/server';
import { getContactForTracking, updateHourTracking } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { logSession } from '@/lib/airtable';

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

function getFieldByLabel(fields: any[], partial: string): string {
  const match = fields.find((f: any) =>
    typeof f.label === 'string' && f.label.toLowerCase().includes(partial.toLowerCase())
  );
  const val = match?.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
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

  // If tutor reported a full-length practice test, send Phase Check-in (Zoom) booking link
  const fullLengthField = fields.find((f: any) =>
    f.label?.toLowerCase().includes('full-length') ||
    f.label?.toLowerCase().includes('full length') ||
    f.label?.toLowerCase().includes('practice test')
  );
  const tookFullLength =
    fullLengthField?.value === true ||
    String(fullLengthField?.value ?? '').toLowerCase() === 'yes';

  if (tookFullLength) {
    await sendCheckinBookingLink(contactId, studentName, 'Post-Practice Test');
  }

  const statusEmoji = newRemaining <= 0 ? '🔴' : newRemaining <= 10 ? '🟡' : '🟢';
  await postToSlack(
    `${statusEmoji} Session report: *${studentName}* | ${sessionHours}h logged | ` +
    `${newCompleted}/${hoursPurchased || '?'}h total | ${newRemaining}h remaining (session ${newSessions})`
  );

  // Log session to Airtable for TQC compliance tracking
  await logSession({
    studentName,
    tutorIdNumber:    getFieldByLabel(fields, 'Tutor ID Number'),
    date:             getFieldByLabel(fields, 'Session date').slice(0, 10) || new Date().toISOString().slice(0, 10),
    sessionStatus:    getFieldByLabel(fields, 'Session status'),
    topics:           getFieldByLabel(fields, 'What topics did you cover'),
    studentStruggle:  getFieldByLabel(fields, 'What did the student struggle with'),
    homeworkAssigned: getFieldByLabel(fields, 'What homework did you assign'),
    hwCompletion:     getFieldByLabel(fields, 'Did the student complete their homework'),
    engagement:       getFieldByLabel(fields, 'How engaged was the student'),
    flags:            getFieldByLabel(fields, 'Any flags or concerns'),
    durationHours:    sessionHours,
    fathomLink:       getFieldByLabel(fields, 'Paste your Fathom'),
    onTrack:          getFieldByLabel(fields, 'How would you rate this session'),
    notesForSsc:      getFieldByLabel(fields, 'Notes for the Student Success'),
    studentId:        getFieldByLabel(fields, 'Student ID Number'),
  });

  return NextResponse.json({ ok: true });
}
