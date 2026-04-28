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
  game_plan_url: string | null;
  // Onboarding
  onboarding_email_sent: boolean;
  onboarding_completed: boolean;
  intake_form_completed: boolean;
  kickoff_scheduled: boolean;
  game_plan_acknowledged: boolean;
  schedule_confirmed: boolean;
  // Intake
  test_date: string | null;
  weak_areas: string[] | null;
  learning_style: string | null;
  additional_notes: string | null;
  school_name: string | null;
  gpa: string | null;
  study_hours_per_week: string | null;
}

/** Compute onboarding steps for a student in the parent portal (step 1 always complete). */
export function getOnboardingSteps(student: ParentStudent) {
  const hasGamePlan = !!student.game_plan_url;
  return [
    { key: 'portal',   label: 'Portal Access',           complete: true,                             description: 'You\'ve successfully logged in to the parent portal.' },
    { key: 'intake',   label: 'Student Intake Form',      complete: student.intake_form_completed,    description: 'Tell us about your student\'s goals, strengths, and learning style.' },
    { key: 'kickoff',  label: 'Schedule Kickoff Call',    complete: student.kickoff_scheduled,        description: 'Join a short intro call with your tutor to align on goals.' },
    ...(hasGamePlan ? [{ key: 'gameplan', label: 'Review Game Plan', complete: student.game_plan_acknowledged, description: 'Review and acknowledge the personalized study plan your tutor created.' }] : []),
    { key: 'schedule', label: 'Confirm Session Schedule', complete: student.schedule_confirmed,       description: 'Review upcoming sessions and confirm they work for your calendar.' },
  ];
}

/** Compute steps complete count for admin display (step 1 = email sent). */
export function getAdminOnboardingCount(student: { onboarding_email_sent: boolean; intake_form_completed: boolean; kickoff_scheduled: boolean; game_plan_url: string | null; game_plan_acknowledged: boolean; schedule_confirmed: boolean }) {
  const hasGamePlan = !!student.game_plan_url;
  const total = hasGamePlan ? 5 : 4;
  let complete = 0;
  if (student.onboarding_email_sent) complete++;
  if (student.intake_form_completed) complete++;
  if (student.kickoff_scheduled) complete++;
  if (hasGamePlan && student.game_plan_acknowledged) complete++;
  if (student.schedule_confirmed) complete++;
  return { complete, total };
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
