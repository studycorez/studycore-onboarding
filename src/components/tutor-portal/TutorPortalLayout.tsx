'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, CalendarDays, BookOpen, DollarSign, User, LogOut, Clock, FileText, CalendarClock, CheckSquare, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TutorProfile } from '@/hooks/useTutorAuth';

const navItems = [
  { href: '/tutor-portal/dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/tutor-portal/attestation',  label: 'Confirm Sessions', icon: CheckSquare     },
  { href: '/tutor-portal/backlog',     label: 'Backlog',           icon: History         },
  { href: '/tutor-portal/students',     label: 'My Students',      icon: Users           },
  { href: '/tutor-portal/sessions',    label: 'Sessions',    icon: CalendarDays    },
  { href: '/tutor-portal/my-reports',  label: 'My Reports',  icon: FileText        },
  { href: '/tutor-portal/reschedule',   label: 'Reschedule',  icon: CalendarClock  },
  { href: '/tutor-portal/availability', label: 'Availability', icon: Clock         },
  { href: '/tutor-portal/resources',   label: 'Resources',   icon: BookOpen        },
  { href: '/tutor-portal/payroll',     label: 'Payroll',     icon: DollarSign      },
  { href: '/tutor-portal/profile',     label: 'Profile',     icon: User            },
];

export default function TutorPortalLayout({ children, tutor }: { children: React.ReactNode; tutor: TutorProfile | null }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [adminPreview, setAdminPreview] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    if (localStorage.getItem('adminPreview') === '1') setAdminPreview(true);
  }, []);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/tutor-portal/attestation/pending-count');
        if (!res.ok) return;
        const data = await res.json();
        setPendingCount(data.count ?? 0);
      } catch { /* silent fail */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function signOut() {
    await fetch('/api/tutor-auth/logout', { method: 'POST' });
    router.push('/tutor-portal/login');
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="fixed inset-y-0 left-0 w-56 bg-navy-950 flex flex-col z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-navy-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-navy-500 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-base tracking-tight">StudyCore</span>
          </div>
          <p className="text-navy-400 text-xs mt-1 ml-10">Tutor Portal</p>
        </div>

        {/* Tutor info */}
        {tutor && (
          <div className="px-5 py-3 border-b border-navy-800">
            <p className="text-white text-sm font-medium truncate">{tutor.name}</p>
            <p className="text-navy-400 text-xs">${tutor.hourly_rate}/hr</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                <span className="flex-1">{label}</span>
                {href === '/tutor-portal/attestation' && pendingCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-medium rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-navy-800">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-900 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-56 flex-1 min-w-0">
        {adminPreview && (
          <div className="bg-amber-400 text-amber-900 text-sm font-semibold px-6 py-2.5 flex items-center justify-between">
            <span>👁 Admin Preview Mode — viewing as tutor</span>
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
