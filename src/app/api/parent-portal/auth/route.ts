import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signParentJWT } from '@/lib/parent-auth';
import { sendParentMagicLink } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find students with this parent_email (case-insensitive)
  const { data: students } = await supabase
    .from('students')
    .select('name')
    .ilike('parent_email', normalizedEmail);

  // Always return success to prevent email enumeration
  if (!students || students.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const token = await signParentJWT({ parentEmail: normalizedEmail });
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;

  await sendParentMagicLink({
    parentEmail: normalizedEmail,
    magicLink,
    studentNames: students.map(s => s.name),
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}
