import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStudentSessions } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = makeSupabase();

  const { data: student, error } = await supabase
    .from('students')
    .select('airtable_seq')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !student) {
    return NextResponse.json({ sessions: [], totalHoursUsed: 0 });
  }

  if (!student.airtable_seq) {
    return NextResponse.json({ sessions: [], totalHoursUsed: 0, noAirtableLink: true });
  }

  const result = await getStudentSessions(student.airtable_seq);
  return NextResponse.json(result);
}
