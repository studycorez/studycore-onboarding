import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const results: Record<string, any> = { ok: true, timestamp: new Date().toISOString() };

  try {
    const zoomRes = await fetch(`${appUrl}/api/zoom-sync`, { method: 'POST' });
    results.zoom_sync = await zoomRes.json();
  } catch (err: any) {
    console.error('cron/zoom-sync zoom-sync error:', err);
    results.zoom_sync = { error: err.message };
  }

  try {
    const hoursRes = await fetch(`${appUrl}/api/students/sync-hours`, { method: 'POST' });
    results.hours_sync = await hoursRes.json();
  } catch (err: any) {
    console.error('cron/zoom-sync hours-sync error:', err);
    results.hours_sync = { error: err.message };
  }

  return NextResponse.json(results);
}
