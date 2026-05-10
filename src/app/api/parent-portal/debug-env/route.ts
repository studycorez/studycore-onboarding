import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT_SET',
    key_prefix: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'NOT_SET').slice(0, 25),
  });
}
