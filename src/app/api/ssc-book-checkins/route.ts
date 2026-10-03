import { NextResponse } from 'next/server';
import { createGhlAppointment, findContactByEmail, BOOKING_CALENDARS } from '@/lib/ghl-support';

// Convert a local date+time string to UTC ISO using the given IANA timezone
function localToUtcIso(dateStr: string, timeStr: string, timezone: string): string {
  // dateStr: "2026-10-12", timeStr: "17:00"
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Build a Date that represents the LOCAL time in the given timezone
  // We do this by finding the UTC time that corresponds to local midnight,
  // then adding hours/minutes.
  const naive = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

  // Get the offset between UTC and the target timezone AT that naive time
  const utcStr  = naive.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr   = naive.toLocaleString('en-US', { timeZone: timezone });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();

  return new Date(naive.getTime() + offsetMs).toISOString();
}

// Get next occurrence of a weekday (as a Date with no time component)
function nextWeekdayDate(dayName: string): Date {
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const targetIdx = DAYS.findIndex(d => d.toLowerCase() === dayName.toLowerCase());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentIdx = today.getDay();
  const daysUntil = (targetIdx - currentIdx + 7) % 7;
  const result = new Date(today);
  result.setDate(today.getDate() + (daysUntil === 0 ? 0 : daysUntil));
  return result;
}

// Build an array of {startIso, endIso} for weekly recurring events
function buildWeeklySlots(
  dayName: string,
  timeStr: string,    // "HH:MM" 24h
  timezone: string,
  durationMins: number,
  count: number,
): Array<{ startIso: string; endIso: string }> {
  const firstDate = nextWeekdayDate(dayName);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(firstDate);
    d.setDate(d.getDate() + i * 7);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startIso = localToUtcIso(dateStr, timeStr, timezone);
    const endIso   = new Date(new Date(startIso).getTime() + durationMins * 60_000).toISOString();
    return { startIso, endIso };
  });
}

// Build a single {startIso, endIso} for a one-time event
function buildSingleSlot(dateStr: string, timeStr: string, timezone: string, durationMins: number) {
  const startIso = localToUtcIso(dateStr, timeStr, timezone);
  const endIso   = new Date(new Date(startIso).getTime() + durationMins * 60_000).toISOString();
  return { startIso, endIso };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      contactId,       // student GHL contact ID
      studentName,
      parentName,
      parentEmail,
      // Weekly student check-in
      studentCheckinDay,
      studentCheckinTime,   // "HH:MM"
      studentCheckinTz,
      // Weekly parent check-in
      parentCheckinDay,
      parentCheckinTime,
      parentCheckinTz,
      // Post-session 1
      postSession1Date,
      postSession1Time,
      postSession1Tz,
      // Post-session 3
      postSession3Date,
      postSession3Time,
      postSession3Tz,
    } = body;

    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

    // Find parent contact
    const parentContactId = await findContactByEmail(parentEmail);

    const results: Record<string, number | string> = {};
    const errors: string[] = [];

    // 1. Weekly student check-ins (12 weeks)
    if (studentCheckinDay && studentCheckinTime && studentCheckinTz) {
      const slots = buildWeeklySlots(studentCheckinDay, studentCheckinTime, studentCheckinTz, BOOKING_CALENDARS.SSC_CHECKIN.durationMins, 12);
      let booked = 0;
      for (const slot of slots) {
        try {
          await createGhlAppointment({
            calendarId: BOOKING_CALENDARS.SSC_CHECKIN.id,
            userId:     BOOKING_CALENDARS.SSC_CHECKIN.userId,
            contactId,
            startIso:   slot.startIso,
            endIso:     slot.endIso,
            title:      `${studentName} × StudyCore Weekly Check-In`,
            timezone:   studentCheckinTz,
          });
          booked++;
        } catch (e: unknown) {
          errors.push(`Student check-in slot: ${e instanceof Error ? e.message : String(e)}`);
          break;
        }
      }
      results.studentCheckinsBooked = booked;
    }

    // 2. Weekly parent check-ins (12 weeks)
    if (parentCheckinDay && parentCheckinTime && parentCheckinTz && parentContactId) {
      const slots = buildWeeklySlots(parentCheckinDay, parentCheckinTime, parentCheckinTz, BOOKING_CALENDARS.SSC_CHECKIN.durationMins, 12);
      let booked = 0;
      for (const slot of slots) {
        try {
          await createGhlAppointment({
            calendarId: BOOKING_CALENDARS.SSC_CHECKIN.id,
            userId:     BOOKING_CALENDARS.SSC_CHECKIN.userId,
            contactId:  parentContactId,
            startIso:   slot.startIso,
            endIso:     slot.endIso,
            title:      `${parentName} × StudyCore Weekly Parent Check-In`,
            timezone:   parentCheckinTz,
          });
          booked++;
        } catch (e: unknown) {
          errors.push(`Parent check-in slot: ${e instanceof Error ? e.message : String(e)}`);
          break;
        }
      }
      results.parentCheckinsBooked = booked;
    } else if (!parentContactId && parentEmail) {
      results.parentContactWarning = 'Parent contact not found in GHL — parent check-ins skipped';
    }

    // 3. Post-session 1 check-in (single)
    if (postSession1Date && postSession1Time && postSession1Tz) {
      try {
        const slot = buildSingleSlot(postSession1Date, postSession1Time, postSession1Tz, BOOKING_CALENDARS.SSC_CHECKIN.durationMins);
        await createGhlAppointment({
          calendarId: BOOKING_CALENDARS.SSC_CHECKIN.id,
          userId:     BOOKING_CALENDARS.SSC_CHECKIN.userId,
          contactId,
          startIso:   slot.startIso,
          endIso:     slot.endIso,
          title:      `${studentName} × Post-Session 1 Check-In`,
          timezone:   postSession1Tz,
        });
        results.postSession1 = 'booked';
      } catch (e: unknown) {
        errors.push(`Post-session 1: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 4. Post-session 3 check-in (single)
    if (postSession3Date && postSession3Time && postSession3Tz) {
      try {
        const slot = buildSingleSlot(postSession3Date, postSession3Time, postSession3Tz, BOOKING_CALENDARS.SESSION3.durationMins);
        await createGhlAppointment({
          calendarId: BOOKING_CALENDARS.SESSION3.id,
          userId:     BOOKING_CALENDARS.SESSION3.userId,
          contactId,
          startIso:   slot.startIso,
          endIso:     slot.endIso,
          title:      `${studentName} × Post-Session 3 Check-In`,
          timezone:   postSession3Tz,
        });
        results.postSession3 = 'booked';
      } catch (e: unknown) {
        errors.push(`Post-session 3: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
