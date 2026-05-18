'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const NAVY = '#1e2090';
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '15px', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '14px', fontWeight: '600',
  color: '#374151', marginBottom: '8px',
};
const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb', paddingTop: '24px', marginTop: '24px',
};
const radioRowStyle: React.CSSProperties = {
  display: 'flex', gap: '12px', flexWrap: 'wrap',
};
const radioLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  fontSize: '14px', color: '#374151', cursor: 'pointer',
  padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db',
  transition: 'all 0.15s',
};

type HomeworkRow = { description: string; estimated_minutes: string };

type PrefillData = {
  session_id: string;
  tutor_id: string;
  tutor_name: string;
  student_id: string | null;
  student_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  already_submitted: boolean;
  is_late_filing: boolean;
};

export default function SessionReportPage() {
  const { session_id } = useParams<{ session_id: string }>();

  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [prefillError, setPrefillError] = useState('');
  const [assignedStudents, setAssignedStudents] = useState<{ id: string; name: string }[]>([]);

  // Step
  const [step, setStep] = useState<'loading' | 'form' | 'submitting' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // Attendance
  const [studentAttended, setStudentAttended] = useState<'yes' | 'no' | 'late' | ''>('');
  const [tutorAttended, setTutorAttended] = useState<'yes' | 'partial' | 'no_show' | ''>('');

  // Student override (B-path)
  const [useOverride, setUseOverride] = useState(false);
  const [overrideStudentId, setOverrideStudentId] = useState('');
  const [overrideFreetext, setOverrideFreetext] = useState('');

  // Session content
  const [durationMinutes, setDurationMinutes] = useState('');
  const [topicsCovered, setTopicsCovered] = useState('');
  const [engagementRating, setEngagementRating] = useState(0);

  // Homework
  const [homeworkAssigned, setHomeworkAssigned] = useState('');
  const [homeworkRows, setHomeworkRows] = useState<HomeworkRow[]>([{ description: '', estimated_minutes: '' }]);

  // Parent-facing
  const [concernsForParent, setConcernsForParent] = useState('');
  const [targetScoreRange, setTargetScoreRange] = useState('');
  const [extraPracticeAreas, setExtraPracticeAreas] = useState('');

  // Private
  const [privateTutorNotes, setPrivateTutorNotes] = useState('');

  useEffect(() => {
    if (!session_id) return;
    fetch(`/api/session-reports/prefill?session_id=${session_id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setPrefillError(d.error); setStep('error'); setErrorMsg(d.error); return; }
        if (d.already_submitted) { setStep('done'); return; }
        setPrefill(d);
        setDurationMinutes(String(d.duration_minutes ?? 60));
        // Fetch assigned students for B-path dropdown
        fetch(`/api/session-reports/assigned-students?tutor_id=${d.tutor_id}`)
          .then(r => r.json())
          .then(s => { if (Array.isArray(s)) setAssignedStudents(s); });
        setStep('form');
      })
      .catch(() => { setErrorMsg('Failed to load session info.'); setStep('error'); });
  }, [session_id]);

  function addHomeworkRow() {
    setHomeworkRows(rows => [...rows, { description: '', estimated_minutes: '' }]);
  }
  function removeHomeworkRow(i: number) {
    setHomeworkRows(rows => rows.filter((_, idx) => idx !== i));
  }
  function updateHomeworkRow(i: number, field: keyof HomeworkRow, val: string) {
    setHomeworkRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const totalHomeworkMinutes = homeworkRows.reduce((sum, r) => {
    const m = parseInt(r.estimated_minutes);
    return sum + (isNaN(m) ? 0 : m);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentAttended) { alert('Please select whether the student attended.'); return; }
    if (!tutorAttended)   { alert('Please select whether you attended.'); return; }
    if (!topicsCovered || topicsCovered.length < 10) { alert('Topics covered must be at least 10 characters.'); return; }
    if (!engagementRating) { alert('Please rate student engagement.'); return; }

    setStep('submitting');

    const filledHomeworkRows = homeworkRows.filter(r => r.description.trim());
    const requiresAdminApproval = useOverride && !overrideStudentId && !!overrideFreetext.trim();

    const payload: Record<string, unknown> = {
      session_id,
      student_attended: studentAttended,
      tutor_attended: tutorAttended,
      duration_minutes: parseInt(durationMinutes),
      topics_covered: topicsCovered,
      engagement_rating: engagementRating,
      homework_assigned: homeworkAssigned,
      homework_time_estimate_minutes: totalHomeworkMinutes > 0 ? totalHomeworkMinutes : null,
      concerns_for_parent: concernsForParent || null,
      target_score_range: targetScoreRange || null,
      extra_practice_areas: extraPracticeAreas || null,
      private_tutor_notes: privateTutorNotes || null,
      homework_items: filledHomeworkRows.map(r => ({
        description: r.description,
        estimated_minutes: r.estimated_minutes ? parseInt(r.estimated_minutes) : null,
      })),
    };

    if (useOverride) {
      if (overrideStudentId) {
        payload.override_student_id = overrideStudentId;
      } else {
        payload.requires_admin_approval = true;
        payload.override_student_name = overrideFreetext.trim();
      }
    }

    try {
      const res = await fetch('/api/session-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Submission failed'); }
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
      setStep('error');
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (step === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#6b7280', fontSize: '16px' }}>Loading session info…</p>
    </div>
  );

  if (step === 'done') return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Report Submitted!</h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>
          {prefill ? `Thanks, ${prefill.tutor_name}! Your session report has been recorded.` : 'Your session report has been recorded.'}
        </p>
      </div>
    </div>
  );

  if (step === 'error') return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>❌</div>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Something went wrong</h1>
        <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '24px' }}>{errorMsg || prefillError}</p>
        {!prefillError && (
          <button onClick={() => setStep('form')} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
            Try Again
          </button>
        )}
      </div>
    </div>
  );

  const scheduledDate = prefill ? new Date(prefill.scheduled_at).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) : '';

  const ENGAGEMENT_LABELS = ['', 'Not engaged', 'Low engagement', 'Moderate', 'Engaged', 'Highly engaged'];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '40px', maxWidth: '620px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div style={{ background: NAVY, borderRadius: '8px', padding: '20px 24px', marginBottom: '32px' }}>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', margin: 0 }}>StudyCore</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', margin: '4px 0 0' }}>Session Report</p>
        </div>

        {/* Late filing warning */}
        {prefill?.is_late_filing && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', fontSize: '14px', color: '#92400e' }}>
            ⚠️ <strong>Late filing:</strong> This session was more than 24 hours ago. The report will still be accepted.
          </div>
        )}

        {/* Session info */}
        {prefill && (
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '28px', fontSize: '14px', color: '#374151' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><span style={{ color: '#9ca3af', fontWeight: '600' }}>Tutor</span><br />{prefill.tutor_name}</div>
              <div><span style={{ color: '#9ca3af', fontWeight: '600' }}>Student</span><br />{prefill.student_name ?? '—'}</div>
              <div><span style={{ color: '#9ca3af', fontWeight: '600' }}>Scheduled</span><br />{scheduledDate}</div>
              <div><span style={{ color: '#9ca3af', fontWeight: '600' }}>Duration</span><br />{prefill.duration_minutes} min</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* ── Attendance ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Did the student attend? <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={radioRowStyle}>
              {(['yes', 'no', 'late'] as const).map(v => (
                <label key={v} style={{ ...radioLabelStyle, background: studentAttended === v ? '#e0e7ff' : '#fff', borderColor: studentAttended === v ? NAVY : '#d1d5db', fontWeight: studentAttended === v ? '600' : '400' }}>
                  <input type="radio" name="student_attended" value={v} checked={studentAttended === v} onChange={() => setStudentAttended(v)} style={{ display: 'none' }} />
                  {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Joined late'}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Did you (the tutor) attend? <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={radioRowStyle}>
              {(['yes', 'partial', 'no_show'] as const).map(v => (
                <label key={v} style={{ ...radioLabelStyle, background: tutorAttended === v ? '#e0e7ff' : '#fff', borderColor: tutorAttended === v ? NAVY : '#d1d5db', fontWeight: tutorAttended === v ? '600' : '400' }}>
                  <input type="radio" name="tutor_attended" value={v} checked={tutorAttended === v} onChange={() => setTutorAttended(v)} style={{ display: 'none' }} />
                  {v === 'yes' ? 'Yes, full session' : v === 'partial' ? 'Partial' : 'No-show'}
                </label>
              ))}
            </div>
          </div>

          {/* ── Student override (B-path) ──────────────────────────────────── */}
          <div style={{ marginBottom: '24px', background: '#f9fafb', borderRadius: '8px', padding: '14px 16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              <input type="checkbox" checked={useOverride} onChange={e => setUseOverride(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: NAVY }} />
              This report is for a different student than shown above
            </label>
            {useOverride && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {assignedStudents.length > 0 && (
                  <div>
                    <label style={{ ...labelStyle, marginBottom: '6px' }}>Select student</label>
                    <select value={overrideStudentId} onChange={e => setOverrideStudentId(e.target.value)} style={inputStyle}>
                      <option value="">— Not listed below —</option>
                      {assignedStudents.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!overrideStudentId && (
                  <div>
                    <label style={{ ...labelStyle, marginBottom: '6px' }}>Student name (if not listed)</label>
                    <input
                      type="text"
                      value={overrideFreetext}
                      onChange={e => setOverrideFreetext(e.target.value)}
                      placeholder="Type student name"
                      style={inputStyle}
                    />
                    {overrideFreetext && (
                      <p style={{ fontSize: '12px', color: '#92400e', marginTop: '6px', background: '#fffbeb', padding: '8px 10px', borderRadius: '6px' }}>
                        ⚠️ This report will be flagged for admin approval before payroll processing.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Session content ─────────────────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Actual duration <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required style={inputStyle}>
                {[30, 45, 60, 75, 90, 105, 120].map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Topics covered <span style={{ color: '#ef4444' }}>*</span></label>
              <textarea
                value={topicsCovered}
                onChange={e => setTopicsCovered(e.target.value)}
                placeholder="e.g. Reading comprehension — main idea, linear equations, essay outline technique"
                rows={3}
                required
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              {topicsCovered.length > 0 && topicsCovered.length < 10 && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>Must be at least 10 characters.</p>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Student engagement <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEngagementRating(n)}
                    style={{ fontSize: '30px', background: 'none', border: 'none', cursor: 'pointer', opacity: engagementRating >= n ? 1 : 0.2, transition: 'opacity 0.15s', padding: '2px', lineHeight: 1 }}
                    aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
                {engagementRating > 0 && (
                  <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '8px' }}>
                    {ENGAGEMENT_LABELS[engagementRating]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Homework ─────────────────────────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Homework assigned <span style={{ color: '#ef4444' }}>*</span></label>
              <textarea
                value={homeworkAssigned}
                onChange={e => setHomeworkAssigned(e.target.value)}
                placeholder="e.g. Complete practice problems pp. 45–52, review notes on inference questions. Write &quot;None&quot; if none assigned."
                rows={2}
                required
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Homework items <span style={{ fontSize: '12px', fontWeight: '400', color: '#9ca3af' }}>(optional — add individual tasks for student tracking)</span></label>
              {homeworkRows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={row.description}
                    onChange={e => updateHomeworkRow(i, 'description', e.target.value)}
                    placeholder={`Task ${i + 1} description`}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={row.estimated_minutes}
                    onChange={e => updateHomeworkRow(i, 'estimated_minutes', e.target.value)}
                    placeholder="min"
                    style={{ ...inputStyle, width: '70px' }}
                    title="Estimated minutes"
                  />
                  {homeworkRows.length > 1 && (
                    <button type="button" onClick={() => removeHomeworkRow(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1 }} title="Remove">×</button>
                  )}
                </div>
              ))}
              {totalHomeworkMinutes > 0 && (
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Total estimated: {totalHomeworkMinutes} min</p>
              )}
              <button type="button" onClick={addHomeworkRow} style={{ background: 'none', border: 'none', color: NAVY, fontSize: '14px', cursor: 'pointer', padding: 0, fontWeight: '500' }}>
                + Add task
              </button>
            </div>
          </div>

          {/* ── Parent-facing notes ──────────────────────────────────────────── */}
          <div style={sectionStyle}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent-visible notes</p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>These fields are shared with the parent after the session.</p>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Concerns for parent <span style={{ fontSize: '12px', fontWeight: '400', color: '#9ca3af' }}>(optional)</span></label>
              <textarea
                value={concernsForParent}
                onChange={e => setConcernsForParent(e.target.value)}
                placeholder="Anything the parent should know — e.g. student seemed very stressed about upcoming test"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Target score range <span style={{ fontSize: '12px', fontWeight: '400', color: '#9ca3af' }}>(optional)</span></label>
              <input
                type="text"
                value={targetScoreRange}
                onChange={e => setTargetScoreRange(e.target.value)}
                placeholder="e.g. 1300–1400"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Extra practice areas <span style={{ fontSize: '12px', fontWeight: '400', color: '#9ca3af' }}>(optional)</span></label>
              <input
                type="text"
                value={extraPracticeAreas}
                onChange={e => setExtraPracticeAreas(e.target.value)}
                placeholder="e.g. Quadratic equations, comma usage"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── Private tutor notes ──────────────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>
                Private tutor notes <span style={{ fontSize: '12px', fontWeight: '400', color: '#9ca3af' }}>(optional — not visible to parent or student)</span>
              </label>
              <textarea
                value={privateTutorNotes}
                onChange={e => setPrivateTutorNotes(e.target.value)}
                placeholder="Internal notes for admin — pacing concerns, session quality, anything you wouldn't want the parent to read"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* ── Submit ───────────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={step === 'submitting'}
            style={{
              width: '100%', background: step === 'submitting' ? '#9ca3af' : NAVY,
              color: '#fff', border: 'none', borderRadius: '8px', padding: '14px',
              fontSize: '16px', fontWeight: '600', cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
              marginTop: '8px',
            }}
          >
            {step === 'submitting' ? 'Submitting…' : 'Submit Session Report'}
          </button>
        </form>
      </div>
    </div>
  );
}
