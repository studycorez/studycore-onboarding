/**
 * Daily cron — fires SAT-day and post-results booking link SMS.
 * Runs every day at 1 PM ET (18:00 UTC). SAT is always on Saturday.
 * - Test Date = today → send "SAT is done, book your debrief" SMS
 * - Test Date + 14 days = today → send "results are in, book your review" SMS
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
const TEST_DATE_CF = '7ud13HnIpIJlNaR5uasz'; // Test Date custom field
const STUDENT_NAME_CF = 'SVWWOw5yr7q7POnmp3eY';
const STAGE_ACTIVE = '6f509959-ee9b-430b-aadd-18e7fdb915be';
const STAGE_PRE_CHECKIN = '0f27807f-987a-44a4-9e3e-6399c4f73ff4';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayET();
  const twoWeeksAgo = addDays(today, -14);

  // Fetch all active contacts with a Test Date set
  let page = 1;
  let hasMore = true;
  const triggered: string[] = [];

  while (hasMore) {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=a9Ytm6ovrr5OK9PHJGrJ&limit=100&page=${page}`,
      { headers: ghlHeaders(), cache: 'no-store' },
    );
    if (!res.ok) break;

    const { opportunities = [], meta } = await res.json();
    hasMore = meta?.currentPage < meta?.totalPages;
    page++;

    for (const opp of opportunities) {
      const contact = opp.contact ?? {};
      const getField = (id: string) =>
        (contact.customFields ?? []).find((f: any) => f.id === id)?.fieldValueString ?? '';

      const testDate    = getField(TEST_DATE_CF)?.split('T')[0];
      const studentName = getField(STUDENT_NAME_CF) || opp.name || '';

      if (!testDate || !studentName) continue;

      // SAT day — fire at 1 PM ET (after SAT ends ~12:30 PM)
      if (testDate === today) {
        await sendCheckinBookingLink(contact.id, studentName, 'Pre-SAT Day');
        triggered.push(`SAT day: ${studentName}`);
      }

      // Results day — 14 days after SAT
      if (testDate === twoWeeksAgo) {
        await sendCheckinBookingLink(contact.id, studentName, 'Post-SAT Results');
        triggered.push(`Results: ${studentName}`);
      }
    }
  }

  if (triggered.length > 0) {
    await postToSlack(`📅 SAT cron: ${triggered.length} booking link(s) sent\n${triggered.map(t => `• ${t}`).join('\n')}`);
  }

  return NextResponse.json({ ok: true, triggered });
}
