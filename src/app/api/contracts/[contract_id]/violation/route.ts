import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendViolationWarning } from '@/lib/email';

export async function POST(
  _req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const supabase = createServiceClient();

    // Fetch current contract
    const { data: contract } = await supabase
      .from('contracts')
      .select('*, tutor:tutors(name, email), student:students(name)')
      .eq('id', params.contract_id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (contract.status === 'voided') {
      return NextResponse.json({ error: 'Contract is already voided' }, { status: 409 });
    }

    const newCount = (contract.violation_count ?? 0) + 1;
    const updates: Record<string, unknown> = { violation_count: newCount };
    if (newCount >= 3) updates.status = 'voided';

    const { error } = await supabase
      .from('contracts')
      .update(updates)
      .eq('id', params.contract_id);

    if (error) throw error;

    // Send warning email (non-blocking)
    sendViolationWarning({
      tutorEmail:     (contract.tutor as any).email,
      tutorName:      (contract.tutor as any).name,
      studentName:    (contract.student as any).name,
      violationCount: newCount,
    }).catch(err => console.error('sendViolationWarning failed:', err));

    return NextResponse.json({ ok: true, violationCount: newCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
