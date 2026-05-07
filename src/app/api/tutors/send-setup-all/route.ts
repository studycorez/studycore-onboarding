import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendTutorSetupLink } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  const { data: tutors } = await supabase
    .from('tutors')
    .select('id, name, email')
    .is('password_hash', null);

  if (!tutors?.length) return NextResponse.json({ ok: true, sent: 0 });

  if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sent: string[] = [];
  const failed: { name: string; email: string; reason: string }[] = [];

  for (const tutor of tutors) {
    try {
      const token = randomUUID();
      await supabase.from('tutors').update({ setup_token: token, setup_token_expires_at: expiresAt }).eq('id', tutor.id);
      const result = await sendTutorSetupLink({ tutorName: tutor.name, tutorEmail: tutor.email, token, appUrl });
      if (result.error) {
        const reason = result.error.message ?? 'Email rejected';
        console.error(`[send-setup-all] Resend rejected ${tutor.email}:`, reason);
        failed.push({ name: tutor.name, email: tutor.email, reason });
      } else {
        sent.push(tutor.name);
      }
    } catch (err: any) {
      const reason = err.message ?? 'Unknown error';
      console.error(`[send-setup-all] threw for ${tutor.email}:`, reason);
      failed.push({ name: tutor.name, email: tutor.email, reason });
    }
  }

  return NextResponse.json({ ok: true, sent: sent.length, failed: failed.length, failedDetails: failed, sentTo: sent });
}
