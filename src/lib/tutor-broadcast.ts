/**
 * Tutor broadcast — fires when a student onboarding form is submitted.
 * Fetches all active tutors from Airtable and POSTs to the GHL inbound
 * webhook once per tutor, which triggers the "New Student Tutor Broadcast"
 * workflow to send them an SMS + email.
 */

const AIRTABLE_BASE    = 'appTAp5csw4vqR6NA';
const GHL_WEBHOOK_URL  = 'https://services.leadconnectorhq.com/hooks/T4M5UHtoDZkcVAK31IFA/webhook-trigger/3c4300ec-a9da-42b3-8412-7b40c10f7abd';

export interface BroadcastData {
  availability:  string;
  hoursPerWeek:  string;
  totalHours:    string;
  startDate:     string;
  testDate:      string;
  currentScore:  string;
  targetScore:   string;
}

export async function broadcastToTutors(data: BroadcastData): Promise<void> {
  const token = process.env.AIRTABLE_API_TOKEN;
  if (!token) {
    console.error('[broadcast] AIRTABLE_API_TOKEN not set — skipping tutor broadcast');
    return;
  }

  // Fetch all active tutors from Airtable
  const atRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/Tutors?fields[]=Name&fields[]=Email&fields[]=Active&filterByFormula={Active}=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!atRes.ok) {
    console.error('[broadcast] Airtable fetch failed:', await atRes.text());
    return;
  }

  const tutors: any[] = (await atRes.json()).records ?? [];
  console.log(`[broadcast] sending to ${tutors.length} active tutors`);

  // POST to GHL inbound webhook once per tutor
  await Promise.allSettled(
    tutors.map((t: any) => {
      const tutorName  = String(t.fields.Name  ?? '').trim();
      const tutorEmail = String(t.fields.Email ?? '').trim();
      if (!tutorEmail) return Promise.resolve();

      return fetch(GHL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_name:             tutorName,
          tutor_email:            tutorEmail,
          student_availability:   data.availability,
          student_hours_per_week: data.hoursPerWeek,
          student_total_hours:    data.totalHours,
          student_start_date:     data.startDate,
          student_test_date:      data.testDate,
          student_current_score:  data.currentScore,
          student_target_score:   data.targetScore,
        }),
      });
    }),
  );
}
