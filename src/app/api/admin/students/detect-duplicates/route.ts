import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

  // Fetch all active (non-merged) students
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email, parent_email, purchased_hours, used_hours, sat_date, target_score, created_at')
    .is('merged_into_id', null)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!students?.length) return NextResponse.json([]);

  // Group by case-insensitive name
  const nameGroups = new Map<string, typeof students>();
  for (const s of students) {
    const key = (s.name ?? '').trim().toLowerCase();
    if (!key) continue;
    const group = nameGroups.get(key);
    if (group) {
      group.push(s);
    } else {
      nameGroups.set(key, [s]);
    }
  }

  // Build duplicate groups (only groups with 2+ students)
  const result: {
    name: string;
    match_type: 'exact' | 'name_only';
    students: typeof students;
  }[] = [];

  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;

    // Classify: 'exact' if all share same email AND same parent_email
    const firstEmail = (group[0].email ?? '').toLowerCase();
    const firstParentEmail = (group[0].parent_email ?? '').toLowerCase();

    const allSameEmail = group.every((s: any) =>
      (s.email ?? '').toLowerCase() === firstEmail
    );
    const allSameParentEmail = group.every((s: any) =>
      (s.parent_email ?? '').toLowerCase() === firstParentEmail
    );

    const matchType = (allSameEmail && allSameParentEmail) ? 'exact' : 'name_only';

    result.push({
      name: group[0].name,
      match_type: matchType,
      students: group,
    });
  }

  // Sort: exact first, then name_only, then alphabetical within each
  result.sort((a, b) => {
    if (a.match_type !== b.match_type) {
      return a.match_type === 'exact' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(result);
}
