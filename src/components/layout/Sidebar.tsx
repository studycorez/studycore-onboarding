'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, CalendarPlus,
  CalendarDays, CalendarRange, LogOut, BookOpen, FileText, Video, DollarSign, BarChart2, Eye, CalendarClock, UsersRound, Mail, ClipboardList, ClipboardCheck, Activity,
  UserPlus, VideoOff, Cloud, Receipt, MessageSquare, UserCheck, History, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import PortalPickerModal from '@/components/PortalPickerModal';

const navItems = [
  { href: '/dashboard',                       label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/tutors',                          label: 'Tutors',              icon: GraduationCap   },
  { href: '/students',                        label: 'Students',            icon: Users           },
  { href: '/admin/leads',                     label: 'Leads',               icon: UserPlus        },
  { href: '/book',                            label: 'Book Session',        icon: CalendarPlus    },
  { href: '/admin/book-recurring',            label: 'Recurring Sessions',  icon: CalendarRange   },
  { href: '/sessions',                        label: 'Sessions',            icon: CalendarDays    },
  { href: '/admin/session-reports',           label: 'Session Reports',     icon: FileText        },
  { href: '/admin/session-reports-pending',   label: 'Pending Reviews',     icon: ClipboardCheck  },
  { href: '/admin/group-sessions',            label: 'Group Sessions',      icon: UsersRound      },
  { href: '/admin/contracts',                 label: 'Contracts',           icon: FileText        },
  { href: '/admin/fathom-sync',               label: 'Fathom Sync',         icon: Video           },
  { href: '/admin/fathom-review',             label: 'Fathom Review',       icon: VideoOff        },
  { href: '/admin/zoom-sync',                 label: 'Zoom Sync',           icon: Cloud           },
  { href: '/admin/payroll',                   label: 'Payroll',             icon: DollarSign      },
  { href: '/admin/invoices',                  label: 'Invoices',            icon: Receipt         },
  { href: '/admin/sessions-audit',            label: 'Sessions Audit',      icon: ClipboardList   },
  { href: '/admin/session-proposals',         label: 'Backlog Proposals',   icon: History         },
  { href: '/admin/tutor-health',              label: 'Tutor Health',        icon: Activity        },
  { href: '/admin/sop-quiz-status',            label: 'SOP Quiz Status',     icon: ShieldCheck     },
  { href: '/admin/student-requests',             label: 'Student Requests',    icon: UserPlus        },
  { href: '/admin/nps',                       label: 'NPS Surveys',         icon: BarChart2       },
  { href: '/admin/calendar',                  label: 'Calendar',            icon: CalendarDays    },
  { href: '/admin/reschedule-requests',       label: 'Reschedule Requests', icon: CalendarClock   },
  { href: '/admin/messages',                  label: 'Messages',            icon: MessageSquare   },
  { href: '/admin/onboarding',               label: 'Student Onboarding',  icon: Mail            },
  { href: '/admin/send-forms',               label: 'Tutor Onboarding',    icon: UserCheck       },
  { href: '/admin/resources',                 label: 'Resources',           icon: BookOpen        },
];

const portalItems: { label: string; type: 'student' | 'parent' | 'tutor' }[] = [
  { label: 'Student Portal', type: 'student' },
  { label: 'Parent Portal',  type: 'parent'  },
  { label: 'Tutor Portal',   type: 'tutor'   },
];

type PortalType = 'student' | 'parent' | 'tutor' | null;

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [activePortal, setActivePortal] = useState<PortalType>(null);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/session-proposals/pending-count');
        if (!res.ok) return;
        const data = await res.json();
        setPendingProposalCount(data.count ?? 0);
      } catch { /* silent */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
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
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                <span className="flex-1">{label}</span>
                {href === '/admin/session-proposals' && pendingProposalCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {pendingProposalCount > 99 ? '99+' : pendingProposalCount}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Portal pickers */}
          <div className="pt-2 mt-2 border-t border-navy-800 space-y-0.5">
            {portalItems.map(({ label, type }) => (
              <button
                key={type}
                onClick={() => setActivePortal(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-900 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
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

      {activePortal && (
        <PortalPickerModal
          type={activePortal}
          onClose={() => setActivePortal(null)}
        />
      )}
    </>
  );
}
