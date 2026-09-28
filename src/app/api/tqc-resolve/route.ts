import { NextRequest, NextResponse } from 'next/server';
import { resolveFlag } from '@/lib/airtable';
import { postToFlagsChannel } from '@/lib/slack';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { flagId, resolvedBy } = body;
  if (!flagId) return NextResponse.json({ error: 'flagId required' }, { status: 400 });

  await resolveFlag(flagId, resolvedBy ?? 'Dashboard');
  await postToFlagsChannel(`✅ Flag resolved by *${resolvedBy ?? 'Dashboard'}* (record: ${flagId})`);

  return NextResponse.json({ ok: true });
}
