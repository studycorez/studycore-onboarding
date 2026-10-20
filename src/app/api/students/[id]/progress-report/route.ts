import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { generateProgressReport } from '@/lib/progress-pdf';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const days = body.days ?? 30;

  const periodEnd   = endOfDay(new Date());
  const periodStart = startOfDay(subDays(new Date(), days - 1));
  const startIso    = periodStart.toISOString();
  const endIso      = periodEnd.toISOString();

  // Fetch student
  const { data: student } = await supabase
    .from('students')
    .select('id, name, target_score, current_score, tutors:sessions(tutor_id, tutor:tutors(name))')
    .eq('id', params.id)
    .single();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // Fetch sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_minutes, status, session_notes')
    .eq('student_id', params.id)
    .gte('scheduled_at', startIso)
    .lte('scheduled_at', endIso)
    .order('scheduled_at', { ascending: false });

  // Fetch progress
  const { data: progress } = await supabase
    .from('student_progress')
    .select('recorded_at, total_score, math_score, reading_score, writing_score')
    .eq('student_id', params.id)
    .gte('recorded_at', startIso)
    .lte('recorded_at', endIso)
    .order('recorded_at');

  // Get tutor name from most recent session
  const { data: latestSession } = await supabase
    .from('sessions')
    .select('tutor:tutors(name)')
    .eq('student_id', params.id)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .single();

  const tutorName = (latestSession?.tutor as any)?.name ?? 'N/A';

  const pdfBytes = await generateProgressReport({
    studentName:     student.name,
    tutorName,
    periodStart:     startIso,
    periodEnd:       endIso,
    targetScore:     student.target_score,
    currentScore:    student.current_score,
    sessions: (sessions ?? []).map(s => ({
      date:             s.scheduled_at,
      duration_minutes: s.duration_minutes,
      status:           s.status,
      session_notes:    s.session_notes,
    })),
    progressEntries: progress ?? [],
  });

  // Upload to Supabase storage
  const storagePath = `progress-reports/${params.id}/${format(new Date(), 'yyyy-MM-dd')}-report.pdf`;
  await getDb().storage.createBucket('reports', { public: false }).catch(() => {});
  await getDb().storage.from('reports').upload(storagePath, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { data: signedUrl } = await getDb().storage.from('reports').createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

  // Return PDF directly for download, plus URL
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="progress-report-${student.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM')}.pdf"`,
      'X-Report-Url': signedUrl?.signedUrl ?? '',
    },
  });
}
