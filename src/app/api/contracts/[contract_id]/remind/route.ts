import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendContractToTutor } from '@/lib/email';

if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(
  _req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const supabase = createServiceClient();

    const { data: contract } = await supabase
      .from('contracts')
      .select('*, tutor:tutors(name, email), student:students(name)')
      .eq('id', params.contract_id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const emailRes = await sendContractToTutor({
      tutorEmail:  (contract.tutor as any).email,
      tutorName:   (contract.tutor as any).name,
      studentName: (contract.student as any).name,
      hourlyRate:  contract.hourly_rate,
      contractId:  contract.id,
      gamePlanUrl: contract.game_plan_url,
      appUrl:      APP_URL,
    });

    console.log('remind sendContractToTutor response:', JSON.stringify(emailRes));

    if ((emailRes as any).error) {
      const msg = (emailRes as any).error.message ?? 'Resend error';
      console.error('remind Resend error:', msg);
      return NextResponse.json({ error: `Email failed: ${msg}` }, { status: 502 });
    }

    const now = new Date().toISOString();
    await supabase.from('contracts').update({ last_emailed_at: now }).eq('id', params.contract_id);

    return NextResponse.json({ ok: true, lastEmailedAt: now });
  } catch (err: any) {
    console.error('remind route error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
