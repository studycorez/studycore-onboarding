import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy') {
  return format(new Date(date), fmt);
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatTime(date: string | Date) {
  return format(new Date(date), 'h:mm a');
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTimeString(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'scheduled':  return 'bg-blue-100 text-blue-800';
    case 'completed':  return 'bg-green-100 text-green-800';
    case 'cancelled':  return 'bg-gray-100 text-gray-700';
    case 'no_show':    return 'bg-red-100 text-red-800';
    case 'pending':    return 'bg-yellow-100 text-yellow-800';
    case 'paid':       return 'bg-green-100 text-green-800';
    case 'waived':     return 'bg-purple-100 text-purple-800';
    default:           return 'bg-gray-100 text-gray-700';
  }
}

export function statusLabel(status: string): string {
  return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}
