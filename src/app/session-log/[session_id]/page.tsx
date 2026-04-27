'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

const NAVY = '#1e2090';
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px', boxSizing: 'border-box' };

export default function SessionLogPage() {
  const { session_id } = useParams();
  const [step, setStep] = useState<'form' | 'submitting' | 'done' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState({
    actual_duration_minutes: '60',
    went_well: '',
    issues: '',
    follow_up_needed: false,
    math_score: '',
    reading_score: '',
    writing_score: '',
    confidence_level: 0,
    reschedule_requested: false,
    reschedule_reason: 'Tutor Request',
    reschedule_preferred_time: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.confidence_level === 0) {
      alert('Please select a confidence rating before submitting.');
      return;
    }
    setStep('submitting');
    try {
      const payload: Record<string, unknown> = {
        session_id,
        actual_duration_minutes: parseInt(form.actual_duration_minutes),
        went_well: form.went_well || null,
        issues: form.issues || null,
        follow_up_needed: form.follow_up_needed,
        confidence_level: form.confidence_level,
        reschedule_requested: form.reschedule_requested,
        reschedule_reason: form.reschedule_requested ? form.reschedule_reason : null,
        reschedule_preferred_time: form.reschedule_requested && form.reschedule_preferred_time ? form.reschedule_preferred_time : null,
      };
      if (form.math_score)    payload.math_score    = parseInt(form.math_score);
      if (form.reading_score) payload.reading_score = parseInt(form.reading_score);
      if (form.writing_score) payload.writing_score = parseInt(form.writing_score);

      const res = await fetch('/api/session-log', {
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

  if (step === 'done') return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Log Submitted!</h1>
        <p style={{ color: '#6b7280', fontSize: '16px' }}>Thanks for submitting your session notes. You&apos;re all set!</p>
      </div>
    </div>
  );

  if (step === 'error') return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>❌</div>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Something went wrong</h1>
        <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '24px' }}>{errorMsg}</p>
        <button onClick={() => setStep('form')} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>Try Again</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '40px', maxWidth: '560px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ background: NAVY, borderRadius: '8px', padding: '20px 24px', marginBottom: '32px' }}>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', margin: 0 }}>StudyCore</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', margin: '4px 0 0' }}>Session Log</p>
        </div>
        <p style={{ color: '#374151', fontSize: '15px', marginBottom: '28px' }}>Hi! Please fill out this quick log for the session that just ended.</p>
        <form onSubmit={handleSubmit}>
          {/* Duration */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>⏱ Actual Session Duration</label>
            <select value={form.actual_duration_minutes} onChange={e => setForm(f => ({ ...f, actual_duration_minutes: e.target.value }))} required style={inputStyle}>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="75">75 minutes</option>
              <option value="90">90 minutes</option>
              <option value="105">105 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </div>

          {/* Went well */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>📝 What did you cover? Any wins?</label>
            <textarea value={form.went_well} onChange={e => setForm(f => ({ ...f, went_well: e.target.value }))} placeholder="e.g. Worked through reading comprehension, student improved on main idea questions..." rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Issues */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>⚠️ Any issues or concerns?</label>
            <textarea value={form.issues} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))} placeholder="e.g. Student seemed distracted, needs more work on algebra..." rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Progress Update */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '24px', marginBottom: '20px' }}>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>📊 Progress Update</p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>Optional — enter SAT section scores if you did practice tests this session.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {([
                { key: 'math_score' as const,    label: '📐 Math' },
                { key: 'reading_score' as const, label: '📖 Reading' },
                { key: 'writing_score' as const, label: '✏️ Writing' },
              ]).map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>{label}</label>
                  <input
                    type="number"
                    min={200}
                    max={800}
                    step={10}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder="200–800"
                    style={{ ...inputStyle, fontSize: '14px' }}
                  />
                </div>
              ))}
            </div>

            {/* Confidence */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>
                ⭐ Overall confidence this week <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, confidence_level: n }))}
                    style={{ fontSize: '30px', background: 'none', border: 'none', cursor: 'pointer', opacity: form.confidence_level >= n ? 1 : 0.2, transition: 'opacity 0.15s', padding: '2px', lineHeight: 1 }}
                    aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
                {form.confidence_level > 0 && (
                  <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '8px' }}>
                    {['', 'Struggling', 'Needs work', 'Making progress', 'Doing well', 'Excellent'][form.confidence_level]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Follow-up */}
          <div style={{ marginBottom: '16px', background: '#f9fafb', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input type="checkbox" id="follow_up" checked={form.follow_up_needed} onChange={e => setForm(f => ({ ...f, follow_up_needed: e.target.checked }))} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: NAVY }} />
            <label htmlFor="follow_up" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', cursor: 'pointer' }}>Flag for admin follow-up (no-show, billing issue, etc.)</label>
          </div>

          {/* Reschedule request */}
          <div style={{ marginBottom: '28px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: form.reschedule_requested ? '16px' : '0' }}>
              <input type="checkbox" id="reschedule_req" checked={form.reschedule_requested} onChange={e => setForm(f => ({ ...f, reschedule_requested: e.target.checked }))} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }} />
              <label htmlFor="reschedule_req" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', cursor: 'pointer' }}>This session needs to be rescheduled</label>
            </div>
            {form.reschedule_requested && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Reason</label>
                  <select value={form.reschedule_reason} onChange={e => setForm(f => ({ ...f, reschedule_reason: e.target.value }))} style={inputStyle}>
                    <option>Tutor Request</option>
                    <option>Client Request</option>
                    <option>Technical Issue</option>
                    <option>Emergency</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Preferred New Time (optional)</label>
                  <input type="text" value={form.reschedule_preferred_time} onChange={e => setForm(f => ({ ...f, reschedule_preferred_time: e.target.value }))} placeholder="e.g. Thursday at 4pm, or any weekday morning" style={inputStyle} />
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={step === 'submitting'} style={{ width: '100%', background: step === 'submitting' ? '#9ca3af' : NAVY, color: '#fff', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '16px', fontWeight: '600', cursor: step === 'submitting' ? 'not-allowed' : 'pointer' }}>
            {step === 'submitting' ? 'Submitting...' : 'Submit Session Log'}
          </button>
        </form>
      </div>
    </div>
  );
}
