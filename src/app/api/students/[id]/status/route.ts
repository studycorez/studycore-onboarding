import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertGHLContact } from '@/lib/ghl';
import { sendAdminOnboardingEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const VALID_STATUSES = ['active', 'completed', 'refunded', 'paused'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { error, data: updated } = await getDb()
    .from('students')
    .update({ status })
    .eq('id', id)
    .select('name, email, phone, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent, game_plan_url')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync status tag to GHL (best-effort)
  if (updated) {
    upsertGHLContact({
      name:  updated.name,
      email: updated.email,
      phone: updated.phone,
      tags:  ['studycore-student', status],
    }).catch(() => {});
  }

  // Auto-send onboarding email on first activation
  if (status === 'active' && updated && !updated.onboarding_email_sent && updated.parent_email) {
    (async () => {
      try {
        // Fetch their signed contract for hours + purchase date
        const { data: contract } = await getDb()
          .from('contracts')
          .select('hourly_rate, signed_at')
          .eq('student_id', id)
          .eq('status', 'signed')
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const purchaseDate = contract?.signed_at
          ? contract.signed_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const hours = updated.purchased_hours ?? 0;
        const hourlyRate = contract?.hourly_rate ?? null;
        const totalPaid = hourlyRate == null ? null : (hours ? Math.round(hours * hourlyRate) : 0);

        await sendAdminOnboardingEmail({
          parentEmail: updated.parent_email,
          parentName: updated.parent_name ?? updated.name,
          studentName: updated.name,
          hoursPurchased: hours,
          totalPaid,
          purchaseDate,
          targetScore: updated.target_score ?? null,
          programStartDate: null,
          customMessage: null,
          gamePlanUrl: (updated as any).game_plan_url ?? null,
        });

        await getDb()
          .from('students')
          .update({ onboarding_email_sent: true, onboarding_email_sent_at: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // best-effort, don't fail the status update
      }
    })();
  }

  return NextResponse.json({ ok: true });
}
