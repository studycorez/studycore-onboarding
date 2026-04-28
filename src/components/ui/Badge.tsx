import { cn } from '@/lib/utils';

interface BadgeProps {
  label: string;
  className?: string;
}

export function Badge({ label, className }: BadgeProps) {
  return (
    <span className={cn('badge bg-navy-100 text-navy-800', className)}>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    scheduled:       'bg-blue-100 text-blue-800',
    completed:       'bg-green-100 text-green-800',
    cancelled:       'bg-gray-100 text-gray-600',
    no_show:         'bg-red-100 text-red-800',
    no_show_student: 'bg-red-100 text-red-800',
    no_show_tutor:   'bg-orange-100 text-orange-800',
    no_show_both:    'bg-red-200 text-red-900',
    pending:         'bg-yellow-100 text-yellow-800',
    paid:            'bg-green-100 text-green-800',
    waived:          'bg-purple-100 text-purple-800',
  };
  const labels: Record<string, string> = {
    scheduled: 'Scheduled', completed: 'Completed',
    cancelled: 'Cancelled', no_show: 'No Show',
    no_show_student: 'Student No-Show',
    no_show_tutor:   'Tutor No-Show',
    no_show_both:    'Both No-Show',
    pending: 'Pending', paid: 'Paid', waived: 'Waived',
  };
  return (
    <span className={cn('badge', colors[status] || 'bg-gray-100 text-gray-700')}>
      {labels[status] || status}
    </span>
  );
}
