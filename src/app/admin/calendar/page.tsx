'use client';

import dynamic from 'next/dynamic';
import AdminLayout from '@/components/layout/AdminLayout';

const CalendarUI = dynamic(() => import('./_CalendarUI'), {
  ssr: false,
  loading: () => (
    <div className="flex gap-4 h-full">
      <div className="w-48 shrink-0 animate-pulse bg-gray-100 rounded-xl" />
      <div className="flex-1 animate-pulse bg-gray-100 rounded-xl" />
    </div>
  ),
});

export default function CalendarPage() {
  return (
    <AdminLayout>
      <CalendarUI />
    </AdminLayout>
  );
}
