import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertGHLContact } from '@/lib/ghl';
import { sendAdminOnboardingEmail } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

  const { error, data: updated } = await supabase
    .from('students')
    .update({ status })
    .eq('id', id)
    .select('name, email, phone, parent_name, parent_email, target_score, purchased_hours, onboarding_email_sent')
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
        // Fetch their signed contract for tutor info
        const { data: contract } = await supabase
          .from('contracts')
          .select('tutor_id, hourly_rate, signed_at')
          .eq('student_id', id)
          .eq('status', 'signed')
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let tutorName = 'Your Tutor';
        let tutorPhotoUrl: string | null = null;
        let purchaseDate = new Date().toISOString().slice(0, 10);

        if (contract) {
          const { data: tutor } = await supabase
            .from('tutors')
            .select('name, photo_url')
            .eq('id', contract.tutor_id)
            .single();
          if (tutor) {
            tutorName = tutor.name;
            tutorPhotoUrl = tutor.photo_url;
          }
          if (contract.signed_at) {
            purchaseDate = contract.signed_at.slice(0, 10);
          }
        }

        const hours = updated.purchased_hours ?? 0;
        const hourlyRate = contract?.hourly_rate ?? 0;
        const totalPaid = hours && hourlyRate ? Math.round(hours * hourlyRate) : 0;

        await sendAdminOnboardingEmail({
          parentEmail: updated.parent_email,
          parentName: updated.parent_name ?? updated.name,
          studentName: updated.name,
          tutorName,
          tutorPhotoUrl,
          hoursPurchased: hours,
          totalPaid,
          purchaseDate,
          targetScore: updated.target_score ?? null,
          programStartDate: null,
          customMessage: null,
        });

        await supabase
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
