import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all student IDs for this parent
  const { data: students } = await supabase
    .from('students')
    .select('id')
    .ilike('parent_email', payload.parentEmail);

  const studentIds = (students ?? []).map((s: any) => s.id);
  if (!studentIds.length) return NextResponse.json([]);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, student_id, period_start, period_end, amount, status, paid_at, notes, created_at')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json(invoices ?? []);
}
