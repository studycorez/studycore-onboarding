import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycore-eight.vercel.app';
    const res = await fetch(`${appUrl}/api/zoom-sync`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), ...data });
  } catch (err: any) {
    console.error('cron/zoom-sync error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
