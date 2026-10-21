import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { PARENT_COOKIE_NAME, verifyParentJWT } from '@/lib/parent-auth';
import { STUDENT_COOKIE_NAME, verifyStudentJWT } from '@/lib/student-auth';
import Link from 'next/link';
import { GraduationCap, Users, BookOpen, Shield } from 'lucide-react';

const roles = [
  { href: '/tutor-portal/login',   label: 'Tutor',   icon: GraduationCap, color: 'text-navy-600',  hover: 'hover:border-navy-300  hover:bg-navy-50'  },
  { href: '/parent-portal/login',  label: 'Parent',  icon: Users,         color: 'text-emerald-600', hover: 'hover:border-emerald-300 hover:bg-emerald-50' },
  { href: '/student-portal/login', label: 'Student', icon: BookOpen,      color: 'text-blue-600',  hover: 'hover:border-blue-300  hover:bg-blue-50'  },
  { href: '/login',                label: 'Admin',   icon: Shield,        color: 'text-gray-600',  hover: 'hover:border-gray-300  hover:bg-gray-100' },
];

export default async function HomePage() {
  const cookieStore = cookies();

  // Check tutor session
  const tutorToken = cookieStore.get(COOKIE_NAME)?.value;
  if (tutorToken) {
    const payload = await verifyTutorJWT(tutorToken);
    if (payload) redirect('/tutor-portal/dashboard');
  }

  // Check parent session
  const parentToken = cookieStore.get(PARENT_COOKIE_NAME)?.value;
  if (parentToken) {
    const payload = await verifyParentJWT(parentToken);
    if (payload) redirect('/parent-portal/dashboard');
  }

  // Check student session
  const studentToken = cookieStore.get(STUDENT_COOKIE_NAME)?.value;
  if (studentToken) {
    const payload = await verifyStudentJWT(studentToken);
    if (payload) redirect('/student-portal/dashboard');
  }

  // Check admin session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  // No active session — show picker
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-navy-900 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="text-3xl font-bold text-gray-900">StudyCore</span>
          </div>
          <p className="text-gray-500 text-sm">How would you like to sign in?</p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-4">
          {roles.map(({ href, label, icon: Icon, color, hover }) => (
            <Link
              key={label}
              href={href}
              className={`bg-white rounded-2xl border border-gray-200 p-8 flex flex-col items-center justify-center gap-4 transition-all duration-150 ${hover} hover:shadow-md`}
            >
              <Icon className={`w-10 h-10 ${color}`} />
              <span className="text-lg font-semibold text-gray-900">{label}</span>
            </Link>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-8">
          Need help? Contact <a href="mailto:info@studycore.net" className="text-gray-500 hover:underline">info@studycore.net</a>
        </p>
      </div>
    </div>
  );
}
