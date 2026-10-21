import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertGHLContact } from '@/lib/ghl';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email, phone, parent_name, parent_email, parent_phone, status, grade, target_score')
    .is('merged_into_id', null)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let failed = 0;

  for (const s of students ?? []) {
    const tags = ['studycore-student'];
    if (s.status === 'active')    tags.push('active');
    if (s.status === 'completed') tags.push('completed');
    if (s.status === 'refunded')  tags.push('refunded');

    const customField: Record<string, string> = {};
    if (s.grade)        customField['grade']        = String(s.grade);
    if (s.target_score) customField['target_score'] = String(s.target_score);

    const id = await upsertGHLContact({
      name:        s.name,
      email:       s.email,
      phone:       s.phone,
      tags,
      customField,
    });

    // Also upsert parent if we have parent email
    if (s.parent_email) {
      await upsertGHLContact({
        name:  s.parent_name ?? `${s.name}'s Parent`,
        email: s.parent_email,
        phone: s.parent_phone,
        tags:  ['studycore-parent'],
      });
    }

    if (id) synced++; else failed++;
  }

  return NextResponse.json({ ok: true, synced, failed });
}
