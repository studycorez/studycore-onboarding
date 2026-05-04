'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, LayoutDashboard, TrendingUp, Award, User, LogOut, CheckSquare, BarChart2, FolderOpen, Moon, Sun, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudentPortalData } from '@/hooks/useStudentAuth';
import { getAnimalEmoji, getColorHex, getLevelName } from '@/lib/xp';

export default function StudentPortalLayout({
  children,
  student,
}: {
  children: React.ReactNode;
  student: StudentPortalData | null;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('studentPortalDark');
    if (stored === 'true') setDarkMode(true);
    if (localStorage.getItem('adminPreview') === '1') setAdminPreview(true);
  }, []);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('studentPortalDark', String(next));
  }

  const navItems = [
    { href: '/student-portal/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
    { href: '/student-portal/sessions',    label: 'Sessions',    icon: CalendarDays    },
    { href: '/student-portal/homework',    label: 'Homework',    icon: CheckSquare     },
    { href: '/student-portal/scores',      label: 'Scores',      icon: BarChart2       },
    { href: '/student-portal/resources',   label: 'Resources',   icon: FolderOpen      },
    { href: '/student-portal/progress',    label: 'Progress',    icon: TrendingUp      },
    { href: '/student-portal/badges',      label: 'Badges',      icon: Award           },
    { href: '/student-portal/profile',     label: 'My Profile',  icon: User            },
  ];

  async function signOut() {
    await fetch('/api/student-portal/logout', { method: 'POST' });
    router.push('/student-portal/login');
  }

  const emoji = student ? getAnimalEmoji(student.avatar_animal) : '🦊';
  const colorHex = student ? getColorHex(student.avatar_color) : '#a855f7';
  const levelName = student ? getLevelName(student.xp_level) : 'Hatchling';

  return (
    <div className={cn('min-h-screen flex', darkMode ? 'dark bg-gray-900' : 'bg-gray-50')}>
      <aside className="fixed inset-y-0 left-0 w-56 bg-navy-950 flex flex-col z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-navy-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-navy-500 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-base tracking-tight">StudyCore</span>
          </div>
          <p className="text-navy-400 text-xs mt-1 ml-10">Student Portal</p>
        </div>

        {/* Student avatar */}
        {student && (
          <div className="px-5 py-3 border-b border-navy-800">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                style={{ backgroundColor: colorHex + '33', border: `2px solid ${colorHex}` }}
              >
                {emoji}
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{student.name.split(' ')[0]}</p>
                <p className="text-navy-400 text-xs">{levelName} · {student.xp_points} XP</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active ? 'bg-navy-800 text-white' : 'text-navy-300 hover:bg-navy-900 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Dark mode toggle + Sign out */}
        <div className="px-3 py-4 border-t border-navy-800 space-y-1">
          <button
            onClick={toggleDark}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-900 hover:text-white transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-900 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-56 flex-1 min-w-0 dark:text-gray-100">
        {adminPreview && (
          <div className="bg-amber-400 text-amber-900 text-sm font-semibold px-6 py-2.5 flex items-center justify-between">
            <span>👁 Admin Preview Mode — viewing as student</span>
            <button
              onClick={() => {
                localStorage.removeItem('adminPreview');
                setAdminPreview(false);
              }}
              className="text-amber-800 hover:text-amber-900 underline text-xs"
            >
              Exit Preview
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
