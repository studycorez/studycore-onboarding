/**
 * Tally form webhook handler
 *
 * Handles submissions from three forms:
 *   OD8LXp  — New Student Deal Handoff   (fires at deal close, creates student record)
 *   b5PvVo  — Student Onboarding Form    (fires when student fills out their intake)
 *   LZlkZ1  — Parent Onboarding Form     (fires when parent fills out their intake)
 *
 * Register this endpoint in Tally → Integrations → Webhooks for each form:
 *   https://app.studycore.net/api/webhooks/tally
 *
 * After both student + parent forms are submitted, this automatically sends
 * the enrollment contract via the recovery-gameplan signing system.
 *
 * After contract is signed, the fulfillment dashboard shows a "Broadcast" button
 * for Harshil to trigger the tutor SMS blast.
 *
 * Environment variables required:
 *   TALLY_SIGNING_SECRET   — (optional) from Tally webhook settings for signature verification
 *   RECOVERY_GAMEPLAN_URL  — https://studycore-recovery-gameplan1.vercel.app
 *   RESEND_API_KEY         — for contract email notification to internal team
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// ── Form IDs ─────────────────────────────────────────────────────────────────
const FORM_DEAL_HANDOFF     = 'OD8LXp';
const FORM_STUDENT_INTAKE   = 'b5PvVo';
const FORM_PARENT_INTAKE    = 'LZlkZ1';

// ── Clients ──────────────────────────────────────────────────────────────────
function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

// ── Tally payload types ───────────────────────────────────────────────────────
interface TallyField {
  key: string;
  label: string;
  type: string;
  value: string | number | string[] | null;
  options?: { id: string; text: string }[];
}

interface TallyPayload {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    respondentId: string;
    formId: string;
    formName: string;
    createdAt: string;
    fields: TallyField[];
  };
}

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) return true; // skip if not configured
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Field extraction helpers ──────────────────────────────────────────────────
function getField(fields: TallyField[], label: string): TallyField | undefined {
  return fields.find(f => f.label?.toLowerCase().trim() === label.toLowerCase().trim());
}

function str(fields: TallyField[], label: string): string {
  return String(getField(fields, label)?.value ?? '').trim();
}

function num(fields: TallyField[], label: string): number | null {
  const v = getField(fields, label)?.value;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function arr(fields: TallyField[], label: string): string[] {
  const v = getField(fields, label)?.value;
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v) return [v];
  return [];
}

function bool(fields: TallyField[], label: string): boolean | null {
  const v = str(fields, label).toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return null;
}

// ── Parse student availability ────────────────────────────────────────────────
function parseAvailability(fields: TallyField[]): Record<string, string[]> {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const avail: Record<string, string[]> = {};
  for (const day of days) {
    const times = arr(fields, `What times work on ${day}?`).filter(t => t !== 'Not available');
    avail[day.toLowerCase()] = times;
  }
  return avail;
}

function formatAvailabilityText(avail: Record<string, string[]>): string {
  return Object.entries(avail)
    .filter(([, times]) => times.length > 0)
    .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
    .join(' | ');
}

// ── Contract auto-send ────────────────────────────────────────────────────────
async function sendStudentContract(student: Record<string, unknown>): Promise<string | null> {
  const url = process.env.RECOVERY_GAMEPLAN_URL || 'https://studycore-recovery-gameplan1.vercel.app';

  const avail = (student.availability_raw as Record<string, string[]>) ?? {};
  const sessionDaysTimes = formatAvailabilityText(avail) || 'TBD';

  // Derive weekly hours: assume 2 sessions/week × 1.5h default if not in deal data
  const dealData = (student.deal_handoff_data as Record<string, unknown>) ?? {};
  const weeklyHours = 3; // default — close enough for contract; tutor will lock in exact schedule
  const testDateStr = String(student.test_date || '');

  // Program weeks: start → test date
  let programWeeks = 12;
  const startDate = String(student.created_at || '').slice(0, 10);
  if (testDateStr && startDate) {
    const weeks = Math.round(
      (new Date(testDateStr).getTime() - Date.now()) / (7 * 24 * 3600 * 1000)
    );
    if (weeks > 0 && weeks < 52) programWeeks = weeks;
  }

  const contractData = {
    studentName:      String(student.name || ''),
    parentName:       String(student.parent_name || ''),
    hoursPurchased:   Number(student.purchased_hours || 0),
    totalPaid:        Number(student.total_paid || 0),
    testDate:         testDateStr,
    startDate,
    endDate:          testDateStr,
    sessionDaysTimes,
    weeklyHours,
    programWeeks,
    totalHours:       Number(student.purchased_hours || weeklyHours * programWeeks),
    refundPolicy:     'prorated',
    hasGuarantee:     Boolean(student.has_guarantee),
    paymentPlan:      String(dealData.payment_plan_details || student.payment_plan_details || ''),
  };

  try {
    const res = await fetch(`${url}/api/contracts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'student',
        recipientName:  String(student.parent_name || student.name || ''),
        recipientEmail: String(student.parent_email || ''),
        contractData,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[tally] contract send failed:', res.status, txt);
      return null;
    }

    const json = await res.json() as { token?: string };
    return json.token ?? null;
  } catch (err) {
    console.error('[tally] contract send error:', err);
    return null;
  }
}

// ── Form handlers ─────────────────────────────────────────────────────────────

async function handleDealHandoff(fields: TallyField[], db: ReturnType<typeof getDb>) {
  const studentName  = str(fields, 'Student Full Name');
  const studentEmail = str(fields, 'Student Email');
  const studentPhone = str(fields, 'Student Phone');
  const parentName   = str(fields, 'Parent Full Name');
  const parentEmail  = str(fields, 'Parent Email');
  const parentPhone  = str(fields, 'Parent Phone');
  const currentScore = num(fields, 'Current SAT Score (Optional)');
  const targetScore  = num(fields, 'Target SAT Score');
  const hours        = num(fields, 'Package Sold (Number of Hours)');
  const totalPaid    = num(fields, 'Amount Paid Today');
  const paymentPlan  = bool(fields, 'Payment Plan?');
  const paymentDetails = str(fields, 'Payment Plan Details');
  const hasGuarantee = bool(fields, 'Guarantee Offered?');
  const guaranteeDetails = str(fields, 'Guarantee Details');
  const startDate    = str(fields, 'Target Start Date (Optional)');
  const preferredTutor = str(fields, 'Preferred Tutor');
  const closer       = str(fields, 'Closer Name');
  const setter       = str(fields, 'Setter Name');
  const notes        = str(fields, 'Notes from Call');

  if (!studentEmail) {
    console.warn('[tally] deal handoff missing student email');
    return { ok: false, reason: 'missing_email' };
  }

  // Upsert student — create if not exists, skip if already created
  const payload = {
    name:               studentName,
    email:              studentEmail,
    phone:              studentPhone || null,
    parent_name:        parentName || null,
    parent_email:       parentEmail || null,
    parent_phone:       parentPhone || null,
    current_score:      currentScore,
    target_score:       targetScore,
    purchased_hours:    hours,
    total_paid:         totalPaid,
    payment_plan_details: paymentDetails || null,
    has_guarantee:      hasGuarantee ?? false,
    guarantee_details:  guaranteeDetails || null,
    preferred_tutor:    preferredTutor || null,
    closer_name:        closer || null,
    setter_name:        setter || null,
    additional_notes:   notes || null,
    deal_won_at:        new Date().toISOString(),
    deal_handoff_data:  Object.fromEntries(fields.map(f => [f.label, f.value])),
    status:             'active',
  };

  // Try to find existing by email
  const { data: existing } = await db
    .from('students')
    .select('id')
    .eq('email', studentEmail)
    .single();

  if (existing) {
    await db.from('students').update(payload).eq('id', existing.id);
    console.log(`[tally] deal handoff updated existing student ${existing.id}`);
  } else {
    const { error } = await db.from('students').insert([payload]);
    if (error) {
      console.error('[tally] deal handoff insert error:', error);
      return { ok: false, reason: error.message };
    }
    console.log(`[tally] deal handoff created student: ${studentEmail}`);
  }

  return { ok: true };
}

async function handleStudentForm(fields: TallyField[], db: ReturnType<typeof getDb>) {
  const email       = str(fields, 'Your email');
  const name        = str(fields, 'Your full name');
  const phone       = str(fields, 'Your phone number');
  const timezone    = str(fields, 'What time zone are you in?');
  const currentScore = num(fields, 'What was your most recent score?');
  const targetScore  = num(fields, 'What score are you going for?');
  const testDate    = str(fields, 'Which SAT date are you taking?');
  const hasAccomm   = bool(fields, 'Do you have testing accommodations?');
  const availNotes  = str(fields, 'Any other timing notes? For example specific times within a block, or weeks you\'ll be away.');
  const availability = parseAvailability(fields);

  if (!email) {
    console.warn('[tally] student form missing email');
    return { ok: false, reason: 'missing_email' };
  }

  // Find existing student (created by deal handoff)
  const { data: existing } = await db
    .from('students')
    .select('id, parent_email, purchased_hours, total_paid, has_guarantee, payment_plan_details, parent_name, name, parent_form_submitted_at')
    .eq('email', email)
    .single();

  const updates: Record<string, unknown> = {
    phone:                      phone || undefined,
    timezone:                   timezone || undefined,
    current_score:              currentScore ?? undefined,
    target_score:               targetScore ?? undefined,
    test_date:                  testDate || undefined,
    has_accommodations:         hasAccomm ?? undefined,
    availability_raw:           availability,
    availability_notes:         availNotes || undefined,
    student_form_submitted_at:  new Date().toISOString(),
    student_form_data:          Object.fromEntries(fields.map(f => [f.label, f.value])),
  };

  // Remove undefined values
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  if (existing) {
    await db.from('students').update(cleanUpdates).eq('id', existing.id);
    console.log(`[tally] student form updated ${existing.id}`);

    // Auto-send contract if we have enough deal data
    if (existing.purchased_hours && existing.parent_email) {
      const studentFull = { ...existing, ...cleanUpdates, name: name || existing.name };
      const token = await sendStudentContract(studentFull);
      if (token) {
        await db.from('students').update({
          contract_sent_at: new Date().toISOString(),
          contract_signing_token: token,
        }).eq('id', existing.id);
        console.log(`[tally] contract sent for student ${existing.id}, token: ${token}`);
      }
    }
  } else {
    // Student not created yet — create with what we have
    const { error } = await db.from('students').insert([{
      name, email, phone: phone || null, timezone: timezone || null,
      current_score: currentScore, target_score: targetScore,
      test_date: testDate || null,
      has_accommodations: hasAccomm ?? null,
      availability_raw: availability,
      availability_notes: availNotes || null,
      student_form_submitted_at: new Date().toISOString(),
      student_form_data: Object.fromEntries(fields.map(f => [f.label, f.value])),
      status: 'active',
    }]);
    if (error) {
      console.error('[tally] student form insert error:', error);
      return { ok: false, reason: error.message };
    }
    console.log(`[tally] student form created new student: ${email}`);
  }

  return { ok: true };
}

async function handleParentForm(fields: TallyField[], db: ReturnType<typeof getDb>) {
  const parentEmail      = str(fields, 'Your email');
  const parentName       = str(fields, 'Your full name');
  const parentPhone      = str(fields, 'Your phone number');
  const contactMethod    = str(fields, 'Best way to reach you for check-in calls');
  const bestTime         = str(fields, 'Best time of day to reach you');
  const studentName      = str(fields, 'Your student\'s full name');
  const targetScore      = num(fields, 'What score are you hoping they reach?');
  const satDate          = str(fields, 'Which SAT date are you aiming for?');
  const satRegistered    = bool(fields, 'Have you registered for that date yet?');
  const backupDate       = str(fields, 'We recommend registering for the test date before your target date. Which backup date are you considering?');
  const hasAccomm        = bool(fields, 'Does your student have any testing accommodations?');
  const accommDetails    = str(fields, 'Please describe them');

  if (!parentEmail) {
    console.warn('[tally] parent form missing email');
    return { ok: false, reason: 'missing_email' };
  }

  // Find student by parent_email
  const { data: existing } = await db
    .from('students')
    .select('id, purchased_hours, total_paid, has_guarantee, payment_plan_details, name, parent_name, parent_email, student_form_submitted_at')
    .eq('parent_email', parentEmail)
    .single();

  const updates: Record<string, unknown> = {
    parent_name:                  parentName || undefined,
    parent_phone:                 parentPhone || undefined,
    parent_contact_method:        contactMethod || undefined,
    parent_best_contact_time:     bestTime || undefined,
    target_score:                 targetScore ?? undefined,
    test_date:                    satDate || undefined,
    sat_registered:               satRegistered ?? undefined,
    backup_test_date:             backupDate || undefined,
    has_accommodations:           hasAccomm ?? undefined,
    accommodations_details:       accommDetails || undefined,
    parent_form_submitted_at:     new Date().toISOString(),
    parent_form_data:             Object.fromEntries(fields.map(f => [f.label, f.value])),
  };

  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  if (existing) {
    await db.from('students').update(cleanUpdates).eq('id', existing.id);
    console.log(`[tally] parent form updated student ${existing.id}`);
  } else {
    // Parent form submitted before deal handoff — create stub, we'll reconcile later
    const { data: byName } = await db
      .from('students')
      .select('id, purchased_hours, total_paid, has_guarantee, payment_plan_details, parent_email, student_form_submitted_at')
      .ilike('name', `%${studentName}%`)
      .limit(1)
      .single();

    if (byName) {
      // Found by name — update with parent details and set parent_email for future matching
      await db.from('students').update({
        ...cleanUpdates,
        parent_email: parentEmail,
      }).eq('id', byName.id);
      console.log(`[tally] parent form matched student by name: ${byName.id}`);
    } else {
      console.warn(`[tally] parent form: no student found for parent email ${parentEmail} or student name "${studentName}"`);
    }
  }

  return { ok: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('tally-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: TallyPayload;
  try {
    payload = JSON.parse(rawBody) as TallyPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.eventType !== 'FORM_RESPONSE') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { formId, fields } = payload.data;
  const db = getDb();

  let result: { ok: boolean; reason?: string };
  switch (formId) {
    case FORM_DEAL_HANDOFF:
      result = await handleDealHandoff(fields, db);
      break;
    case FORM_STUDENT_INTAKE:
      result = await handleStudentForm(fields, db);
      break;
    case FORM_PARENT_INTAKE:
      result = await handleParentForm(fields, db);
      break;
    default:
      console.log(`[tally] unhandled form: ${formId}`);
      return NextResponse.json({ ok: true, skipped: true });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
