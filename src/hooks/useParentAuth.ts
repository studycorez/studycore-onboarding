'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ParentStudent {
  id: string;
  name: string;
  email: string;
  grade: number | null;
  current_score: number | null;
  target_score: number | null;
  purchased_hours: number | null;
  used_hours: number | null;
  notes: string | null;
  parent_name: string | null;
  parent_email: string | null;
}

export interface ParentProfile {
  parentEmail: string;
  students: ParentStudent[];
}

export function useParentAuth() {
  const router = useRouter();
  const [parent, setParent] = useState<ParentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/parent-portal/me')
      .then(r => {
        if (r.status === 401) { router.push('/parent-portal/login'); return null; }
        return r.json();
      })
      .then(data => { if (data) setParent(data); setLoading(false); })
      .catch(() => { router.push('/parent-portal/login'); });
  }, [router]);

  return { parent, loading };
}
