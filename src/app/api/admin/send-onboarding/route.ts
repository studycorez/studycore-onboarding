import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendAdminOnboardingEmail } from '@/lib/email';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const {
    student_id,
    parent_email,
    parent_name,
    student_name,
    hours_purchased,
    total_paid,
    purchase_date,
    target_score,
    program_start_date,
    custom_message,
    game_plan_url,
  } = await req.json();

  if (!parent_email || !parent_name || !student_name || !hours_purchased || !total_paid || !purchase_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await sendAdminOnboardingEmail({
    parentEmail: parent_email,
    parentName: parent_name,
    studentName: student_name,
    hoursPurchased: Number(hours_purchased),
    totalPaid: Number(total_paid),
    purchaseDate: purchase_date,
    targetScore: target_score ? Number(target_score) : null,
    programStartDate: program_start_date || null,
    customMessage: custom_message || null,
    gamePlanUrl: game_plan_url || null,
  });

  // Mark onboarding email as sent if we have a student_id
  if (student_id) {
    await getDb()
      .from('students')
      .update({ onboarding_email_sent: true, onboarding_email_sent_at: new Date().toISOString() })
      .eq('id', student_id);
  }

  return NextResponse.json({ ok: true });
}
