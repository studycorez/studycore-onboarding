import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { randomBytes } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/parent-portal/referral?student_id=... — get referral stats for a student
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  // Verify ownership
  const { data: student } = await supabase
    .from('students')
    .select('id, name, referral_code')
    .eq('id', studentId)
    .ilike('parent_email', payload.parentEmail)
    .single();

  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_name, referred_email, created_at')
    .eq('referring_student_id', studentId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ referral_code: student.referral_code, referrals: referrals ?? [] });
}

// POST /api/parent-portal/referral — generate referral code
export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  // Verify ownership
  const { data: student } = await supabase
    .from('students')
    .select('id, referral_code')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .single();

  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (student.referral_code) return NextResponse.json({ referral_code: student.referral_code });

  // Generate a unique code
  const code = randomBytes(4).toString('hex'); // 8-char hex
  await supabase.from('students').update({ referral_code: code }).eq('id', student_id);

  return NextResponse.json({ referral_code: code });
}
