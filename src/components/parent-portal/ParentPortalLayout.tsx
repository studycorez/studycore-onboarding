'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, LayoutDashboard, LogOut, ClipboardList, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParentProfile } from '@/hooks/useParentAuth';

export default function ParentPortalLayout({
  children,
  parent,
}: {
  children: React.ReactNode;
  parent: ParentProfile | null;
}) {
  const router   = useRouter();
  const pathname = usePathname();

  const navItems = [
    { href: '/parent-portal/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
    { href: '/parent-portal/onboarding', label: 'Onboarding',  icon: ClipboardList   },
    { href: '/parent-portal/messages',   label: 'Messages',    icon: MessageSquare   },
  ];

  async function signOut() {
    await fetch('/api/parent-portal/logout', { method: 'POST' });
    router.push('/parent-portal/login');
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
          <p className="text-navy-400 text-xs mt-1 ml-10">Parent Portal</p>
        </div>

        {/* Parent info */}
        {parent && (
          <div className="px-5 py-3 border-b border-navy-800">
            <p className="text-navy-300 text-xs truncate">{parent.parentEmail}</p>
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

      <main className="ml-56 flex-1 p-6 min-w-0">
        {children}
      </main>
    </div>
  );
}
