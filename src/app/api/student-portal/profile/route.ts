import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';
import { Filter } from 'bad-words';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const filter = new Filter();

const URL_REGEX = /https?:\/\/|www\./i;
const PHONE_REGEX = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;

export async function POST(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { avatar_animal, avatar_color, battle_cry } = await req.json();

  // Validate battle cry
  if (battle_cry) {
    if (battle_cry.length > 50) {
      return NextResponse.json({ error: 'Battle cry must be 50 characters or less' }, { status: 400 });
    }
    if (URL_REGEX.test(battle_cry)) {
      return NextResponse.json({ error: 'Battle cry cannot contain URLs' }, { status: 400 });
    }
    if (PHONE_REGEX.test(battle_cry)) {
      return NextResponse.json({ error: 'Battle cry cannot contain phone numbers' }, { status: 400 });
    }
    if (filter.isProfane(battle_cry)) {
      return NextResponse.json({ error: 'Please keep your battle cry appropriate' }, { status: 400 });
    }
  }

  const { error } = await getDb().from('students').update({
    ...(avatar_animal ? { avatar_animal } : {}),
    ...(avatar_color ? { avatar_color } : {}),
    battle_cry: battle_cry ?? null,
  }).eq('id', payload.studentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
