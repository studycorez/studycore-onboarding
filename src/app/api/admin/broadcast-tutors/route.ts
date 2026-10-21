/**
 * POST /api/admin/broadcast-tutors
 *
 * Sends an SMS to all tutor-active contacts in GHL Support with student details.
 * Uses GHL Support API key + location T4M5UHtoDZkcVAK31IFA (separate from main GHL).
 *
 * Body:
 *   studentId  — Supabase student UUID
 *
 * Flow:
 *   1. Load student record (name, scores, availability, test date, sessions/wk)
 *   2. Fetch all contacts from GHL Support
 *   3. Filter client-side to tutor-active tagged contacts
 *   4. Send SMS to each
 *   5. Mark students.broadcast_sent_at
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

const GHL_SUPPORT_API_KEY = process.env.GHL_SUPPORT_API_KEY!;
const GHL_SUPPORT_LOCATION = 'T4M5UHtoDZkcVAK31IFA';
const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-04-15';
const GHL_FROM_NUMBER = process.env.GHL_SUPPORT_FROM_NUMBER || '+19254815501';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_SUPPORT_API_KEY}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
  };
}

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface GHLContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  tags: string[];
}

async function fetchAllTutorContacts(): Promise<GHLContact[]> {
  const allContacts: GHLContact[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(GHL_SUPPORT_LOCATION)}&limit=${limit}&page=${page}`;
    const res = await fetch(url, { headers: ghlHeaders() });

    if (!res.ok) {
      console.error('[broadcast] GHL contacts fetch failed:', res.status, await res.text());
      break;
    }

    const data = await res.json() as { contacts: GHLContact[]; meta?: { total: number } };
    const contacts: GHLContact[] = data.contacts ?? [];
    allContacts.push(...contacts);

    // Stop when we've fetched all
    const total = data.meta?.total ?? contacts.length;
    if (allContacts.length >= total || contacts.length < limit) break;
    page++;
  }

  // Filter to tutor-active tag client-side
  return allContacts.filter(c => c.tags?.includes('tutor-active'));
}

async function sendSms(contactId: string, message: string): Promise<boolean> {
  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({
      type: 'SMS',
      contactId,
      fromNumber: GHL_FROM_NUMBER,
      message,
    }),
  });

  if (!res.ok) {
    console.error('[broadcast] SMS send failed for contact', contactId, res.status);
    return false;
  }
  return true;
}

function buildBroadcastMessage(student: Record<string, unknown>): string {
  const name         = String(student.name || 'New Student');
  const currentScore = student.current_score ? `${student.current_score}` : 'N/A';
  const targetScore  = student.target_score  ? `${student.target_score}` : 'N/A';
  const hours        = student.purchased_hours ? `${student.purchased_hours} hrs` : 'TBD';
  const testDate     = student.test_date ? String(student.test_date) : 'TBD';
  const avail        = student.availability_raw as Record<string, string[]> | null;

  let availText = 'TBD';
  if (avail) {
    const days = Object.entries(avail)
      .filter(([, times]) => times.length > 0)
      .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)} (${times.join('/')})`)
      .join(', ');
    if (days) availText = days;
  }

  const notesLine = student.availability_notes
    ? `\nNotes: ${student.availability_notes}`
    : '';

  return [
    `📚 NEW STUDENT AVAILABLE — Reply OPEN if you can take them`,
    ``,
    `Student: ${name}`,
    `Current SAT: ${currentScore} → Target: ${targetScore}`,
    `Program: ${hours} | Test Date: ${testDate}`,
    `Availability: ${availText}`,
    notesLine,
    ``,
    `Reply OPEN to be considered for this student.`,
  ].filter(l => l !== undefined).join('\n');
}

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const { studentId } = await req.json() as { studentId: string };
  if (!studentId) {
    return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
  }

  const db = getDb();

  const { data: student, error: studentErr } = await db
    .from('students')
    .select('id, name, current_score, target_score, purchased_hours, test_date, availability_raw, availability_notes')
    .eq('id', studentId)
    .single();

  if (studentErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const message = buildBroadcastMessage(student as Record<string, unknown>);

  // Fetch tutors
  const tutors = await fetchAllTutorContacts();
  if (tutors.length === 0) {
    return NextResponse.json({ error: 'No tutor-active contacts found in GHL Support' }, { status: 500 });
  }

  // Send SMS to all
  let sent = 0;
  let failed = 0;
  for (const tutor of tutors) {
    if (!tutor.id) continue;
    const ok = await sendSms(tutor.id, message);
    if (ok) sent++;
    else failed++;
  }

  // Mark broadcast sent
  await db.from('students').update({
    broadcast_sent_at: new Date().toISOString(),
  }).eq('id', studentId);

  return NextResponse.json({ ok: true, sent, failed, total: tutors.length });
}
