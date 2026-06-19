import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const results: Record<string, any> = { ok: true, timestamp: new Date().toISOString() };

  try {
    const zoomRes = await fetch(`${appUrl}/api/zoom-sync`, { method: 'POST' });
    results.zoom_sync = await zoomRes.json();
  } catch (err: any) {
    console.error('cron/zoom-sync zoom-sync error:', err);
    results.zoom_sync = { error: err.message };
  }

  return NextResponse.json(results);
}
