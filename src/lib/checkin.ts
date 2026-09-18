/**
 * Check-in booking link automation.
 * Sends SMS to parent + student with the SSC booking link, pre-tagged by check-in type.
 */

import { sendGhlSms, findContactByStudentName } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const SSC_BOOKING_URL  = process.env.SSC_BOOKING_URL  ?? '';
const TALLY_SSC_URL    = 'https://tally.so/r/kdL086';

const CHECKIN_MESSAGES: Record<string, { parent: string; student: string }> = {
  'Post-Session 1': {
    parent:  `Hi {{parent}} — {{student}}'s first StudyCore session is done! Our Student Success Coordinator would love to connect for a quick check-in. Book a time here: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — great first session! Our SSC wants to check in with you. Book a time here: ${SSC_BOOKING_URL}`,
  },
  'Post-Session 3': {
    parent:  `Hi {{parent}} — {{student}} has completed 3 sessions! Time for your check-in call with our SSC. Book a time: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — 3 sessions in! Your SSC check-in is due. Book a time: ${SSC_BOOKING_URL}`,
  },
  'Post-Practice Test': {
    parent:  `Hi {{parent}} — {{student}} just completed a full-length practice SAT. Let's review the results together. Book your check-in: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — practice test done! Let's go over your results. Book your check-in: ${SSC_BOOKING_URL}`,
  },
  'Pre-SAT Day': {
    parent:  `Hi {{parent}} — {{student}}'s SAT is today! Once it's over, let's debrief. Book your call: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — you just finished your SAT! Let's debrief. Book your call: ${SSC_BOOKING_URL}`,
  },
  'Post-SAT Results': {
    parent:  `Hi {{parent}} — {{student}}'s SAT results are in! Let's review them and talk next steps. Book your call: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — your SAT results are in! Let's go over them together. Book your call: ${SSC_BOOKING_URL}`,
  },
  'Weekly Sync': {
    parent:  `Hi {{parent}} — it's time for your weekly StudyCore progress sync. Book a time with your SSC: ${SSC_BOOKING_URL}`,
    student: `Hi {{student}} — weekly check-in time! Book with your SSC: ${SSC_BOOKING_URL}`,
  },
};

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function sendCheckinBookingLink(
  contactId: string,
  studentName: string,
  checkInType: keyof typeof CHECKIN_MESSAGES,
): Promise<void> {
  if (!SSC_BOOKING_URL) {
    console.warn('[checkin] SSC_BOOKING_URL not set — skipping booking link SMS');
    return;
  }

  const contact = await findContactByStudentName(studentName);
  if (!contact) {
    await postToSlack(`⚠️ Check-in trigger (${checkInType}) for *${studentName}* — couldn't find contact. No SMS sent.`);
    return;
  }

  const msgs = CHECKIN_MESSAGES[checkInType];
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
