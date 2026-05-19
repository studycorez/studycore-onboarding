import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { sendTutorSetupLink } from '@/lib/email';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  // Admin auth
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode: 'never_invited' | 'expired' | 'both' = body.mode ?? 'never_invited';

  const supabase = makeServiceSupabase();
  const now = new Date().toISOString();

  // Build query based on mode
  let query = supabase
    .from('tutors')
    .select('id, name, email')
    .is('archived_at', null)
    .is('password_hash', null);

  if (mode === 'never_invited') {
    query = query.is('setup_token', null);
  } else if (mode === 'expired') {
    query = query.not('setup_token', 'is', null).lte('setup_token_expires_at', now);
  }
  // mode === 'both': no additional filter beyond password_hash IS NULL

  const { data: tutors, error: fetchErr } = await query;
  if (fetchErr) {
    console.error('[send-bulk-invites] fetch error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!tutors?.length) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, failed_details: [] });
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set' }, { status: 500 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const sent: string[] = [];
  const failed: { name: string; email: string; reason: string }[] = [];

  // Process in batches of 10 to avoid Resend rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < tutors.length; i += BATCH_SIZE) {
    const batch = tutors.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (tutor) => {
        const token = randomUUID();
        await supabase
          .from('tutors')
          .update({ setup_token: token, setup_token_expires_at: expiresAt })
          .eq('id', tutor.id);
        const result = await sendTutorSetupLink({ tutorName: tutor.name, tutorEmail: tutor.email, token, appUrl });
        if (result.error) throw new Error(result.error.message ?? 'Email rejected');
        return tutor.name;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        sent.push(r.value);
      } else {
        const reason = (r.reason as Error)?.message ?? 'Unknown error';
        console.error(`[send-bulk-invites] failed for ${batch[j].email}:`, reason);
        failed.push({ name: batch[j].name, email: batch[j].email, reason });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sent.length,
    failed: failed.length,
    failed_details: failed,
  });
}
