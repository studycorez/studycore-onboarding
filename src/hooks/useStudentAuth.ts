'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface StudentPortalData {
  id: string;
  name: string;
  email: string;
  grade: number | null;
  current_score: number | null;
  target_score: number | null;
  purchased_hours: number | null;
  used_hours: number | null;
  test_date: string | null;
  xp_points: number;
  xp_level: number;
  avatar_animal: string | null;
  avatar_color: string | null;
  battle_cry: string | null;
  streak_weeks: number;
  badges: string[];
  portal_last_login_at: string | null;
  game_plan_url: string | null;
  timezone: string | null;
  created_at: string;
  parent_can_see_scores: boolean;
  parent_can_see_homework: boolean;
  parent_can_see_xp: boolean;
}

export function useStudentAuth() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentPortalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student-portal/me')
      .then(r => {
        if (r.status === 401) { router.push('/student-portal/login'); return null; }
        return r.json();
      })
      .then(data => { if (data) setStudent(data); setLoading(false); })
      .catch(() => { router.push('/student-portal/login'); });
  }, [router]);

  return { student, loading, setStudent };
}
