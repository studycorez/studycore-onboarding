import { NextRequest, NextResponse } from 'next/server';
import { moveOpportunityStage } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { opportunityId, stageId } = await req.json();
  if (!opportunityId || !stageId) {
    return NextResponse.json({ error: 'Missing opportunityId or stageId' }, { status: 400 });
  }
  await moveOpportunityStage(opportunityId, stageId);
  return NextResponse.json({ ok: true });
}
