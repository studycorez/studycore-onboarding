import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const { data, error } = await supabase
    .from('contracts')
    .select('student:students(id, name, email, status, merged_into_id)')
    .eq('tutor_id', payload.tutorId)
    .eq('status', 'signed');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const students = (data ?? [])
    .map((c: any) => c.student)
    .filter((s: any) => s != null && s.status === 'active' && s.merged_into_id == null)
    .map((s: any) => ({ id: s.id as string, name: s.name as string, email: s.email as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Deduplicate (tutor may have multiple contracts with same student)
  const seen = new Set<string>();
  const unique = students.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return NextResponse.json({ students: unique });
}
