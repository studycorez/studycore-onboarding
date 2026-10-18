import { NextResponse } from 'next/server';
import { listCalendars } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

/** Setup helper — call this once to find your calendar IDs. */
export async function GET() {
  const calendars = await listCalendars();
  return NextResponse.json({ calendars });
}
