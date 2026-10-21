import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Tutor portal auth ────────────────────────────────────────────────────
  if (pathname.startsWith('/tutor-portal') || pathname.startsWith('/session-log') || pathname.startsWith('/api/session-reports')) {
    const isPublicPortal =
      pathname.startsWith('/tutor-portal/login') ||
      pathname.startsWith('/tutor-portal/setup') ||
      pathname.startsWith('/tutor-portal/impersonate') ||
      pathname.startsWith('/tutor-portal/forgot-password') ||
      pathname.startsWith('/tutor-portal/reset-password');

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

  // ── Parent portal auth ───────────────────────────────────────────────────
  if (pathname.startsWith('/parent-portal')) {
    const isPublicParent =
      pathname.startsWith('/parent-portal/login') ||
      pathname.startsWith('/parent-portal/impersonate') ||
      pathname.startsWith('/api/parent-portal/auth') ||
      pathname.startsWith('/api/parent-portal/verify');

    if (!isPublicParent) {
      const token = request.cookies.get(PARENT_COOKIE_NAME)?.value;
      const payload = token ? await verifyParentJWT(token) : null;
      if (!payload) {
        const url = request.nextUrl.clone();
        url.pathname = '/parent-portal/login';
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // ── Student portal auth ──────────────────────────────────────────────────
  if (pathname.startsWith('/student-portal')) {
    const isPublicStudent =
      pathname.startsWith('/student-portal/login') ||
      pathname.startsWith('/student-portal/setup') ||
      pathname.startsWith('/student-portal/impersonate');

    if (!isPublicStudent) {
      const token = request.cookies.get(STUDENT_COOKIE_NAME)?.value;
      const payload = token ? await verifyStudentJWT(token) : null;
      if (!payload) {
        const url = request.nextUrl.clone();
        url.pathname = '/student-portal/login';
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // ── Admin Supabase auth ──────────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
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

  // Public routes
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/tutor-form') ||
    pathname.startsWith('/api/tutor-form') ||
    pathname.startsWith('/api/referral') ||
    pathname.startsWith('/referral') ||
    pathname.startsWith('/api/tutor-auth') ||
    pathname.startsWith('/api/parent-portal') ||
    pathname.startsWith('/api/student-portal') ||
    pathname.startsWith('/api/tutor-portal') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/nps') ||
    pathname.startsWith('/nps') ||
    pathname.startsWith('/api/reschedule') ||
    pathname.startsWith('/reschedule') ||
    pathname.startsWith('/contracts') ||
    pathname.startsWith('/sessions') ||
    (pathname.startsWith('/api/contracts/') && pathname.endsWith('/sign')) ||
    pathname.startsWith('/api/ssc-') ||
    pathname.startsWith('/api/webhooks/fathom') ||
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
