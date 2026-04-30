import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SignJWT } from 'jose';

const secret = () =>
  new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

export interface ImpersonationPayload {
  impersonation: true;
  type: 'student' | 'parent' | 'tutor';
  id: string;
}

export async function signImpersonationJWT(payload: Omit<ImpersonationPayload, 'impersonation'>): Promise<string> {
  return new SignJWT({ ...payload, impersonation: true } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(secret());
}

export async function POST(req: NextRequest) {
  // Verify admin Supabase session
  const cookieStore = req.cookies;
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { type, id } = await req.json();
  if (!type || !id || !['student', 'parent', 'tutor'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type or id' }, { status: 400 });
  }

  const token = await signImpersonationJWT({ type, id });
  return NextResponse.json({ token });
}
