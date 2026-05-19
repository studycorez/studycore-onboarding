'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page has been superseded by /tutor-portal/my-reports.
// Redirect anyone who bookmarked the old URL.
export default function TutorReportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/tutor-portal/my-reports'); }, [router]);
  return null;
}
