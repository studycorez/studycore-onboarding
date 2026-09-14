'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// TODO: replace with real Loom video ID
const LOOM_VIDEO_URL = 'https://www.loom.com/embed/placeholder';
const NAVY = '#1e2090';
const TOTAL_STEPS = 5;
const DIAGNOSTIC_URL = process.env.NEXT_PUBLIC_HIGH_SCORES_DIAGNOSTIC_URL ?? 'https://learn.studycore.net';

const GRADE_OPTIONS = ['9th', '10th', '11th', '12th'];
const HARDEST_SECTION_OPTIONS = ['Math', 'Reading & Writing', 'Both equally'];
const HARDEST_AREAS_OPTIONS = [
  'Algebra',
  'Advanced Math',
  'Geometry',
  'Reading Comprehension',
  'Grammar & Punctuation',
  'Vocabulary in Context',
  'Data Analysis',
];
const WHOS_DRIVING_OPTIONS = [
  'Me — I really want this',
  'My parents — they pushed for it',
  'Both of us',
];

interface FormData {
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  grade: string;
  currentScore: string;
  targetScore: string;
  targetSchools: string;
  hardestSection: string;
  hardestAreas: string[];
  whyChoseProgram: string;
  confidence: number;
  concerns: string;
  currentStruggles: string;
  availability: string;
  testDate: string;
  whosDriving: string;
  accommodations: string;
}

const defaultForm: FormData = {
  studentName: '',
  studentEmail: '',
  studentPhone: '',
  grade: '',
  currentScore: '',
  targetScore: '',
  targetSchools: '',
  hardestSection: '',
  hardestAreas: [],
  whyChoseProgram: '',
  confidence: 7,
  concerns: '',
  currentStruggles: '',
  availability: '',
  testDate: '',
  whosDriving: '',
  accommodations: '',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder, required }: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
      style={{ ['--tw-ring-color' as string]: NAVY }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
      style={{ ['--tw-ring-color' as string]: NAVY }}
    />
  );
}

function RadioGroup({ options, value, onChange }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-3 cursor-pointer group">
          <input
            type="radio"
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="w-4 h-4 accent-[#1e2090]"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({ options, value, onChange }: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-4 h-4 accent-[#1e2090] rounded"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = ((step - 1) / (total - 1)) * 100;
  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
        <span>Step {step} of {total}</span>
        <span>{Math.round(pct)}% complete</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: NAVY }}
        />
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 w-40 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function StudentFormInner() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') ?? '';

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...defaultForm, studentEmail: emailFromUrl });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 1) return !!(form.studentName.trim());
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        hardestAreas: form.hardestAreas.join(', '),
        parentEmail: emailFromUrl || form.studentEmail,
      };
      const res = await fetch('/api/onboard/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Submission failed');
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
        <div className="w-full max-w-xl">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#d1fae5' }}>
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re officially onboarded!</h2>
            <p className="text-gray-600">Great work, {form.studentName}. Your coordinator will follow up within 24 hours.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Next Step: Take Your Diagnostic</h3>
            <p className="text-gray-600 mb-6">
              The diagnostic tells us exactly where to focus so your tutor can build a custom plan for you.
              It takes about 60–90 minutes — do it somewhere quiet, no pressure.
            </p>
            <a
              href={DIAGNOSTIC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full py-3.5 rounded-xl text-white font-bold text-base hover:opacity-90 transition-opacity mb-4"
              style={{ backgroundColor: NAVY }}
            >
              Take My Diagnostic →
            </a>
            <p className="text-sm text-gray-500">
              Once you&apos;ve completed the diagnostic, your coordinator will follow up within 24 hours to confirm your tutor match.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 text-white font-bold text-xl"
            style={{ backgroundColor: NAVY }}
          >
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {step === 1 ? 'Welcome to StudyCore' : `Student Onboarding`}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Help us build the perfect program for you</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <ProgressBar step={step} total={TOTAL_STEPS} />

          {/* Step 1 — Welcome Video + Your Info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-900">Watch This First</h2>
              {/* Loom video embed — 16:9, navy border glow */}
              <div
                className="relative w-full rounded-xl overflow-hidden"
                style={{
                  paddingBottom: '56.25%',
                  boxShadow: `0 0 0 3px ${NAVY}, 0 4px 24px rgba(30,32,144,0.2)`,
                }}
              >
                <iframe
                  src={LOOM_VIDEO_URL}
                  title="Welcome to StudyCore"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full rounded-xl"
                  style={{ border: 'none' }}
                />
              </div>
              <div>
                <Label required>Student Full Name</Label>
                <Input value={form.studentName} onChange={v => set('studentName', v)} placeholder="Alex Smith" required />
              </div>
              <div>
                <Label>Student Email</Label>
                <Input value={form.studentEmail} onChange={v => set('studentEmail', v)} type="email" placeholder="alex@example.com" />
              </div>
              <div>
                <Label>Student Phone</Label>
                <Input value={form.studentPhone} onChange={v => set('studentPhone', v)} type="tel" placeholder="(555) 555-5555" />
              </div>
              <div>
                <Label>Grade</Label>
                <select
                  value={form.grade}
                  onChange={e => set('grade', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                >
                  <option value="">Select grade…</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2 — Academics */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Academics</h2>
              <div>
                <Label>Current SAT Score</Label>
                <Input value={form.currentScore} onChange={v => set('currentScore', v)} type="number" placeholder="e.g. 1100" />
              </div>
              <div>
                <Label>Target SAT Score</Label>
                <Input value={form.targetScore} onChange={v => set('targetScore', v)} type="number" placeholder="e.g. 1450" />
              </div>
              <div>
                <Label>Target Schools</Label>
                <Textarea value={form.targetSchools} onChange={v => set('targetSchools', v)} placeholder="e.g. Penn State, NYU, UCLA" />
              </div>
              <div>
                <Label>Which section feels hardest?</Label>
                <RadioGroup
                  options={HARDEST_SECTION_OPTIONS}
                  value={form.hardestSection}
                  onChange={v => set('hardestSection', v)}
                />
              </div>
              <div>
                <Label>Which specific areas feel hardest?</Label>
                <CheckboxGroup
                  options={HARDEST_AREAS_OPTIONS}
                  value={form.hardestAreas}
                  onChange={v => set('hardestAreas', v)}
                />
              </div>
            </div>
          )}

          {/* Step 3 — Goals & Mindset */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Goals & Mindset</h2>
              <div>
                <Label>What made you want to do this program?</Label>
                <Textarea value={form.whyChoseProgram} onChange={v => set('whyChoseProgram', v)} placeholder="What are you hoping to get out of this?" rows={4} />
              </div>
              <div>
                <Label>How confident are you in hitting your target score?</Label>
                <div className="mt-2 flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={form.confidence}
                    onChange={e => set('confidence', parseInt(e.target.value))}
                    className="flex-1 accent-[#1e2090]"
                  />
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: NAVY }}
                  >
                    {form.confidence}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Not at all</span>
                  <span>Extremely confident</span>
                </div>
              </div>
              <div>
                <Label>Any concerns or doubts?</Label>
                <Textarea value={form.concerns} onChange={v => set('concerns', v)} placeholder="Be honest — this helps us address them early..." rows={3} />
              </div>
              <div>
                <Label>What has made test prep hard in the past?</Label>
                <Textarea value={form.currentStruggles} onChange={v => set('currentStruggles', v)} placeholder="e.g. hard to stay consistent, test anxiety, didn't know what to study..." rows={4} />
              </div>
            </div>
          )}

          {/* Step 4 — Logistics */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Logistics</h2>
              <div>
                <Label>Your weekly availability</Label>
                <Textarea value={form.availability} onChange={v => set('availability', v)} placeholder="e.g. Mon/Wed evenings, Sat mornings" rows={3} />
              </div>
              <div>
                <Label>Agreed test date</Label>
                <Input value={form.testDate} onChange={v => set('testDate', v)} type="date" />
              </div>
              <div>
                <Label>Who is pushing hardest for this?</Label>
                <RadioGroup
                  options={WHOS_DRIVING_OPTIONS}
                  value={form.whosDriving}
                  onChange={v => set('whosDriving', v)}
                />
              </div>
              <div>
                <Label>Accommodations</Label>
                <Textarea value={form.accommodations} onChange={v => set('accommodations', v)} placeholder="Any testing accommodations — extended time, etc. Leave blank if none." rows={3} />
              </div>
            </div>
          )}

          {/* Step 5 — Review */}
          {step === 5 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Review Your Answers</h2>
              <div className="bg-gray-50 rounded-xl p-4 space-y-0 mb-4 border border-gray-200">
                <SummaryRow label="Student Name" value={form.studentName} />
                <SummaryRow label="Email" value={form.studentEmail} />
                <SummaryRow label="Phone" value={form.studentPhone} />
                <SummaryRow label="Grade" value={form.grade} />
                <SummaryRow label="Current Score" value={form.currentScore} />
                <SummaryRow label="Target Score" value={form.targetScore} />
                <SummaryRow label="Target Schools" value={form.targetSchools} />
                <SummaryRow label="Hardest Section" value={form.hardestSection} />
                <SummaryRow label="Hardest Areas" value={form.hardestAreas.join(', ')} />
                <SummaryRow label="Why StudyCore" value={form.whyChoseProgram} />
                <SummaryRow label="Confidence" value={form.confidence ? `${form.confidence}/10` : ''} />
                <SummaryRow label="Concerns" value={form.concerns} />
                <SummaryRow label="Past Struggles" value={form.currentStruggles} />
                <SummaryRow label="Availability" value={form.availability} />
                <SummaryRow label="Test Date" value={form.testDate} />
                <SummaryRow label="Who's Driving" value={form.whosDriving} />
                <SummaryRow label="Accommodations" value={form.accommodations} />
              </div>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
            )}
            {step < TOTAL_STEPS && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: NAVY }}
              >
                Continue →
              </button>
            )}
            {step === TOTAL_STEPS && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-60"
                style={{ backgroundColor: NAVY }}
              >
                {submitting ? 'Submitting…' : 'Submit & Access My Portal →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: NAVY, borderTopColor: 'transparent' }} />
      </div>
    }>
      <StudentFormInner />
    </Suspense>
  );
}
