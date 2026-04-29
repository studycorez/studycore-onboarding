import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendContractToTutor } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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

    await sendContractToTutor({
      tutorEmail:  (contract.tutor as any).email,
      tutorName:   (contract.tutor as any).name,
      studentName: (contract.student as any).name,
      hourlyRate:  contract.hourly_rate,
      contractId:  contract.id,
      gamePlanUrl: contract.game_plan_url,
      appUrl:      APP_URL,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
