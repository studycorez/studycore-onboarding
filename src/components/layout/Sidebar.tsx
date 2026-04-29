'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, CalendarPlus,
  CalendarDays, CalendarRange, LogOut, BookOpen, Send, FileText, Video, DollarSign, Home, BarChart2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard',       label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/tutors',          label: 'Tutors',       icon: GraduationCap   },
  { href: '/students',        label: 'Students',     icon: Users            },
  { href: '/book',                    label: 'Book Session',      icon: CalendarPlus  },
  { href: '/admin/book-recurring',    label: 'Recurring Sessions', icon: CalendarRange },
  { href: '/sessions',        label: 'Sessions',     icon: CalendarDays     },
  { href: '/admin/send-forms',  label: 'Send Forms',  icon: Send             },
  { href: '/admin/contracts',   label: 'Contracts',   icon: FileText         },
  { href: '/admin/zoom-sync',   label: 'Zoom Sync',   icon: Video            },
  { href: '/admin/payroll',     label: 'Payroll',     icon: DollarSign       },
  { href: '/admin/nps',         label: 'NPS Surveys', icon: BarChart2        },
  { href: '/admin/calendar',    label: 'Calendar',    icon: CalendarDays     },
  { href: '/admin/resources',   label: 'Resources',   icon: BookOpen         },
  { href: '/parent-portal/login', label: 'Parent Portal', icon: Home           },
  { href: '/student-portal/login', label: 'Student Portal', icon: GraduationCap },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-navy-950 flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-navy-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-navy-500 rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-base tracking-tight">StudyCore</span>
        </div>
        <p className="text-navy-400 text-xs mt-1 ml-10">Admin Panel</p>
      </div>

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
                active
                  ? 'bg-navy-800 text-white'
                  : 'text-navy-300 hover:bg-navy-900 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-navy-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-900 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
