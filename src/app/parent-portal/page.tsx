import { redirect } from 'next/navigation';

export default function ParentPortalRoot() {
  redirect('/parent-portal/login');
}
