// ⚠️ READ-ONLY DIAGNOSTIC ENDPOINT ⚠️
// Under the new per-session-delta architecture, used_hours is mutated
// via applySessionHoursForStudent at each write site, NOT by bulk recompute.
// This endpoint is a diagnostic only — it shows what total WOULD be if
// recomputed from per-session attributions, without writing.
// To fix a specific student's hours, use admin-manual mutation
// (applyUsedHoursMutation with source: 'admin_manual').

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  const { data: allStudents, error: studentErr } = await supabase
    .from('students')
    .select('id, name, used_hours, purchased_hours, status');

  if (studentErr) {
    return NextResponse.json({ error: studentErr.message }, { status: 500 });
  }

  const results: Array<{
    name: string;
    current_used_hours: number;
    calculated_total: number;
    delta: number;
    sessions_finalized: number;
    sessions_unfinalized: number;
    sessions_unattributed: number;
  }> = [];

  for (const student of allStudents ?? []) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('duration_minutes, hours_attributed, hours_finalized, hours_source')
      .eq('student_id', student.id)
      .in('status', ['completed', 'no_show_student']);

    let calculatedTotal = 0;
    let sessionsFinalized = 0;
    let sessionsUnfinalized = 0;
    let sessionsUnattributed = 0;

    for (const s of sessions ?? []) {
      if (s.hours_attributed != null && s.hours_attributed > 0) {
        calculatedTotal += s.hours_attributed;
      } else {
        calculatedTotal += (s.duration_minutes ?? 0) / 60;
        sessionsUnattributed++;
      }
      if (s.hours_finalized) {
        sessionsFinalized++;
      } else {
        sessionsUnfinalized++;
      }
    }

    calculatedTotal = parseFloat(calculatedTotal.toFixed(2));
    const currentUsed = student.used_hours ?? 0;
    const delta = parseFloat((calculatedTotal - currentUsed).toFixed(2));

    results.push({
      name: student.name,
      current_used_hours: currentUsed,
      calculated_total: calculatedTotal,
      delta,
      sessions_finalized: sessionsFinalized,
      sessions_unfinalized: sessionsUnfinalized,
      sessions_unattributed: sessionsUnattributed,
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));

  const driftCount = results.filter(r => Math.abs(r.delta) >= 0.01).length;

  return NextResponse.json({
    diagnostic: true,
    read_only: true,
    total_students: results.length,
    students_with_drift: driftCount,
    students: results,
  });
}
