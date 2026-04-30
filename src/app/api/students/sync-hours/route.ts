import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  // Fetch all billable sessions (completed + no_show_student)
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('student_id, duration_minutes')
    .in('status', ['completed', 'no_show_student']);

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // Sum duration_minutes per student
  const minutesByStudent: Record<string, number> = {};
  for (const s of sessions ?? []) {
    minutesByStudent[s.student_id] = (minutesByStudent[s.student_id] ?? 0) + (s.duration_minutes ?? 0);
  }

  // Fetch all students to also zero out those with no billable sessions
  const { data: allStudents } = await supabase
    .from('students')
    .select('id, name, used_hours, purchased_hours, status');

  const results: { name: string; used_hours: number }[] = [];

  await Promise.all(
    (allStudents ?? []).map(async (student) => {
      const totalMinutes = minutesByStudent[student.id] ?? 0;
      const usedHours = Math.round((totalMinutes / 60) * 2) / 2;
      const remaining = (student.purchased_hours ?? 0) - usedHours;
      const updates: Record<string, unknown> = {};

      if (usedHours !== (student.used_hours ?? 0)) updates.used_hours = usedHours;
      if (remaining <= 0 && student.status === 'active') updates.status = 'completed';

      if (Object.keys(updates).length > 0) {
        await supabase.from('students').update(updates).eq('id', student.id);
      }
      results.push({ name: student.name, used_hours: usedHours });
    })
  );

  results.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ updated: results.length, students: results });
}
