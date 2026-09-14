'use client';
import { useState, useEffect } from 'react';

const NAVY = '#1e2090';
const STORAGE_KEY = 'sc_workshop_progress';

const MODULES = [
  {
    id: 'sat-overview',
    title: 'How the SAT Works',
    description: 'Understand the structure, timing, scoring, and what the test actually measures.',
    duration: '8 min',
    loomId: 'placeholder', // TODO: replace
  },
  {
    id: 'scoring',
    title: 'Understanding Your Score Report',
    description: 'How to read a score report, what subscores mean, and where to focus improvement.',
    duration: '6 min',
    loomId: 'placeholder', // TODO: replace
  },
  {
    id: 'colleges',
    title: 'SAT Scores & College Admissions',
    description: 'How colleges actually use SAT scores, score ranges by school, and what improvement means for options.',
    duration: '10 min',
    loomId: 'placeholder', // TODO: replace
  },
  {
    id: 'timeline',
    title: 'Building the Right Test Timeline',
    description: 'How to pick the right test date, how many times to take it, and what a strong prep timeline looks like.',
    duration: '7 min',
    loomId: 'placeholder', // TODO: replace
  },
  {
    id: 'support',
    title: 'How to Support Your Student',
    description: "The parent's role in test prep — what helps, what hurts, and how to create the right home environment.",
    duration: '9 min',
    loomId: 'placeholder', // TODO: replace
  },
  {
    id: 'program',
    title: 'How the StudyCore Program Works',
    description: 'Session structure, tutor expectations, homework, score tracking, and what success looks like.',
    duration: '5 min',
    loomId: 'placeholder', // TODO: replace
  },
];

export default function WorkshopPage() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCompleted(new Set(JSON.parse(saved)));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  function toggleComplete(id: string) {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded(prev => (prev === id ? null : id));
  }

  const completedCount = completed.size;
  const totalCount = MODULES.length;
  const allDone = completedCount === totalCount;
  const progressPct = mounted ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="w-full py-10 px-4" style={{ backgroundColor: NAVY }}>
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Parent Workshop</h1>
          <p className="text-blue-200 text-base max-w-lg mx-auto">
            Watch these short videos to understand everything about the SAT and how to set your student up for success.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">
              {mounted ? completedCount : 0} of {totalCount} videos completed
            </span>
            <span className="text-sm font-bold" style={{ color: NAVY }}>
              {mounted ? Math.round(progressPct) : 0}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: allDone ? '#16a34a' : NAVY }}
            />
          </div>
        </div>

        {/* All done celebration */}
        {mounted && allDone && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <h2 className="text-xl font-bold text-green-800 mb-1">All done!</h2>
            <p className="text-green-700 text-sm">
              You&apos;ve completed the entire Parent Workshop. You&apos;re now in the top tier of prepared parents — your student is lucky to have you.
            </p>
          </div>
        )}

        {/* Module cards */}
        <div className="space-y-3">
          {MODULES.map((mod, idx) => {
            const isDone = mounted && completed.has(mod.id);
            const isExpanded = expanded === mod.id;

            return (
              <div
                key={mod.id}
                className="bg-white rounded-2xl shadow-sm border transition-all duration-200"
                style={{ borderColor: isDone ? '#bbf7d0' : '#e5e7eb' }}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleComplete(mod.id)}
                      aria-label={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                      className="mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                      style={{
                        borderColor: isDone ? '#16a34a' : '#d1d5db',
                        backgroundColor: isDone ? '#16a34a' : 'transparent',
                      }}
                    >
                      {isDone && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#f0f4ff', color: NAVY }}
                        >
                          {mod.duration}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleExpand(mod.id)}
                        className="text-left w-full"
                      >
                        <h3
                          className="font-bold text-base leading-snug transition-colors hover:opacity-80"
                          style={{
                            color: isDone ? '#9ca3af' : '#111827',
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}
                        >
                          {mod.title}
                        </h3>
                      </button>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">{mod.description}</p>
                    </div>

                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpand(mod.id)}
                      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
                      aria-label={isExpanded ? 'Collapse video' : 'Expand video'}
                    >
                      <svg
                        className="w-5 h-5 transition-transform duration-200"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expandable Loom embed — lazy loaded */}
                {isExpanded && (
                  <div className="px-5 pb-5">
                    <div
                      className="relative w-full rounded-xl overflow-hidden"
                      style={{ paddingBottom: '56.25%', backgroundColor: '#f3f4f6' }}
                    >
                      <iframe
                        src={`https://www.loom.com/embed/${mod.loomId}`}
                        title={mod.title}
                        allowFullScreen
                        loading="lazy"
                        className="absolute inset-0 w-full h-full rounded-xl"
                        style={{ border: 'none' }}
                      />
                    </div>
                    {!isDone && (
                      <button
                        onClick={() => toggleComplete(mod.id)}
                        className="mt-3 w-full py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: '#16a34a' }}
                      >
                        ✓ Mark as Complete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
