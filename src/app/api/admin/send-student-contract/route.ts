/**
 * POST /api/admin/send-student-contract
 *
 * Manually triggers enrollment contract send for a student.
 * Called from the Fulfillment dashboard "Contract" button.
 *
 * Calls the recovery-gameplan signing system to generate a token + send email.
 * Stores the token + sent timestamp in students table.
 *
 * Body: { studentId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

const RECOVERY_URL = process.env.RECOVERY_GAMEPLAN_URL || 'https://studycore-recovery-gameplan1.vercel.app';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function formatAvailability(avail: Record<string, string[]> | null): string {
  if (!avail) return 'TBD';
  const days = Object.entries(avail)
    .filter(([, times]) => times.length > 0)
    .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join('/')}`)
    .join(' | ');
  return days || 'TBD';
}

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const { studentId } = await req.json() as { studentId: string };
  if (!studentId) {
    return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
  }

  const db = getDb();

  const { data: student, error } = await db
    .from('students')
    .select(`
      id, name, email, parent_name, parent_email,
      purchased_hours, total_paid, has_guarantee,
      payment_plan_details, test_date, availability_raw, created_at
    `)
    .eq('id', studentId)
    .single();

  if (error || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (!student.parent_email) {
    return NextResponse.json({ error: 'No parent email on file' }, { status: 422 });
  }

  const avail = student.availability_raw as Record<string, string[]> | null;
  const sessionDaysTimes = formatAvailability(avail);

  // Program weeks: today → test date
  const testDateStr = String(student.test_date || '');
  let programWeeks = 12;
  if (testDateStr) {
    const weeks = Math.round(
      (new Date(testDateStr).getTime() - Date.now()) / (7 * 24 * 3600 * 1000)
    );
    if (weeks > 1 && weeks < 60) programWeeks = weeks;
  }

  const weeklyHours = 3; // default
  const contractData = {
    studentName:      String(student.name || ''),
    parentName:       String(student.parent_name || ''),
    hoursPurchased:   Number(student.purchased_hours || 0),
    totalPaid:        Number(student.total_paid || 0),
    testDate:         testDateStr,
    startDate:        String(student.created_at || '').slice(0, 10),
    endDate:          testDateStr,
    sessionDaysTimes,
    weeklyHours,
    programWeeks,
    totalHours:       Number(student.purchased_hours || weeklyHours * programWeeks),
    refundPolicy:     'prorated',
    hasGuarantee:     Boolean(student.has_guarantee),
    paymentPlan:      String(student.payment_plan_details || ''),
  };

  let token: string | null = null;
  try {
    const res = await fetch(`${RECOVERY_URL}/api/contracts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'student',
        recipientName:  String(student.parent_name || student.name || ''),
        recipientEmail: student.parent_email,
        contractData,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[send-contract] recovery-gameplan error:', res.status, txt);
      return NextResponse.json({ error: `Contract service error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json() as { token?: string };
    token = json.token ?? null;
  } catch (err) {
    console.error('[send-contract] fetch error:', err);
    return NextResponse.json({ error: 'Could not reach contract service' }, { status: 502 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Contract service did not return a token' }, { status: 502 });
  }

  // Store token + timestamp
  await db.from('students').update({
    contract_sent_at: new Date().toISOString(),
    contract_signing_token: token,
  }).eq('id', studentId);

  return NextResponse.json({ ok: true, token });
}
