'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, CalendarPlus,
  CalendarDays, LogOut, BookOpen, FileText, Video, DollarSign,
  Eye, UsersRound, Mail, ClipboardList, Activity, Cloud, Receipt,
  ShieldCheck, Layers, Rocket, Phone, Award, HeartHandshake,
  Wand2, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import PortalPickerModal from '@/components/PortalPickerModal';

type NavItem = { href: string; label: string; icon: React.ElementType };

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/students',  label: 'Students',  icon: Users           },
      { href: '/tutors',    label: 'Tutors',     icon: GraduationCap   },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/sessions',               label: 'Sessions',         icon: CalendarDays  },
      { href: '/book',                   label: 'Book Session',     icon: CalendarPlus  },
      { href: '/admin/schedule-builder', label: 'Schedule Builder', icon: Layers        },
      { href: '/admin/session-reports',  label: 'Session Reports',  icon: FileText      },
      { href: '/admin/group-sessions',   label: 'Group Sessions',   icon: UsersRound    },
      { href: '/admin/contracts',        label: 'Contracts',        icon: FileText      },
      { href: '/admin/sessions-audit',   label: 'Sessions Audit',   icon: ClipboardList },
    ],
  },
  {
    title: 'Student Success',
    items: [
      { href: '/admin/ssc',         label: 'SSC Dashboard',      icon: HeartHandshake },
      { href: '/admin/tqc',         label: 'TQC Dashboard',      icon: Award          },
      { href: '/admin/check-ins',   label: 'Check-ins',          icon: Phone          },
      { href: '/admin/fulfillment', label: 'Fulfillment',        icon: Rocket         },
      { href: '/admin/onboarding',  label: 'Student Onboarding', icon: Mail           },
      { href: '/admin/send-forms',  label: 'Tutor Onboarding',   icon: UserCheck      },
      { href: '/admin/gameplan',    label: 'Gameplan Generator', icon: Wand2          },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/admin/payroll',  label: 'Payroll',  icon: DollarSign },
      { href: '/admin/invoices', label: 'Invoices', icon: Receipt    },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/admin/fathom-sync',     label: 'Fathom Sync',    icon: Video       },
      { href: '/admin/zoom-sync',       label: 'Zoom Sync',      icon: Cloud       },
      { href: '/admin/tutor-health',    label: 'Tutor Health',   icon: Activity    },
      { href: '/admin/sop-quiz-status', label: 'SOP Quiz',       icon: ShieldCheck },
    ],
  },
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
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/session-proposals/pending-count');
        if (!res.ok) return;
        const data = await res.json();
        setPendingCount(data.count ?? 0);
      } catch { /* silent */ }
    }
    fetchCount();
    const id = setInterval(fetchCount, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 w-56 flex flex-col z-30" style={{ background: '#0b1829', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 0 12px rgba(59,130,246,0.4)' }}>
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm tracking-tight leading-none">StudyCore</p>
              <p className="text-white/25 text-[10px] mt-0.5">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {navSections.map((section, si) => (
            <div key={section.title} className={si > 0 ? 'mt-5' : ''}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {section.title}
              </p>
              <div className="space-y-px">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href.length > 1 && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[12.5px] font-medium transition-all duration-150',
                        active
                          ? 'text-white'
                          : 'hover:text-white/80'
                      )}
                      style={active
                        ? { background: 'rgba(255,255,255,0.08)', color: '#fff' }
                        : { color: 'rgba(255,255,255,0.38)' }
                      }
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full" style={{ background: '#3b82f6' }} />
                      )}
                      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0 transition-colors', active ? 'text-blue-400' : 'text-white/25')} />
                      <span className="flex-1">{label}</span>
                      {href === '/admin/session-proposals' && pendingCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Portals */}
          <div className="mt-5">
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>Portals</p>
            <div className="space-y-px">
              {portalItems.map(({ label, type }) => (
                <button
                  key={type}
                  onClick={() => setActivePortal(type)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[12.5px] font-medium transition-all duration-150 hover:text-white/80 hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.38)' }}
                >
                  <Eye className="w-3.5 h-3.5 flex-shrink-0 text-white/25" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Sign out */}
        <div className="px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[12.5px] font-medium transition-all duration-150 hover:text-white/70 hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {activePortal && (
        <PortalPickerModal type={activePortal} onClose={() => setActivePortal(null)} />
      )}
    </>
  );
}
