import { NextRequest, NextResponse } from 'next/server';
import { encodeSchedule, type DayAbbrev } from '@/lib/ssc-schedule';
import { postToSchedulingChannel } from '@/lib/slack';
import { broadcastToTutors } from '@/lib/tutor-broadcast';
import { moveOpportunityStage, STAGES } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const CF_AVAILABILITY    = 'nHsEh70Hs2ClIkFNHAQS';
const CF_SESSIONS_PER_WK = 'u6MJJujMhwiGKs7m9IPN';
const CF_START_DATE      = 'GCoTG1MOp7eerdcCfgm4';

// Contact-level custom field IDs needed for broadcast
const CF_TUTOR_ASSIGNED  = 'XpaZqqCtnM0UayvN8WwM';
const CF_STUDENT_EMAIL   = 'BFQ9zkYahPjB5IceaP4f';
const CF_STUDENT_PHONE   = 'LQhunOHHckolMaPdVyaY';
const CF_CURRENT_SCORE   = '2rY0PdPWokY0S4dEFGiX';
const CF_TARGET_SCORE    = 'lTC9zj3Uh2lhOLSKf0GI';
const CF_HOURS_PURCHASED = 'etFhJwmUHaXckNDl0QMW';

const TZ_ABBR: Record<string, string> = {
  'America/New_York':    'ET',
  'America/Chicago':     'CT',
  'America/Denver':      'MT',
  'America/Phoenix':     'MT',
  'America/Los_Angeles': 'PT',
  'America/Anchorage':   'AKT',
  'Pacific/Honolulu':    'HT',
};

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      contactId:          string;
      opportunityId?:     string;
      sessionDays:        string[];
      sessionDurationHrs: number;
      sessionTimes?:      Record<string, string>;
      sessionTimezone?:   string;
      startDate?:         string;
      studentName?:       string;
      tutorName?:         string;
    };

    const { contactId, opportunityId, sessionDays, sessionDurationHrs, sessionTimes, sessionTimezone, startDate, studentName, tutorName } = body;

    if (!contactId || !Array.isArray(sessionDays) || sessionDays.length === 0) {
      return NextResponse.json({ error: 'Missing contactId or sessionDays' }, { status: 400 });
    }

    const availabilityValue  = encodeSchedule(sessionDays as DayAbbrev[], sessionDurationHrs ?? 1.5, sessionTimes as Partial<Record<DayAbbrev, string>> | undefined, sessionTimezone);
    const sessionsPerWkValue = sessionDays.length.toString();

    const customFields: { id: string; field_value: string }[] = [
      { id: CF_AVAILABILITY,    field_value: availabilityValue },
      { id: CF_SESSIONS_PER_WK, field_value: sessionsPerWkValue },
    ];
    if (startDate) {
      customFields.push({ id: CF_START_DATE, field_value: startDate });
    }

    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ customFields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[ssc-update-schedule] GHL error:', text);
      return NextResponse.json({ error: 'GHL update failed', detail: text }, { status: 502 });
    }

    // Fetch full contact to check tutor assignment status and get broadcast data
    const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: headers() });
    if (contactRes.ok) {
      const contactJson = await contactRes.json();
      const contact = contactJson.contact ?? contactJson ?? {};
      const gcf = (id: string) => {
        const f = (contact.customFields ?? []).find((f: any) => f.id === id);
        const v = f?.fieldValueString ?? f?.value ?? f?.fieldValue ?? '';
        return (!v || v === 'null') ? '' : String(v);
      };

      const tutorAssigned = gcf(CF_TUTOR_ASSIGNED);
      if (!tutorAssigned) {
        // No tutor yet — fire the broadcast automatically
        broadcastToTutors({
          studentName:  studentName ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
          studentEmail: gcf(CF_STUDENT_EMAIL) || contact.email || '',
          studentPhone: gcf(CF_STUDENT_PHONE) || contact.phone || '',
          availability: availabilityValue,
          hoursPerWeek: sessionDays.length.toString(),
          totalHours:   gcf(CF_HOURS_PURCHASED) || '?',
          startDate:    startDate || '',
          testDate:     '',
          currentScore: gcf(CF_CURRENT_SCORE),
          targetScore:  gcf(CF_TARGET_SCORE),
        }).catch(err => console.error('[ssc-update-schedule] broadcast error:', err));
      }
    }

    // Advance pipeline stage to Onboarding Call Completed
    if (opportunityId) {
      moveOpportunityStage(opportunityId, STAGES.ONBOARDING_CALL_COMPLETED)
        .catch(err => console.error('[ssc-update-schedule] stage advance error:', err));
    }

    // Fire Slack notification to scheduling manager
    const tzAbbr = sessionTimezone ? (TZ_ABBR[sessionTimezone] ?? sessionTimezone) : '';
    const daysStr = sessionTimes
      ? sessionDays.map(d => `${d}${sessionTimes[d] ? ` @ ${sessionTimes[d]}` : ''}`).join(', ')
      : sessionDays.join(', ');
    const timeStr = daysStr; // already includes times per day
    const durStr  = `${sessionDurationHrs} hr${sessionDurationHrs !== 1 ? 's' : ''}`;
    const lines = [
      `📅 *Schedule Set — ${studentName ?? contactId}*`,
      `Tutor: ${tutorName ?? 'TBD'}`,
      `Sessions: ${timeStr}${tzAbbr ? ` (${tzAbbr})` : ''}`,
      `Duration: ${durStr}`,
      startDate ? `Start Date: ${startDate}` : null,
    ].filter(Boolean).join('\n');

    await postToSchedulingChannel(lines);

    return NextResponse.json({ ok: true, availability: availabilityValue, sessionsPerWeek: sessionsPerWkValue });
  } catch (err) {
    console.error('[ssc-update-schedule] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
