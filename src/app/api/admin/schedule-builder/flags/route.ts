import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get('resolved') ?? 'false';
  const tutorId = searchParams.get('tutor_id');
  const flagType = searchParams.get('flag_type');

  let q = supabase
    .from('tutor_processing_flags')
    .select('*, tutor:tutors(name)')
    .order('resolved_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (resolved === 'false') {
    q = q.is('resolved_at', null);
  } else if (resolved === 'true') {
    q = q.not('resolved_at', 'is', null);
  }

  if (tutorId) q = q.eq('tutor_id', tutorId);
  if (flagType) q = q.eq('flag_type', flagType);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((f: any) => ({
    ...f,
    tutor_name: (Array.isArray(f.tutor) ? f.tutor[0]?.name : f.tutor?.name) ?? '—',
    tutor: undefined,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { tutor_id, flag_type, flag_data } = body;

  if (!tutor_id) return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
  if (!flag_type) return NextResponse.json({ error: 'flag_type is required' }, { status: 400 });

  // Idempotency: check for existing unresolved flag with same tutor_id + flag_type + session_id
  const sessionId = flag_data?.session_id;
  if (sessionId) {
    const { data: existing } = await supabase
      .from('tutor_processing_flags')
      .select('id')
      .eq('tutor_id', tutor_id)
      .eq('flag_type', flag_type)
      .is('resolved_at', null)
      .contains('flag_data', { session_id: sessionId })
      .maybeSingle();

    if (existing) {
      // Update existing flag
      const { data: updated, error } = await supabase
        .from('tutor_processing_flags')
        .update({
          flag_data: flag_data ?? null,
          created_at: new Date().toISOString(),
          created_by_admin_id: user.id,
        })
        .eq('id', existing.id)
        .select('id, tutor_id, flag_type')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ flagged: true, ...updated });
    }
  }

  const { data: row, error } = await supabase
    .from('tutor_processing_flags')
    .insert({
      tutor_id,
      flag_type,
      flag_data: flag_data ?? null,
      created_by_admin_id: user.id,
    })
    .select('id, tutor_id, flag_type')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flagged: true, ...row });
}
