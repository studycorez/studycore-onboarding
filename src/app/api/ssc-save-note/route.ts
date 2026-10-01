import { NextRequest, NextResponse } from 'next/server';
import { addContactNote } from '@/lib/ghl-support';

export async function POST(req: NextRequest) {
  const { contactId, note } = await req.json();
  if (!contactId || !note) {
    return NextResponse.json({ error: 'contactId and note required' }, { status: 400 });
  }
  await addContactNote(contactId, note);
  return NextResponse.json({ ok: true });
}
