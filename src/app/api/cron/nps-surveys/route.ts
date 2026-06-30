import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { sendNPSSurvey } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  if (process.env.IMPORT_LOCKED === 'true') {
    console.log('[nps-surveys] IMPORT_LOCKED=true — skipping NPS cron to prevent milestone inflation during dedup investigation.');
    return NextResponse.json({ ok: true, skipped: 'locked', sent: 0 });
  }

  // Fetch active, unmerged student IDs (bulletproof filter — no reliance on PostgREST join syntax)
  const { data: validStudents } = await supabase
    .from('students')
    .select('id')
    .is('merged_into_id', null)
    .eq('status', 'active');
  const validIds = new Set((validStudents ?? []).map((s: any) => s.id as string));

  // Find all students with completed sessions
  const { data: sessionCounts, error } = await supabase
    .from('sessions')
    .select('student_id, student:students(name, email, parent_email)')
    .eq('status', 'completed');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count completed sessions per student (skip merged/inactive)
  const countMap = new Map<string, { name: string; email: string; parentEmail: string | null; count: number }>();
  for (const s of sessionCounts ?? []) {
    const student = (s as any).student;
    if (!s.student_id || !student) continue;
    if (!validIds.has(s.student_id)) continue;
    if (!countMap.has(s.student_id)) {
      countMap.set(s.student_id, {
        name: student.name,
        email: student.email,
        parentEmail: student.parent_email,
        count: 0,
      });
    }
    countMap.get(s.student_id)!.count++;
  }

  // Get most recent NPS survey per student
  const { data: recentSurveys } = await supabase
    .from('nps_surveys')
    .select('student_id, sent_at')
    .order('sent_at', { ascending: false });

  const lastSurveyMap = new Map<string, Date>();
  for (const survey of recentSurveys ?? []) {
    if (!lastSurveyMap.has(survey.student_id)) {
      lastSurveyMap.set(survey.student_id, new Date(survey.sent_at));
    }
  }

  // Get survey counts per student to know the last survey milestone
  const surveyCountMap = new Map<string, number>();
  for (const survey of recentSurveys ?? []) {
    surveyCountMap.set(survey.student_id, (surveyCountMap.get(survey.student_id) ?? 0) + 1);
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const now = new Date();

  for (const studentId of Array.from(countMap.keys())) {
    const info = countMap.get(studentId)!;
    // Check if we should send: session count is divisible by 4
    if (info.count < 4 || info.count % 4 !== 0) { skipped.push(info.name); continue; }

    // Don't send more than once per 4 sessions milestone
    const surveysSent = surveyCountMap.get(studentId) ?? 0;
    const expectedSurveys = Math.floor(info.count / 4);
    if (surveysSent >= expectedSurveys) { skipped.push(info.name); continue; }

    // Don't resend within 14 days
    const lastSent = lastSurveyMap.get(studentId);
    if (lastSent && (now.getTime() - lastSent.getTime()) < 14 * 24 * 60 * 60 * 1000) {
      skipped.push(info.name);
      continue;
    }

    const token = randomBytes(16).toString('hex');

    const { error: insertErr } = await supabase.from('nps_surveys').insert({
      student_id: studentId,
      token,
      sent_at: now.toISOString(),
    });
    if (insertErr) continue;

    const surveyUrl = `${APP_URL}/nps/${token}`;
    const recipientEmail = info.parentEmail ?? info.email;
    const recipientName  = info.parentEmail ? `${info.name}'s parent` : info.name;

    try {
      await sendNPSSurvey({ recipientEmail, recipientName, surveyUrl });
      sent.push(info.name);
    } catch {
      // If email fails, remove the record so it can be retried
      await supabase.from('nps_surveys').delete().eq('token', token);
    }
  }

  return NextResponse.json({ ok: true, sent: sent.length, skipped: skipped.length });
}
