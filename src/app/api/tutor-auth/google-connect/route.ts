import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google-calendar';
import { COOKIE_NAME, verifyTutorJWT } from '@/lib/tutor-auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyTutorJWT(token);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use the JWT as state so callback can verify it
  const url = getGoogleAuthUrl(token);
  return NextResponse.redirect(url);
}
