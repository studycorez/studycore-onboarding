'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface TutorProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  subjects: string[];
  hourly_rate: number;
  photo_url: string | null;
}

export function useTutorAuth() {
  const router = useRouter();
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tutor-auth/me')
      .then(r => {
        if (r.status === 401) { router.push('/tutor-portal/login'); return null; }
        return r.json();
      })
      .then(data => { if (data) setTutor(data); setLoading(false); })
      .catch(() => { router.push('/tutor-portal/login'); });
  }, [router]);

  return { tutor, loading };
}
