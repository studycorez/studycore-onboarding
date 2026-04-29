import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { student_id, tutor_id, session_id, title, url, subject, resource_type, notes } = body;

  if (!student_id || !title) {
    return NextResponse.json({ error: 'student_id and title are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('student_resources')
    .insert({ student_id, tutor_id: tutor_id ?? null, session_id: session_id ?? null, title, url: url ?? null, subject: subject ?? null, resource_type: resource_type ?? null, notes: notes ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
