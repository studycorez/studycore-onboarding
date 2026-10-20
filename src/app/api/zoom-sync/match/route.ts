import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, meetingId, duration } = await req.json();
    if (!sessionId || !meetingId) {
      return NextResponse.json({ error: 'sessionId and meetingId required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      zoom_meeting_id: meetingId,
      status: 'completed',
    };
    if (duration) updates.duration_minutes = duration;

    const { error } = await getDb().from('sessions').update(updates).eq('id', sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
