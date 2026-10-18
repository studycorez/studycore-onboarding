/**
 * Check-in booking link automation.
 * Sends SMS to parent + student with the SSC booking link, pre-tagged by check-in type.
 *
 * Phone check-ins use SSC_PHONE_BOOKING_URL.
 * Phase check-ins (post-practice test) use SSC_ZOOM_BOOKING_URL.
 */

import { sendGhlSms, findContactByStudentName } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

// Zoom check-in types — all others use the phone call URL
const ZOOM_TYPES = new Set(['Post-Practice Test']);

function getBookingUrl(checkInType: string): string {
  return ZOOM_TYPES.has(checkInType)
    ? (process.env.SSC_ZOOM_BOOKING_URL ?? '')
    : (process.env.SSC_PHONE_BOOKING_URL ?? '');
}

function getMessages(checkInType: string): { parent: string; student: string } | null {
  const url = getBookingUrl(checkInType);
  const all: Record<string, { parent: string; student: string }> = {
    'Post-Session 1': {
      parent:  `Hi {{parent}} — {{student}}'s first StudyCore session is done! Our SSC would love to connect for a quick check-in. Book a time: ${url}`,
      student: `Hi {{student}} — great first session! Your SSC wants to check in. Book a time: ${url}`,
    },
    'Post-Session 3': {
      parent:  `Hi {{parent}} — {{student}} has completed 3 sessions! Time for your check-in call. Book a time: ${url}`,
      student: `Hi {{student}} — 3 sessions in! Your SSC check-in is due. Book a time: ${url}`,
    },
    'Post-Practice Test': {
      parent:  `Hi {{parent}} — {{student}} just finished a full-length practice SAT. Let's review the results together on a Zoom call. Book here: ${url}`,
      student: `Hi {{student}} — practice test done! Let's go over your results on a Zoom call. Book here: ${url}`,
    },
    'Pre-SAT Day': {
      parent:  `Hi {{parent}} — {{student}}'s SAT is today! Once it's over, let's debrief. Book your call: ${url}`,
      student: `Hi {{student}} — you just finished your SAT! Let's debrief. Book your call: ${url}`,
    },
    'Post-SAT Results': {
      parent:  `Hi {{parent}} — {{student}}'s SAT results are in! Let's review them and talk next steps. Book your call: ${url}`,
      student: `Hi {{student}} — your SAT results are in! Let's go over them together. Book your call: ${url}`,
    },
    'Weekly Sync': {
      parent:  `Hi {{parent}} — time for your weekly StudyCore progress sync. Book a time with your SSC: ${url}`,
      student: `Hi {{student}} — weekly check-in time! Book with your SSC: ${url}`,
    },
  };
  return all[checkInType] ?? null;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function sendCheckinBookingLink(
  contactId: string,
  studentName: string,
  checkInType: string,
): Promise<void> {
  const bookingUrl = getBookingUrl(checkInType);
  if (!bookingUrl) {
    console.warn(`[checkin] booking URL not set for ${checkInType} — skipping SMS`);
    return;
  }

  const contact = await findContactByStudentName(studentName);
  if (!contact) {
    await postToSlack(`⚠️ Check-in trigger (${checkInType}) for *${studentName}* — couldn't find contact. No SMS sent.`);
    return;
  }

  const msgs = getMessages(checkInType);
  if (!msgs) return;

  const vars = {
    parent:  contact.parentName || 'there',
    student: studentName,
  };

  const jobs: Promise<void>[] = [];

  if (contact.parentPhone) {
    jobs.push(sendGhlSms(contact.contactId, fillTemplate(msgs.parent, vars)));
  }
  if (contact.studentPhone && contact.studentPhone !== contact.parentPhone) {
    jobs.push(sendGhlSms(contact.contactId, fillTemplate(msgs.student, vars)));
  }

  await Promise.allSettled(jobs);

  await postToSlack(`📅 Check-in booking link sent: *${studentName}* — ${checkInType} (${jobs.length} SMS)`);
}
