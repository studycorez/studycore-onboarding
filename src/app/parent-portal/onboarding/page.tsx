'use client';

import { useState } from 'react';
import { useParentAuth, getOnboardingSteps } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Check, ExternalLink, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const { parent, loading } = useParentAuth();
  const router = useRouter();

  const [markingKickoff,  setMarkingKickoff]  = useState<string | null>(null);
  const [markingSchedule, setMarkingSchedule] = useState<string | null>(null);
  const [markingGamePlan, setMarkingGamePlan] = useState<string | null>(null);

  async function markKickoff(studentId: string) {
    setMarkingKickoff(studentId);
    await fetch('/api/parent-portal/kickoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    });
    setMarkingKickoff(null);
    router.refresh();
    // Re-fetch by reloading
    window.location.reload();
  }

  async function markGamePlan(studentId: string) {
    setMarkingGamePlan(studentId);
    await fetch('/api/parent-portal/acknowledge-game-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    });
    setMarkingGamePlan(null);
    window.location.reload();
  }

  async function markSchedule(studentId: string) {
    setMarkingSchedule(studentId);
    await fetch('/api/parent-portal/confirm-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    });
    setMarkingSchedule(null);
    window.location.reload();
  }

  if (loading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Getting Started</h1>
          <p className="text-gray-500 text-sm mt-1">
            Complete these steps to set up your child's tutoring program.
          </p>
        </div>

        {parent?.students.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            No students found for your account.
          </div>
        ) : (
          <div className="space-y-10">
            {parent?.students.map(student => {
              const steps = getOnboardingSteps(student);
              const complete = steps.filter(s => s.complete).length;
              const total = steps.length;
              const allDone = complete === total;
              const pct = Math.round((complete / total) * 100);

              return (
                <div key={student.id}>
                  {parent.students.length > 1 && (
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">{student.name}</h2>
                  )}

                  {/* Progress bar */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium text-gray-700">{complete} of {total} steps complete</span>
                      <span className={`font-semibold ${allDone ? 'text-green-600' : 'text-gray-500'}`}>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-navy-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {allDone ? (
                    <div className="flex items-center gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-green-800">Onboarding complete!</p>
                        <p className="text-sm text-green-700 mt-0.5">Everything is set up. You're all good to go.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      {steps.map((step, i) => (
                        <div
                          key={step.key}
                          className={`flex items-start gap-4 px-5 py-4 ${i < steps.length - 1 ? 'border-b border-gray-50' : ''} ${step.complete ? 'bg-green-50/40' : ''}`}
                        >
                          {/* Icon */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            step.complete
                              ? 'bg-green-500'
                              : 'bg-gray-100 border-2 border-gray-200'
                          }`}>
                            {step.complete
                              ? <Check className="w-4 h-4 text-white" />
                              : <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                            }
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className={`text-sm font-semibold ${step.complete ? 'text-green-800 line-through decoration-green-400' : 'text-gray-900'}`}>
                                {step.label}
                              </p>
                              {!step.complete && step.key === 'intake' && (
                                <Link
                                  href={`/parent-portal/intake?studentId=${student.id}`}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0"
                                >
                                  Start <ChevronRight className="w-3 h-3" />
                                </Link>
                              )}
                              {!step.complete && step.key === 'kickoff' && (
                                <button
                                  onClick={() => markKickoff(student.id)}
                                  disabled={markingKickoff === student.id}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0 disabled:opacity-50"
                                >
                                  {markingKickoff === student.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <>Mark Complete <Check className="w-3 h-3" /></>
                                  }
                                </button>
                              )}
                              {!step.complete && step.key === 'gameplan' && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {student.game_plan_url && (
                                    <a
                                      href={student.game_plan_url}
                                      target="_blank"
                                      rel="noopener"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5"
                                    >
                                      <ExternalLink className="w-3 h-3" /> View Plan
                                    </a>
                                  )}
                                  <button
                                    onClick={() => markGamePlan(student.id)}
                                    disabled={markingGamePlan === student.id}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors disabled:opacity-50"
                                  >
                                    {markingGamePlan === student.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <>Acknowledge <Check className="w-3 h-3" /></>
                                    }
                                  </button>
                                </div>
                              )}
                              {!step.complete && step.key === 'schedule' && (
                                <button
                                  onClick={() => markSchedule(student.id)}
                                  disabled={markingSchedule === student.id}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0 disabled:opacity-50"
                                >
                                  {markingSchedule === student.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <>Confirm <Check className="w-3 h-3" /></>
                                  }
                                </button>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${step.complete ? 'text-green-600' : 'text-gray-500'}`}>
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Link href="/parent-portal/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </ParentPortalLayout>
  );
}
