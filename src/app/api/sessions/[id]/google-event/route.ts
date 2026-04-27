import { NextRequest, NextResponse } from 'next/server';
import { deleteGoogleCalendarEvent } from '@/lib/google-calendar';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await deleteGoogleCalendarEvent(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('deleteGoogleCalendarEvent failed:', err);
    return NextResponse.json({ ok: true }); // best-effort, don't fail the caller
  }
}
