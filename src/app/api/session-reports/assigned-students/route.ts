import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  // Verify tutor JWT — tutor_id comes from JWT, not query param
  const tutorToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!tutorToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(tutorToken);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const supabase = makeSupabase();

  // Get students linked via active contracts (always use JWT tutor_id)
  const { data, error } = await supabase
    .from('contracts')
    .select('student_id, student:students(id, name)')
    .eq('tutor_id', payload.tutorId)
    .in('status', ['signed', 'active']);

  if (error) {
    console.error('[assigned-students]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const students: { id: string; name: string }[] = [];
  for (const row of (data ?? []) as any[]) {
    const s = Array.isArray(row.student) ? row.student[0] : row.student;
    if (s?.id && !seen.has(s.id)) {
      seen.add(s.id);
      students.push({ id: s.id, name: s.name });
    }
  }

  return NextResponse.json(students.sort((a, b) => a.name.localeCompare(b.name)));
}
