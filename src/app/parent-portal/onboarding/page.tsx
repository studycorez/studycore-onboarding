'use client';

import { useState } from 'react';
import { useParentAuth, getOnboardingSteps } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Check, ExternalLink, Loader2, ChevronRight, PartyPopper } from 'lucide-react';
import Link from 'next/link';

type ToastState = { message: string; type: 'success' | 'error' } | null;

export default function OnboardingPage() {
  const { parent, loading, updateStudent } = useParentAuth();

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function callAction(
    endpoint: string,
    studentId: string,
    patch: Record<string, boolean>,
    successMsg: string,
  ) {
    const key = `${endpoint}-${studentId}`;
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/parent-portal/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error || 'Something went wrong. Please try again.', 'error');
        return;
      }
      updateStudent(studentId, patch);
      showToast(successMsg);
    } catch {
      showToast('Network error — please try again.', 'error');
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
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
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Getting Started</h1>
          <p className="text-gray-500 text-sm mt-1">
            Complete these steps to set up your child&apos;s tutoring program.
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
                        className={`h-2.5 rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-navy-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {allDone ? (
                    <div className="flex items-start gap-4 px-6 py-5 bg-green-50 border border-green-200 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <PartyPopper className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-green-900 text-lg">You&apos;re all set!</p>
                        <p className="text-sm text-green-700 mt-1">
                          Onboarding is complete for {student.name}. Your tutor is ready — sessions are all lined up.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      {steps.map((step, i) => {
                        const kickoffKey = `kickoff-${student.id}`;
                        const scheduleKey = `confirm-schedule-${student.id}`;
                        const gameplanKey = `acknowledge-game-plan-${student.id}`;

                        return (
                          <div
                            key={step.key}
                            className={`flex items-start gap-4 px-5 py-4 ${i < steps.length - 1 ? 'border-b border-gray-50' : ''} ${step.complete ? 'bg-green-50/40' : ''}`}
                          >
                            {/* Step icon */}
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

                                {/* Intake */}
                                {!step.complete && step.key === 'intake' && (
                                  <Link
                                    href={`/parent-portal/intake?studentId=${student.id}`}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0"
                                  >
                                    Start <ChevronRight className="w-3 h-3" />
                                  </Link>
                                )}

                                {/* Kickoff */}
                                {!step.complete && step.key === 'kickoff' && (
                                  <button
                                    onClick={() => callAction('kickoff', student.id, { kickoff_scheduled: true }, 'Kickoff call marked complete!')}
                                    disabled={busy[kickoffKey]}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0 disabled:opacity-50"
                                  >
                                    {busy[kickoffKey]
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <><Check className="w-3 h-3" /> Mark Complete</>
                                    }
                                  </button>
                                )}

                                {/* Game Plan */}
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
                                      onClick={() => callAction('acknowledge-game-plan', student.id, { game_plan_acknowledged: true }, 'Game plan acknowledged!')}
                                      disabled={busy[gameplanKey]}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors disabled:opacity-50"
                                    >
                                      {busy[gameplanKey]
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <><Check className="w-3 h-3" /> Acknowledge</>
                                      }
                                    </button>
                                  </div>
                                )}

                                {/* Schedule */}
                                {!step.complete && step.key === 'schedule' && (
                                  <button
                                    onClick={() => callAction('confirm-schedule', student.id, { schedule_confirmed: true }, 'Session schedule confirmed!')}
                                    disabled={busy[scheduleKey]}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-100 transition-colors flex-shrink-0 disabled:opacity-50"
                                  >
                                    {busy[scheduleKey]
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <><Check className="w-3 h-3" /> Confirm</>
                                    }
                                  </button>
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 ${step.complete ? 'text-green-600' : 'text-gray-500'}`}>
                                {step.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
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
