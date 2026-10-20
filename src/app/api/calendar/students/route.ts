import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  // Return students with their current active tutor (most recent signed contract)
  const { data: students, error } = await getDb()
    .from('students')
    .select('id, name')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch active contracts to get current tutor for each student
  const { data: contracts } = await getDb()
    .from('contracts')
    .select('student_id, tutor:tutors(name)')
    .eq('status', 'signed');

  const tutorMap = new Map<string, string>();
  for (const c of contracts ?? []) {
    if (!tutorMap.has(c.student_id)) {
      tutorMap.set(c.student_id, (c.tutor as any)?.name ?? '');
    }
  }

  const result = (students ?? []).map(s => ({
    id: s.id,
    name: s.name,
    tutor_name: tutorMap.get(s.id) ?? null,
  }));

  return NextResponse.json(result);
}
