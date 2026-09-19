/**
 * GoHighLevel (GHL) Support sub-account helpers.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';

export const SUPPORT_LOCATION_ID = process.env.GHL_SUPPORT_LOCATION_ID ?? 'T4M5UHtoDZkcVAK31IFA';
export const PIPELINE_ID = 'a9Ytm6ovrr5OK9PHJGrJ'; // Student Fulfillment

export const STAGES = {
  NEW_ENROLLMENT:                '79095236-7c28-4684-b7ce-29d03e2d1c86',
  ONBOARDING_FORM_COMPLETED:     'eb217c7e-1f20-4a6d-aeec-f5123fe625db',
  DIAGNOSTIC_COMPLETED:          'f145c10b-bd9f-4794-ab8b-1d3cdc6c3707',
  ONBOARDING_CALL_COMPLETED:     'e3af64f6-0af3-487f-aa5c-f8b05f3a84a3',
  FIRST_CHECKIN_COMPLETED:       '34126179-af56-4feb-969d-aec6dd9b6547',
  SESSION3_CHECKIN_COMPLETED:    '22ddfa4c-a618-467f-b894-980d2d2ef4af',
  ACTIVE:                        '99803c34-071c-476c-a513-e3789816bf85',
  PHASE_1_COMPLETED:             '3294f8d5-ff1c-4368-b0a0-17c3bf0cccc5',
  PHASE_2_COMPLETED:             '0f27807f-987a-44a4-9e3e-6399c4f73ff4',
  PHASE_3_COMPLETED:             'd3e839e1-1128-4308-9d51-93b8f2b7dd0d',
  PHASE_4_COMPLETED:             'd4454fd6-e20f-476d-896b-d4ad2c55c021',
  LOW_HOURS:                     '54e8aab9-ddd4-40d9-ab0a-95a7fb753c23',
  RENEWAL_CONVERSATION:          'e0f8ffd5-6755-4d89-b625-3e288b76edeb',
  TEST_DAY_CHECKIN_COMPLETED:    'b3731eaf-3b6f-4db2-9369-d0665f7f6e03',
  TEST_RESULT_CHECKIN_COMPLETED: 'eefacac9-3cbd-46ba-a711-ac24bc00a16c',
  COMPLETED:                     '1d564cc5-69d6-4f36-8b67-e1556c907cc3',
  CANCELLED:                     '36117d01-5e63-4fde-8e8a-c9c00240baee',
  GUARANTEE_CASE:                '4d31767c-c855-41ea-982c-4f4c5f0f3c25',
};

const CF = {
  STUDENT_NAME:    'SVWWOw5yr7q7POnmp3eY',
  STUDENT_EMAIL:   'BFQ9zkYahPjB5IceaP4f',
  STUDENT_PHONE:   'LQhunOHHckolMaPdVyaY',
  CURRENT_SCORE:   '2rY0PdPWokY0S4dEFGiX',
  TARGET_SCORE:    'lTC9zj3Uh2lhOLSKf0GI',
  PARENT_NAME:     'VU2ma6BQHbOHwwAe85WS',
  PARENT_EMAIL:    'JYQAP9bm1eYPcO7t1jyV',
  PARENT_PHONE:    '4R342q57DbqMAmbMQ2SO',
  SESSIONS_PER_WK: 'u6MJJujMhwiGKs7m9IPN',
  AVAILABILITY:    'nHsEh70Hs2ClIkFNHAQS',
  START_DATE:      'GCoTG1MOp7eerdcCfgm4',
  HAS_GUARANTEE:   'arP6vVOBlG9XsxAgz8mJ',
  ENROLLMENT_DATE: '4ixT6RiixzxRbEByTnSK',
  TUTOR_ASSIGNED:  'XpaZqqCtnM0UayvN8WwM',
};

const RIA_USER_ID = 'VgMjFpm3Yq7Cm8uFYCYh';

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || '' };
}

function cf(id: string, value: string) {
  return { id, field_value: value };
}

export interface EnrollmentData {
  studentName:       string;
  studentEmail:      string;
  studentPhone?:     string;
  grade?:            string;
  currentScore?:     string;
  targetScore?:      string;
  parentName:        string;
  parentEmail:       string;
  parentPhone?:      string;
  packageHours?:     string;
  sessionFrequency?: string;
  preferredDays?:    string;
  preferredTime?:    string;
  targetStartDate?:  string;
  hasGuarantee?:     string;
  gameplanUrl?:      string;
  notes?:            string;
  setterName?:       string;
  closerName?:       string;
}

export async function upsertSupportContact(data: EnrollmentData): Promise<string | null> {
  if (!process.env.GHL_SUPPORT_API_KEY) return null;
  try {
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${SUPPORT_LOCATION_ID}&email=${encodeURIComponent(data.parentEmail)}`,
      { headers: headers() },
    );
    const existingId: string | null = searchRes.ok ? ((await searchRes.json())?.contact?.id ?? null) : null;
    const { firstName, lastName } = splitName(data.parentName);
    const availability = [data.preferredDays, data.preferredTime].filter(Boolean).join(' ');
    const today = new Date().toISOString().split('T')[0];
    const customFields = [
      cf(CF.STUDENT_NAME, data.studentName),
      cf(CF.STUDENT_EMAIL, data.studentEmail),
      cf(CF.PARENT_NAME, data.parentName),
      cf(CF.PARENT_EMAIL, data.parentEmail),
      cf(CF.ENROLLMENT_DATE, today),
      ...(data.studentPhone     ? [cf(CF.STUDENT_PHONE, data.studentPhone)]    : []),
      ...(data.parentPhone      ? [cf(CF.PARENT_PHONE, data.parentPhone)]      : []),
      ...(data.currentScore     ? [cf(CF.CURRENT_SCORE, data.currentScore)]    : []),
      ...(data.targetScore      ? [cf(CF.TARGET_SCORE, data.targetScore)]      : []),
      ...(data.sessionFrequency ? [cf(CF.SESSIONS_PER_WK, data.sessionFrequency)] : []),
      ...(availability          ? [cf(CF.AVAILABILITY, availability)]          : []),
      ...(data.targetStartDate  ? [cf(CF.START_DATE, data.targetStartDate)]    : []),
      ...(data.hasGuarantee     ? [cf(CF.HAS_GUARANTEE, data.hasGuarantee === 'Yes' ? 'Yes' : 'No')] : []),
      ...(data.packageHours     ? [
        { id: HOUR_CF.HOURS_PURCHASED, field_value: data.packageHours },
        { id: HOUR_CF.HOURS_REMAINING, field_value: data.packageHours },
        { id: HOUR_CF.HOURS_COMPLETED,    field_value: '0' },
        { id: HOUR_CF.SESSIONS_COMPLETED, field_value: '0' },
      ] : []),
    ];
    if (existingId) {
      await fetch(`${GHL_BASE}/contacts/${existingId}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ firstName, lastName, phone: data.parentPhone, tags: ['new-enrollment'], customFields }),
      });
      return existingId;
    }
    const res = await fetch(`${GHL_BASE}/contacts/`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ firstName, lastName, email: data.parentEmail, phone: data.parentPhone, locationId: SUPPORT_LOCATION_ID, tags: ['new-enrollment'], customFields }),
    });
    if (!res.ok) { console.error('[ghl] create failed:', await res.text()); return null; }
    return (await res.json())?.contact?.id ?? null;
  } catch (err) { console.error('[ghl] upsertSupportContact:', err); return null; }
}

export async function createEnrollmentOpportunity(contactId: string, studentName: string): Promise<string | null> {
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ pipelineId: PIPELINE_ID, pipelineStageId: STAGES.NEW_ENROLLMENT, contactId, name: studentName, status: 'open', locationId: SUPPORT_LOCATION_ID }),
    });
    if (!res.ok) { console.error('[ghl] create opp failed:', await res.text()); return null; }
    return (await res.json())?.opportunity?.id ?? null;
  } catch (err) { console.error('[ghl] createEnrollmentOpportunity:', err); return null; }
}

export async function createSupportTask(contactId: string, title: string, dueHours = 24): Promise<void> {
  try {
    const dueDate = new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tasks`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ title, dueDate, status: 'incompleted', assignedTo: RIA_USER_ID }),
    });
    if (!res.ok) console.error('[ghl] createTask failed:', await res.text());
  } catch (err) { console.error('[ghl] createSupportTask:', err); }
}

export async function findSupportContact(email: string): Promise<{ contactId: string; opportunityId: string | null } | null> {
  try {
    const res = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${SUPPORT_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const contact = (await res.json())?.contact;
    if (!contact?.id) return null;
    const oppRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&contact_id=${contact.id}&limit=1`,
      { headers: headers() },
    );
    const opportunityId = oppRes.ok ? ((await oppRes.json())?.opportunities?.[0]?.id ?? null) : null;
    return { contactId: contact.id, opportunityId };
  } catch (err) { console.error('[ghl] findSupportContact:', err); return null; }
}

export async function moveOpportunityStage(opportunityId: string, stageId: string): Promise<void> {
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ pipelineStageId: stageId }),
    });
    if (!res.ok) console.error('[ghl] moveStage failed:', await res.text());
  } catch (err) { console.error('[ghl] moveOpportunityStage:', err); }
}

export async function setTutorAssigned(contactId: string, tutorName: string): Promise<void> {
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ customFields: [cf(CF.TUTOR_ASSIGNED, tutorName)] }),
    });
  } catch (err) { console.error('[ghl] setTutorAssigned:', err); }
}

/** Fetch all students currently in the "Onboarding Call Completed" stage (pending tutor matching) */
export async function getStudentsInMatchingStage(): Promise<MatchQueueStudent[]> {
  try {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&pipeline_id=${PIPELINE_ID}&pipeline_stage_id=${STAGES.ONBOARDING_CALL_COMPLETED}&limit=50`,
      { headers: headers(), cache: 'no-store' },
    );
    if (!res.ok) return [];
    const { opportunities = [] } = await res.json();
    return opportunities.map((opp: any) => {
      const contact = opp.contact ?? {};
      const getCustomField = (id: string) =>
        (contact.customFields ?? []).find((f: any) => f.id === id)?.fieldValueString ?? '';
      return {
        opportunityId:   opp.id,
        contactId:       contact.id ?? '',
        studentName:     getCustomField(CF.STUDENT_NAME) || opp.name || 'Unknown',
        studentEmail:    getCustomField(CF.STUDENT_EMAIL),
        parentEmail:     getCustomField(CF.PARENT_EMAIL),
        parentName:      getCustomField(CF.PARENT_NAME),
        currentScore:    getCustomField(CF.CURRENT_SCORE),
        targetScore:     getCustomField(CF.TARGET_SCORE),
        availability:    getCustomField(CF.AVAILABILITY),
        sessionsPerWeek: getCustomField(CF.SESSIONS_PER_WK),
        startDate:       getCustomField(CF.START_DATE),
        hasGuarantee:    getCustomField(CF.HAS_GUARANTEE),
        enrolledAt:      opp.createdAt ?? '',
      } as MatchQueueStudent;
    });
  } catch (err) { console.error('[ghl] getStudentsInMatchingStage:', err); return []; }
}

export async function findContactByStudentName(studentName: string): Promise<{
  contactId: string;
  parentName: string;
  parentPhone: string;
  studentPhone: string;
} | null> {
  try {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&q=${encodeURIComponent(studentName)}&limit=5`,
      { headers: headers(), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const { opportunities = [] } = await res.json();
    if (!opportunities.length) return null;
    const opp = opportunities[0];
    const contact = opp.contact ?? {};
    const getCustomField = (id: string) =>
      (contact.customFields ?? []).find((f: any) => f.id === id)?.fieldValueString ?? '';
    return {
      contactId:   contact.id ?? '',
      parentName:  getCustomField(CF.PARENT_NAME) || `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
      parentPhone: contact.phone || getCustomField(CF.PARENT_PHONE),
      studentPhone: getCustomField(CF.STUDENT_PHONE),
    };
  } catch (err) { console.error('[ghl] findContactByStudentName:', err); return null; }
}

// ─── Hour & progress tracking field IDs ──────────────────────────────────────
export const HOUR_CF = {
  HOURS_PURCHASED:    'etFhJwmUHaXckNDl0QMW',
  HOURS_COMPLETED:    'VLz7JSx5KLXLIp7e6vFx',
  HOURS_REMAINING:    'D7HseGnpqkc2i2hqrhRd',
  SESSIONS_COMPLETED: 'W9EtK6usUyCjMROF3MpW',
  FULL_LENGTH_COUNT:  '2MNYg2r8OTDCOS6RHNSx',
  PROGRAM_STATUS:     '2d2VpJg34TL328GRbzo7',
};

export async function getContactForTracking(studentName: string): Promise<{
  contactId:        string;
  opportunityId:    string | null;
  currentStageId:   string;
  hoursPurchased:   number;
  hoursCompleted:   number;
  hoursRemaining:   number;
  sessionsCompleted:number;
} | null> {
  try {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${SUPPORT_LOCATION_ID}&q=${encodeURIComponent(studentName)}&limit=5`,
      { headers: headers(), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const { opportunities = [] } = await res.json();
    if (!opportunities.length) return null;
    const opp     = opportunities[0];
    const contact = opp.contact ?? {};
    const getNum  = (id: string) =>
      parseFloat((contact.customFields ?? []).find((f: any) => f.id === id)?.fieldValueString ?? '0') || 0;
    return {
      contactId:         contact.id ?? '',
      opportunityId:     opp.id ?? null,
      currentStageId:    opp.pipelineStageId ?? '',
      hoursPurchased:    getNum(HOUR_CF.HOURS_PURCHASED),
      hoursCompleted:    getNum(HOUR_CF.HOURS_COMPLETED),
      hoursRemaining:    getNum(HOUR_CF.HOURS_REMAINING),
      sessionsCompleted: Math.round(getNum(HOUR_CF.SESSIONS_COMPLETED)),
    };
  } catch (err) { console.error('[ghl] getContactForTracking:', err); return null; }
}

export async function updateProgramStatus(contactId: string, status: 'Active' | 'At Risk' | 'Pause' | 'Completed' | 'Cancelled'): Promise<void> {
  if (!HOUR_CF.PROGRAM_STATUS) return;
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ customFields: [{ id: HOUR_CF.PROGRAM_STATUS, field_value: status }] }),
    });
  } catch (err) { console.error('[ghl] updateProgramStatus:', err); }
}

export async function updateHourTracking(
  contactId:         string,
  opportunityId:     string | null,
  currentStageId:    string,
  hoursCompleted:    number,
  hoursRemaining:    number,
  sessionsCompleted: number,
  sessionStatus?:    'green' | 'yellow' | 'red',
): Promise<void> {
  try {
    const cfUpdates: { id: string; field_value: string }[] = [
      { id: HOUR_CF.HOURS_COMPLETED,    field_value: hoursCompleted.toString() },
      { id: HOUR_CF.HOURS_REMAINING,    field_value: hoursRemaining.toString() },
      { id: HOUR_CF.SESSIONS_COMPLETED, field_value: sessionsCompleted.toString() },
    ];

    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ customFields: cfUpdates }),
    });

    // Yellow/Red status → flag as At Risk in Program Status field (not pipeline)
    if (sessionStatus === 'yellow' || sessionStatus === 'red') {
      await updateProgramStatus(contactId, 'At Risk');
    } else if (sessionStatus === 'green') {
      await updateProgramStatus(contactId, 'Active');
    }

    if (!opportunityId) return;

    // Hours-based stage moves
    let targetStage: string | null = null;
    if (hoursRemaining <= 0)       targetStage = STAGES.RENEWAL_CONVERSATION;
    else if (hoursRemaining <= 10) targetStage = STAGES.LOW_HOURS;

    if (targetStage && targetStage !== currentStageId) {
      await moveOpportunityStage(opportunityId, targetStage);
    }
  } catch (err) { console.error('[ghl] updateHourTracking:', err); }
}

/** Move stage based on HiScores fullLength attempt count */
export async function moveStageForFullLength(opportunityId: string, contactId: string, attemptCount: number): Promise<void> {
  const phaseStages: Record<number, string> = {
    1: STAGES.DIAGNOSTIC_COMPLETED,
    2: STAGES.PHASE_1_COMPLETED,
    3: STAGES.PHASE_2_COMPLETED,
    4: STAGES.PHASE_3_COMPLETED,
    5: STAGES.PHASE_4_COMPLETED,
  };
  const targetStage = phaseStages[attemptCount];
  if (!targetStage) return;

  if (HOUR_CF.FULL_LENGTH_COUNT) {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ customFields: [{ id: HOUR_CF.FULL_LENGTH_COUNT, field_value: attemptCount.toString() }] }),
    });
  }
  await moveOpportunityStage(opportunityId, targetStage);
}

/** Move stage when SSC submits a check-in log for a specific milestone */
export async function moveStageForCheckin(opportunityId: string, checkinType: string): Promise<void> {
  const stageMap: Record<string, string> = {
    'Onboarding Call':  STAGES.ONBOARDING_CALL_COMPLETED,
    'Post-Session 1':   STAGES.FIRST_CHECKIN_COMPLETED,
    'Post-Session 3':   STAGES.SESSION3_CHECKIN_COMPLETED,
    'Post-SAT Day':     STAGES.TEST_DAY_CHECKIN_COMPLETED,
    'Post-SAT Results': STAGES.TEST_RESULT_CHECKIN_COMPLETED,
  };
  const targetStage = stageMap[checkinType];
  if (!targetStage) return;
  await moveOpportunityStage(opportunityId, targetStage);

  // After 3-session check-in is logged, immediately advance to Active
  if (checkinType === 'Post-Session 3') {
    await moveOpportunityStage(opportunityId, STAGES.ACTIVE);
  }
}

export async function sendGhlSms(contactId: string, message: string): Promise<void> {
  try {
    const res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ type: 'SMS', contactId, locationId: SUPPORT_LOCATION_ID, message }),
    });
    if (!res.ok) console.error('[ghl] sendGhlSms failed:', await res.text());
  } catch (err) { console.error('[ghl] sendGhlSms:', err); }
}

export interface MatchQueueStudent {
  opportunityId:   string;
  contactId:       string;
  studentName:     string;
  studentEmail:    string;
  parentEmail:     string;
  parentName:      string;
  currentScore:    string;
  targetScore:     string;
  availability:    string;
  sessionsPerWeek: string;
  startDate:       string;
  hasGuarantee:    string;
  enrolledAt:      string;
}
