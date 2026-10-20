import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateResetToken, TOKEN_EXPIRY_MS, RATE_LIMIT_MS } from '@/lib/tutor-password-reset';
import { sendTutorPasswordResetLink } from '@/lib/email';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const GENERIC_SUCCESS = {
  success: true,
  message: "If a tutor account exists with that email, we've sent a reset link.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  // Look up tutor (case-insensitive)
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email, archived_at, password_reset_last_requested_at')
    .ilike('email', email)
    .maybeSingle();

  // Don't reveal whether tutor exists
  if (!tutor || tutor.archived_at !== null) {
    return NextResponse.json(GENERIC_SUCCESS);
  }

  // Rate limit: 5 minutes between requests
  if (tutor.password_reset_last_requested_at) {
    const lastRequested = new Date(tutor.password_reset_last_requested_at).getTime();
    if (Date.now() - lastRequested < RATE_LIMIT_MS) {
      return NextResponse.json(GENERIC_SUCCESS);
    }
  }

  // Generate token and save
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();
  const now = new Date().toISOString();

  await getDb().from('tutors').update({
    password_reset_token: token,
    password_reset_token_expires_at: expiresAt,
    password_reset_last_requested_at: now,
  }).eq('id', tutor.id);

  // Send email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
  const resetUrl = `${appUrl}/tutor-portal/reset-password/${token}`;

  try {
    await sendTutorPasswordResetLink(tutor.email, tutor.name, resetUrl);
  } catch (err: any) {
    console.error('[request-reset] Email send failed:', err);
    postToSlack(`🚨 Password reset email failed for ${tutor.email}: ${err.message}`)
      .catch(e => console.error('[request-reset] Slack failed:', e));
  }

  return NextResponse.json(GENERIC_SUCCESS);
}
