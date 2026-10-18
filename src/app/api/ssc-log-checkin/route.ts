import { NextRequest, NextResponse } from 'next/server';
import { postToSlack } from '@/lib/slack';
import { getContactForTracking, moveStageForCheckin, moveStageForFullLength, saveWeeklyCheckinTime, HOUR_CF } from '@/lib/ghl-support';
import { lookupAirtableStudentByName, createCheckinRecord } from '@/lib/airtable';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      // Required
      studentName,
      airtableRecordId,
      studentSeq,
      checkInType,
      overallStatus,
      // Optional
      submittedBy,
      summaryNotes,
      concerns,
      founderAttention,
      fathomLink,
      firstSessionRating,
      practiceTestScore,
      mathScore,
      rwScore,
      weeklyCheckinTime,
      contactId: explicitContactId,
    } = body;

    if (!studentName || !checkInType || !overallStatus) {
      return NextResponse.json({ error: 'studentName, checkInType, and overallStatus are required' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const emoji  = overallStatus === 'Red' ? '🔴' : overallStatus === 'Yellow' ? '🟡' : '🟢';
    const urgent = founderAttention === true;

    // 1. Write check-in record to Airtable
    let checkinId: string | null = null;
    if (airtableRecordId) {
      checkinId = await createCheckinRecord({
        studentRecordId:    airtableRecordId,
        studentSeq:         studentSeq ?? 0,
        submittedBy:        submittedBy || 'SSC',
        checkInDate:        today,
        checkInType,
        overallStatus,
        summaryNotes:       summaryNotes || '',
        concerns:           concerns || '',
        founderAttention:   urgent,
        fathomLink:         fathomLink || undefined,
        firstSessionRating: firstSessionRating || undefined,
        practiceTestScore:  practiceTestScore || undefined,
        mathScore:          mathScore || undefined,
        rwScore:            rwScore || undefined,
      });
    } else {
      // Fall back to name-based lookup if record ID not available
      const lookup = await lookupAirtableStudentByName(studentName);
      if (lookup) {
        checkinId = await createCheckinRecord({
          studentRecordId:    lookup.recordId,
          studentSeq:         lookup.seqNumber,
          submittedBy:        submittedBy || 'SSC',
          checkInDate:        today,
          checkInType,
          overallStatus,
          summaryNotes:       summaryNotes || '',
          concerns:           concerns || '',
          founderAttention:   urgent,
          fathomLink:         fathomLink || undefined,
          firstSessionRating: firstSessionRating || undefined,
          practiceTestScore:  practiceTestScore || undefined,
          mathScore:          mathScore || undefined,
          rwScore:            rwScore || undefined,
        });
      }
    }

    // 2. Post to Slack
    const scoreLines = practiceTestScore
      ? `Scores — Composite: ${practiceTestScore}${mathScore ? ` | Math: ${mathScore}` : ''}${rwScore ? ` | R&W: ${rwScore}` : ''}\n`
      : '';
    await postToSlack(
      `${emoji} SSC Check-in: *${studentName}* | ${checkInType}\n` +
      `Status: ${overallStatus}${submittedBy ? ` | SSC: ${submittedBy}` : ''}\n` +
      scoreLines +
      (summaryNotes ? `Notes: ${summaryNotes}` : '') +
      (concerns ? `\nConcerns: ${concerns}` : '') +
      (urgent ? '\n⚠️ *Requires founder attention*' : '')
    );

    // 3. GHL stage advance + check-in time save
    const ghlData = explicitContactId
      ? null // We have contactId but need opportunityId — look up below
      : await getContactForTracking(studentName);

    const tracking = ghlData ?? (explicitContactId ? await (async () => {
      // Minimal lookup using contactId
      return await getContactForTracking(studentName);
    })() : null);

    if (tracking?.opportunityId) {
      if (checkInType?.toLowerCase().includes('practice test') || checkInType?.toLowerCase().includes('phase')) {
        let currentCount = 0;
        if (HOUR_CF.FULL_LENGTH_COUNT) {
          const contactRes = await fetch(`${GHL_BASE}/contacts/${tracking.contactId}`, { headers: ghlHeaders() });
          if (contactRes.ok) {
            const contactData = await contactRes.json();
            const cf = (contactData.contact?.customFields ?? []).find((f: any) => f.id === HOUR_CF.FULL_LENGTH_COUNT);
            currentCount = parseInt(cf?.fieldValueString ?? '0', 10) || 0;
          }
        }
        await moveStageForFullLength(tracking.opportunityId, tracking.contactId, currentCount + 1, studentName);
      } else {
        await moveStageForCheckin(tracking.opportunityId, checkInType, studentName);
      }
    }

    if (checkInType === 'Onboarding Call' && weeklyCheckinTime && tracking?.contactId) {
      await saveWeeklyCheckinTime(tracking.contactId, weeklyCheckinTime);
    }

    return NextResponse.json({ ok: true, checkinId });
  } catch (err) {
    console.error('[ssc-log-checkin]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
