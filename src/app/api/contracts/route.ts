import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendContractToTutor } from '@/lib/email';
import { postToSlack, buildContractOnboardMessage } from '@/lib/slack';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycore-eight.vercel.app';
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year in seconds

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const tutorId    = formData.get('tutor_id')    as string;
    const studentId  = formData.get('student_id')  as string;
    const hourlyRate = parseInt(formData.get('hourly_rate') as string, 10);
    const pdfFile        = formData.get('pdf')           as File | null;
    const existingPdfUrl = formData.get('game_plan_url') as string | null;

    if (!tutorId || !studentId || !hourlyRate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch tutor and student for email
    const [{ data: tutor }, { data: student }] = await Promise.all([
      supabase.from('tutors').select('id, name, email').eq('id', tutorId).single(),
      supabase.from('students').select('id, name').eq('id', studentId).single(),
    ]);

    if (!tutor || !student) {
      return NextResponse.json({ error: 'Tutor or student not found' }, { status: 404 });
    }

    // Create contract row first to get the ID for the storage path
    const { data: contract, error: insertErr } = await supabase
      .from('contracts')
      .insert({ tutor_id: tutorId, student_id: studentId, hourly_rate: hourlyRate, status: 'pending' })
      .select('id')
      .single();

    if (insertErr || !contract) {
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }

    let gamePlanUrl: string | null = existingPdfUrl ?? null;
    let gamePlanPath: string | null = null;

    // If student already has a game plan URL, just attach it to the contract
    if (gamePlanUrl) {
      await supabase
        .from('contracts')
        .update({ game_plan_url: gamePlanUrl })
        .eq('id', contract.id);
    }

    // Upload PDF if provided (overrides existing URL)
    if (pdfFile && pdfFile.size > 0) {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const path = `${tutorId}/${contract.id}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from('game-plans')
        .upload(path, arrayBuffer, { contentType: 'application/pdf', upsert: true });

      if (!uploadErr) {
        gamePlanPath = path;
        const { data: signed } = await supabase.storage
          .from('game-plans')
          .createSignedUrl(path, SIGNED_URL_TTL);
        gamePlanUrl = signed?.signedUrl ?? null;

        // Update contract with PDF info
        await supabase
          .from('contracts')
          .update({ game_plan_url: gamePlanUrl, game_plan_path: gamePlanPath })
          .eq('id', contract.id);
      }
    }

    // Slack notification (non-blocking)
    postToSlack(buildContractOnboardMessage({
      studentName: student.name,
      tutorName: tutor.name,
      hourlyRate,
      contractId: contract.id,
      appUrl: APP_URL,
    })).catch(err => console.error('Slack contract notify failed:', err));

    // Send email (non-blocking)
    sendContractToTutor({
      tutorEmail:  tutor.email,
      tutorName:   tutor.name,
      studentName: student.name,
      hourlyRate,
      contractId:  contract.id,
      gamePlanUrl,
      appUrl:      APP_URL,
    }).catch(err => console.error('sendContractToTutor failed:', err));

    return NextResponse.json({ id: contract.id }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/contracts error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
