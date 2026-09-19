import { NextRequest, NextResponse } from 'next/server';
import { findSupportContact, moveOpportunityStage, createSupportTask, setTutorAssigned, STAGES } from '@/lib/ghl-support';
import { sendMatchConfirmationToParent, sendMatchConfirmationToTutor } from '@/lib/email';
import { postToSlack } from '@/lib/slack';

export async function POST(req: NextRequest) {
  try {
    const { opportunityId, contactId, studentName, studentEmail, parentEmail, parentName,
            currentScore, targetScore, availability, sessionsPerWeek,
            tutorName, tutorEmail, zoomUrl, firstSession, gameplanUrl, notes } = await req.json();

    if (!opportunityId || !contactId || !tutorName || !tutorEmail || !parentEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await Promise.allSettled([
      moveOpportunityStage(opportunityId, STAGES.ACTIVE),
      setTutorAssigned(contactId, tutorName),
      createSupportTask(contactId, `Schedule first session: ${studentName} ↔ ${tutorName}`, 24),
      sendMatchConfirmationToParent({
        parentName, parentEmail, studentName, tutorName,
        zoomUrl, firstSession, sessionFreq: sessionsPerWeek,
      }),
      sendMatchConfirmationToTutor({
        tutorName, tutorEmail, studentName,
        currentScore, targetScore, availability,
        sessionFreq: sessionsPerWeek, gameplanUrl, zoomUrl, firstSession, notes,
      }),
      postToSlack(`✅ Match confirmed: *${studentName}* → *${tutorName}* | ${sessionsPerWeek || '?'}/week`),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[confirm-match]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
