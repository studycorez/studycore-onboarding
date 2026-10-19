'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const NAVY = '#1e2090';
const TOTAL_STEPS = 5;

interface FormData {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  studentName: string;
  goalScore: string;
  targetSchools: string;
  whyChoseProgram: string;
  whosDriving: string;
  confidence: number;
  concerns: string;
  pastExperiences: string;
  availability: string;
  testDate: string;
  accommodations: string;
  preferredContact: string;
}

const defaultForm: FormData = {
  parentName: '',
  parentEmail: '',
  parentPhone: '',
  studentName: '',
  goalScore: '',
  targetSchools: '',
  whyChoseProgram: '',
  whosDriving: '',
  confidence: 7,
  concerns: '',
  pastExperiences: '',
  availability: '',
  testDate: '',
  accommodations: '',
  preferredContact: '',
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

function ParentFormInner() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') ?? '';

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...defaultForm, parentEmail: emailFromUrl });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (emailFromUrl) {
      setForm(prev => ({ ...prev, parentEmail: emailFromUrl }));
    }
  }, [emailFromUrl]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 1) return !!(form.parentName.trim() && form.parentEmail.trim() && form.studentName.trim());
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboard/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#d1fae5' }}>
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Form submitted!</h2>
            <p className="text-gray-600">Thank you, {form.parentName}. Your coordinator will follow up within 24 hours.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-100" style={{ backgroundColor: NAVY }}>
              <h3 className="text-lg font-bold text-white">Book Your Onboarding Call</h3>
              <p className="text-blue-200 text-sm mt-0.5">Pick a time that works for you below</p>
            </div>
            <div className="p-1">
              <iframe
                src="https://schedule.studycore.net/widget/booking/d56zqGolVLjbRTvl1Gyt"
                style={{ width: '100%', height: 700, border: 'none' }}
                title="Book Onboarding Call"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-gray-700 mb-3">While you&apos;re here, check out the Parent Workshop to get the most out of the program.</p>
            <a
              href="/workshop"
              className="inline-block px-6 py-3 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: NAVY }}
            >
              View Parent Workshop →
            </a>
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
            {step === 1 && form.parentName ? `Welcome, ${form.parentName.split(' ')[0]}!` : 'Parent Onboarding'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Help us make this the best experience for {form.studentName || 'your student'}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <ProgressBar step={step} total={TOTAL_STEPS} />

          {/* Step 1 — Your Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Your Information</h2>
              <div>
                <Label required>Parent Full Name</Label>
                <Input value={form.parentName} onChange={v => set('parentName', v)} placeholder="Jane Smith" required />
              </div>
              <div>
                <Label required>Parent Email</Label>
                <Input value={form.parentEmail} onChange={v => set('parentEmail', v)} type="email" placeholder="jane@example.com" required />
              </div>
              <div>
                <Label>Parent Phone</Label>
                <Input value={form.parentPhone} onChange={v => set('parentPhone', v)} type="tel" placeholder="(555) 555-5555" />
              </div>
              <div>
                <Label required>Student Name</Label>
                <Input value={form.studentName} onChange={v => set('studentName', v)} placeholder="Alex Smith" required />
              </div>
            </div>
          )}

          {/* Step 2 — Goals */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Goals</h2>
              <div>
                <Label>Goal SAT Score</Label>
                <Input value={form.goalScore} onChange={v => set('goalScore', v)} type="number" placeholder="e.g. 1450" />
              </div>
              <div>
                <Label>Target Schools</Label>
                <Textarea value={form.targetSchools} onChange={v => set('targetSchools', v)} placeholder="e.g. Penn State, Rutgers, NYU" />
              </div>
              <div>
                <Label>What made you choose StudyCore?</Label>
                <Textarea value={form.whyChoseProgram} onChange={v => set('whyChoseProgram', v)} placeholder="Tell us what drew you to the program..." rows={4} />
              </div>
              <div>
                <Label>Who is driving this decision?</Label>
                <RadioGroup
                  options={['Primarily my child', 'Primarily me (parent)', 'Both equally']}
                  value={form.whosDriving}
                  onChange={v => set('whosDriving', v)}
                />
              </div>
            </div>
          )}

          {/* Step 3 — Mindset */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Mindset</h2>
              <div>
                <Label>How confident are you that {form.studentName || 'your student'} will hit the goal score?</Label>
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
                <Label>Any concerns or doubts about the program?</Label>
                <Textarea value={form.concerns} onChange={v => set('concerns', v)} placeholder="Be honest — this helps us address them proactively..." rows={4} />
              </div>
              <div>
                <Label>Past tutoring or test prep experiences — what went wrong?</Label>
                <Textarea value={form.pastExperiences} onChange={v => set('pastExperiences', v)} placeholder="e.g. tutor wasn't consistent, student didn't engage, etc." rows={4} />
              </div>
            </div>
          )}

          {/* Step 4 — Logistics */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Logistics</h2>
              <div>
                <Label>Student&apos;s weekly availability</Label>
                <Textarea value={form.availability} onChange={v => set('availability', v)} placeholder="e.g. Mon/Wed evenings, Sat mornings" rows={3} />
              </div>
              <div>
                <Label>Agreed test date</Label>
                <Input value={form.testDate} onChange={v => set('testDate', v)} type="date" />
              </div>
              <div>
                <Label>Accommodations</Label>
                <Textarea value={form.accommodations} onChange={v => set('accommodations', v)} placeholder="Any testing accommodations — extended time, separate room, etc. Leave blank if none." rows={3} />
              </div>
              <div>
                <Label>Preferred contact method</Label>
                <RadioGroup
                  options={['Text', 'Call', 'Email']}
                  value={form.preferredContact}
                  onChange={v => set('preferredContact', v)}
                />
              </div>
            </div>
          )}

          {/* Step 5 — Review */}
          {step === 5 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Review Your Answers</h2>
              <div className="bg-gray-50 rounded-xl p-4 space-y-0 mb-4 border border-gray-200">
                <SummaryRow label="Parent Name" value={form.parentName} />
                <SummaryRow label="Email" value={form.parentEmail} />
                <SummaryRow label="Phone" value={form.parentPhone} />
                <SummaryRow label="Student Name" value={form.studentName} />
                <SummaryRow label="Goal Score" value={form.goalScore} />
                <SummaryRow label="Target Schools" value={form.targetSchools} />
                <SummaryRow label="Why StudyCore" value={form.whyChoseProgram} />
                <SummaryRow label="Who's Driving" value={form.whosDriving} />
                <SummaryRow label="Confidence" value={form.confidence ? `${form.confidence}/10` : ''} />
                <SummaryRow label="Concerns" value={form.concerns} />
                <SummaryRow label="Past Experiences" value={form.pastExperiences} />
                <SummaryRow label="Availability" value={form.availability} />
                <SummaryRow label="Test Date" value={form.testDate} />
                <SummaryRow label="Accommodations" value={form.accommodations} />
                <SummaryRow label="Preferred Contact" value={form.preferredContact} />
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
                {submitting ? 'Submitting…' : 'Submit & Book My Onboarding Call →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ParentOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: NAVY, borderTopColor: 'transparent' }} />
      </div>
    }>
      <ParentFormInner />
    </Suspense>
  );
}
