import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/referral/[code] — public, returns referring student name
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const { data: student } = await supabase
    .from('students')
    .select('name')
    .eq('referral_code', params.code)
    .single();

  if (!student) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
  return NextResponse.json({ referrerName: student.name });
}

// POST /api/referral/[code] — submit referral
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const { name, email, phone, grade, target_score } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const { data: referrer } = await supabase
    .from('students')
    .select('id, name')
    .eq('referral_code', params.code)
    .single();

  if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });

  // Insert into referrals table
  await getDb().from('referrals').insert({
    referring_student_id: referrer.id,
    referred_name:  name.trim(),
    referred_email: email?.trim() || null,
    referred_phone: phone?.trim() || null,
  });

  // Also create a lead
  await getDb().from('leads').insert({
    name:         name.trim(),
    email:        email?.trim() || null,
    phone:        phone?.trim() || null,
    grade:        grade ? parseInt(grade) : null,
    target_score: target_score ? parseInt(target_score) : null,
    source:       `referral:${referrer.name}`,
    stage:        'new',
  });

  await postToSlack(
    `🤝 *New Referral!* ${name} was referred by ${referrer.name}\n• Email: ${email || '—'}\n• Phone: ${phone || '—'}`,
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
