import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? 'NOT_SET',
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    service_key_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) ?? 'NOT_SET',
  });
}
