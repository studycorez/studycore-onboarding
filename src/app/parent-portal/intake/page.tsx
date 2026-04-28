'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Loader2, Check } from 'lucide-react';

const WEAK_AREAS = ['Math', 'Reading', 'Writing', 'Grammar', 'Algebra', 'Geometry', 'Data Analysis', 'Vocabulary'];
const LEARNING_STYLES = ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'];
const STUDY_HOURS = ['1-2', '3-5', '5-10', '10+'];
const GRADES = ['9th', '10th', '11th', '12th'];

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

function IntakeForm() {
  const { parent, loading } = useParentAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    current_score: '',
    target_score: '',
    test_date: '',
    grade: '',
    weak_areas: [] as string[],
    learning_style: '',
    school_name: '',
    gpa: '',
    study_hours_per_week: '',
    additional_notes: '',
  });

  const student = parent?.students.find(s => s.id === studentId);

  // Pre-fill if already submitted
  useEffect(() => {
    if (!student) return;
    setForm({
      current_score: student.current_score?.toString() ?? '',
      target_score: student.target_score?.toString() ?? '',
      test_date: student.test_date ?? '',
      grade: student.grade?.toString() ?? '',
      weak_areas: student.weak_areas ?? [],
      learning_style: student.learning_style ?? '',
      school_name: student.school_name ?? '',
      gpa: student.gpa ?? '',
      study_hours_per_week: student.study_hours_per_week ?? '',
      additional_notes: student.additional_notes ?? '',
    });
  }, [student]);

  function toggleWeakArea(area: string) {
    setForm(f => ({
      ...f,
      weak_areas: f.weak_areas.includes(area)
        ? f.weak_areas.filter(a => a !== area)
        : [...f.weak_areas, area],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/parent-portal/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        current_score: form.current_score ? parseInt(form.current_score) : null,
        target_score: form.target_score ? parseInt(form.target_score) : null,
        test_date: form.test_date || null,
        grade: form.grade ? parseInt(form.grade) : null,
        weak_areas: form.weak_areas.length ? form.weak_areas : null,
        learning_style: form.learning_style || null,
        school_name: form.school_name || null,
        gpa: form.gpa || null,
        study_hours_per_week: form.study_hours_per_week || null,
        additional_notes: form.additional_notes || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    router.push('/parent-portal/onboarding');
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

  if (!student) {
    return (
      <ParentPortalLayout parent={parent}>
        <div className="card p-10 text-center text-gray-400 max-w-2xl">
          Student not found.
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Student Intake Form</h1>
          <p className="text-gray-500 text-sm mt-1">
            Help us personalize {student.name}&apos;s tutoring program.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Scores */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">SAT Scores</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Current SAT Score</label>
                <input
                  type="number"
                  min={400}
                  max={1600}
                  step={10}
                  placeholder="e.g. 1150"
                  value={form.current_score}
                  onChange={e => setForm(f => ({ ...f, current_score: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Target SAT Score</label>
                <input
                  type="number"
                  min={400}
                  max={1600}
                  step={10}
                  placeholder="e.g. 1400"
                  value={form.target_score}
                  onChange={e => setForm(f => ({ ...f, target_score: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>SAT Test Date</label>
                <input
                  type="date"
                  value={form.test_date}
                  onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Grade Level</label>
                <select
                  value={form.grade}
                  onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select grade</option>
                  {GRADES.map(g => <option key={g} value={g.replace('th', '')}>{g} grade</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Weak Areas */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Weak Areas</h2>
            <p className="text-xs text-gray-500">Select all areas where your student needs the most help.</p>
            <div className="grid grid-cols-2 gap-2">
              {WEAK_AREAS.map(area => (
                <label key={area} className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => toggleWeakArea(area)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                      form.weak_areas.includes(area)
                        ? 'bg-navy-600 border-navy-600'
                        : 'border-gray-300 group-hover:border-navy-400'
                    }`}
                  >
                    {form.weak_areas.includes(area) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span
                    onClick={() => toggleWeakArea(area)}
                    className="text-sm text-gray-700 select-none"
                  >
                    {area}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Learning Style */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Learning Style</h2>
            <div className="grid grid-cols-2 gap-2">
              {LEARNING_STYLES.map(style => (
                <label key={style} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="learning_style"
                    value={style}
                    checked={form.learning_style === style}
                    onChange={() => setForm(f => ({ ...f, learning_style: style }))}
                    className="accent-navy-600"
                  />
                  <span className="text-sm text-gray-700">{style}</span>
                </label>
              ))}
            </div>
          </div>

          {/* School Info */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">School Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Current School</label>
                <input
                  type="text"
                  placeholder="e.g. Lincoln High School"
                  value={form.school_name}
                  onChange={e => setForm(f => ({ ...f, school_name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>GPA</label>
                <input
                  type="text"
                  placeholder="e.g. 3.7"
                  value={form.gpa}
                  onChange={e => setForm(f => ({ ...f, gpa: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Study Hours Per Week (outside sessions)</label>
              <select
                value={form.study_hours_per_week}
                onChange={e => setForm(f => ({ ...f, study_hours_per_week: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select hours</option>
                {STUDY_HOURS.map(h => <option key={h} value={h}>{h} hours/week</option>)}
              </select>
            </div>
          </div>

          {/* Additional Notes */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Additional Context</h2>
            <div>
              <label className={labelCls}>Anything else your tutor should know?</label>
              <textarea
                rows={4}
                placeholder="Learning accommodations, scheduling constraints, specific goals, concerns..."
                value={form.additional_notes}
                onChange={e => setForm(f => ({ ...f, additional_notes: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push('/parent-portal/onboarding')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Submit →'}
            </button>
          </div>
        </form>
      </div>
    </ParentPortalLayout>
  );
}

export default function IntakePage() {
  return (
    <Suspense fallback={
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-2xl">
          {[1, 2, 3].map(i => <div key={i} className="h-20 card rounded-xl" />)}
        </div>
      </ParentPortalLayout>
    }>
      <IntakeForm />
    </Suspense>
  );
}
