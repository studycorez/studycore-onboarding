import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendViolationWarning } from '@/lib/email';

// ── POST /api/contracts/[contract_id]/violation ────────────────────────────
// Adds a violation record and increments the contract's violation_count.
export async function POST(
  req: NextRequest,
  { params }: { params: { contract_id: string } },
) {
  try {
    const body = await req.json();
    const { violation_type, reason, violation_date, session_id } = body;

    if (!violation_type || !reason?.trim()) {
      return NextResponse.json({ error: 'violation_type and reason are required' }, { status: 400 });
    }
    if (reason.trim().length < 20) {
      return NextResponse.json({ error: 'Reason must be at least 20 characters' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch contract with tutor + student
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

    // Insert violation record
    const { error: insertErr } = await supabase.from('contract_violations').insert({
      contract_id:    params.contract_id,
      tutor_id:       contract.tutor_id,
      student_id:     contract.student_id,
      violation_type,
      reason:         reason.trim(),
      violation_date: violation_date ?? new Date().toISOString().slice(0, 10),
      session_id:     session_id || null,
    });

    if (insertErr) throw insertErr;

    // Increment violation_count (and void if 3rd+)
    const contractUpdates: Record<string, unknown> = { violation_count: newCount };
    if (newCount >= 3) contractUpdates.status = 'voided';

    const { error: updateErr } = await supabase
      .from('contracts')
      .update(contractUpdates)
      .eq('id', params.contract_id);

    if (updateErr) throw updateErr;

    // Send warning email (non-blocking)
    sendViolationWarning({
      tutorEmail:     (contract.tutor as any).email,
      tutorName:      (contract.tutor as any).name,
      studentName:    (contract.student as any).name,
      violationCount: newCount,
    }).catch(err => console.error('sendViolationWarning failed:', err));

    return NextResponse.json({
      ok: true,
      violationCount: newCount,
      tutorName: (contract.tutor as any).name,
    });
  } catch (err: any) {
    console.error('POST violation error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
