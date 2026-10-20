import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { MIN_PASSWORD_LENGTH } from '@/lib/tutor-password-reset';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, new_password } = body;

  if (!token) {
    return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
  }

  if (!new_password || new_password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  // Look up tutor by reset token
  const { data: tutor } = await getDb()
    .from('tutors')
    .select('id, archived_at, password_reset_token_expires_at')
    .eq('password_reset_token', token)
    .maybeSingle();

  if (!tutor || tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }

  if (!tutor.password_reset_token_expires_at || new Date(tutor.password_reset_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Reset link has expired. Request a new one.' }, { status: 400 });
  }

  // Hash and update
  const password_hash = await bcrypt.hash(new_password, 12);

  const { error: updateErr } = await getDb().from('tutors').update({
    password_hash,
    password_reset_token: null,
    password_reset_token_expires_at: null,
  }).eq('id', tutor.id);

  if (updateErr) {
    console.error('[reset-password] Update failed:', updateErr.message);
    return NextResponse.json({ error: 'Failed to update password. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
