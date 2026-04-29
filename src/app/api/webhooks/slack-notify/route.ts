import { NextRequest, NextResponse } from 'next/server';
import { postToSlack, buildStudentOnboardMessage, buildContractOnboardMessage } from '@/lib/slack';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, data } = body as {
      event: 'student_created' | 'contract_created';
      data: Record<string, any>;
    };

    if (!event || !data) {
      return NextResponse.json({ error: 'Missing event or data' }, { status: 400 });
    }

    let text = '';
    if (event === 'student_created') {
      text = buildStudentOnboardMessage({
        name: data.name,
        email: data.email,
        grade: data.grade,
        targetScore: data.target_score,
        source: data.source,
      });
    } else if (event === 'contract_created') {
      text = buildContractOnboardMessage({
        studentName: data.student_name,
        tutorName: data.tutor_name,
        hourlyRate: data.hourly_rate,
        contractId: data.contract_id,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      });
    } else {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }

    await postToSlack(text);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('slack-notify error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
