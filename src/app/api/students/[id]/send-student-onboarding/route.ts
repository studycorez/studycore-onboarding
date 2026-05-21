import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendStudentOnboardingEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const TEMP_PASSWORD = 'StudyCore2024!';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = makeSupabase();

  const { data: student, error } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('id', params.id)
    .single();

  if (error || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (!student.email) {
    return NextResponse.json({ error: 'Student has no email on file' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';

  const result = await sendStudentOnboardingEmail({
    studentName: student.name,
    studentEmail: student.email,
    tempPassword: TEMP_PASSWORD,
    appUrl,
  });

  if ((result as any).error) {
    return NextResponse.json({ error: (result as any).error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
