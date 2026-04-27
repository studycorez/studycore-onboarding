import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Tutor portal auth ────────────────────────────────────────────────────
  if (pathname.startsWith('/tutor-portal')) {
    const isPublicPortal =
      pathname.startsWith('/tutor-portal/login') ||
      pathname.startsWith('/tutor-portal/setup');

    if (!isPublicPortal) {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      const payload = token ? await verifyTutorJWT(token) : null;
      if (!payload) {
        const url = request.nextUrl.clone();
        url.pathname = '/tutor-portal/login';
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // ── Admin Supabase auth ──────────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public routes: login and availability form
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/tutor-form') ||
    pathname.startsWith('/api/tutor-form') ||
    pathname.startsWith('/api/tutor-auth') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/contracts') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
