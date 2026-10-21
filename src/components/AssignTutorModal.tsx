'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

const SAT_DATES = [
  { value: '2026-10-03', label: 'SAT — Oct 3, 2026' },
  { value: '2026-11-07', label: 'SAT — Nov 7, 2026' },
  { value: '2026-12-05', label: 'SAT — Dec 5, 2026' },
  { value: '2027-03-06', label: 'SAT — Mar 6, 2027' },
  { value: '2027-05-01', label: 'SAT — May 1, 2027' },
  { value: '2027-06-05', label: 'SAT — Jun 5, 2027' },
  { value: '2027-08-28', label: 'SAT — Aug 28, 2027' },
  { value: '2027-10-02', label: 'SAT — Oct 2, 2027' },
  { value: '2027-11-06', label: 'SAT — Nov 6, 2027' },
  { value: '2027-12-04', label: 'SAT — Dec 4, 2027' },
];

interface StudentProp {
  studentName: string;
  parentName: string;
  parentEmail: string;
  currentScore: string;
  targetScore: string;
  availability: string;
  sessionsPerWeek: string;
  opportunityId: string;
  contactId: string;
  hoursPurchased: number;
  startDate: string;
}

interface Props {
  student: StudentProp;
  airtableTestDate?: string; // YYYY-MM-DD
  onClose: () => void;
  onSuccess: (tutorName: string) => void;
}

type Step = 'tutor-info' | 'diagnostic' | 'program' | 'generating' | 'review' | 'sending' | 'done';

interface GeneratedPlans {
  tutorPlanPdfB64: string;
  internalBriefPdfB64: string;
  studentPlanPdfB64: string;
  trackerUrl?: string;
  programSummary?: Record<string, unknown>;
}

function downloadPdf(b64: string, filename: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AssignTutorModal({ student, airtableTestDate, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('tutor-info');

  // Step 1 — tutor info
  const [tutorName, setTutorName]       = useState('');
  const [tutorEmail, setTutorEmail]     = useState('');
  const [zoomUrl, setZoomUrl]           = useState('');
  const [firstSession, setFirstSession] = useState('');
  const [notes, setNotes]               = useState('');

  // Step 2 — diagnostic
  const [hsStudents, setHsStudents]         = useState<{ id: string; name: string; topicAccuracy: { topicName: string; total: number; accuracyPercent: number }[] }[]>([]);
  const [hsLoading, setHsLoading]           = useState(false);
  const [hsError, setHsError]               = useState('');
  const [hsSearch, setHsSearch]             = useState(student.studentName);
  const [selectedHs, setSelectedHs]         = useState<typeof hsStudents[0] | null>(null);
  const [diagnosticEntries, setDiagnosticEntries] = useState<{ platformName: string; qs: number; mastery: number }[] | null>(null);
  const [pdfFile, setPdfFile]               = useState<File | null>(null);
  const [pdfParsing, setPdfParsing]         = useState(false);
  const [pdfParsed, setPdfParsed]           = useState<{ diagnosticEntries: typeof diagnosticEntries; baselineScore?: number } | null>(null);
  const [pdfError, setPdfError]             = useState('');
  const [showPdfFallback, setShowPdfFallback] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — program details
  const defaultTestDate = airtableTestDate || '';
  const defaultFreq = (student.sessionsPerWeek || '2').replace(/x.*/, '') === '3' ? '3x' : (student.sessionsPerWeek || '2').replace(/x.*/, '') === '1' ? '1x' : '2x';
  const [program, setProgram] = useState({
    studentName:       student.studentName,
    baselineScore:     student.currentScore || '',
    targetScore:       student.targetScore || '',
    targetTestDate:    defaultTestDate,
    sessionFrequency:  defaultFreq,
    grade:             '',
    programStartDate:  '',
    rwScore:           '',
    mathScore:         '',
    blanks:            '0',
    programNotes:      '',
    sessionsPurchased: student.hoursPurchased > 0 ? String(Math.round(student.hoursPurchased)) : '',
  });
  const [showCustomDate, setShowCustomDate] = useState(false);

  // Step 4 — generating
  const [progressMsgs, setProgressMsgs] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState('');

  // Step 5 — review/send
  const [plans, setPlans]           = useState<GeneratedPlans | null>(null);
  const [sendError, setSendError]   = useState('');

  // Load HS students on mount
  useEffect(() => {
    setHsLoading(true);
    fetch('/api/gameplan/highscores-students')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setHsError(d.error); return; }
        setHsStudents(d.students || []);
      })
      .catch(e => setHsError(e.message))
      .finally(() => setHsLoading(false));
  }, []);

  // Auto-select when HS students load and name matches
  useEffect(() => {
    if (hsStudents.length === 0 || selectedHs) return;
    const name = student.studentName.toLowerCase();
    const match = hsStudents.find(s => s.name?.toLowerCase() === name);
    if (match) {
      setSelectedHs(match);
      setDiagnosticEntries(match.topicAccuracy.map(t => ({
        platformName: t.topicName,
        qs: t.total,
        mastery: t.accuracyPercent,
      })));
    }
  }, [hsStudents, student.studentName, selectedHs]);

  const hsFiltered = useMemo(() => {
    const q = hsSearch.toLowerCase();
    return hsStudents.filter(s => s.name?.toLowerCase().includes(q)).slice(0, 12);
  }, [hsStudents, hsSearch]);

  function selectHsStudent(s: typeof hsStudents[0]) {
    setSelectedHs(s);
    setDiagnosticEntries(s.topicAccuracy.map(t => ({
      platformName: t.topicName,
      qs: t.total,
      mastery: t.accuracyPercent,
    })));
    setShowPdfFallback(false);
    setPdfParsed(null);
  }

  async function handlePdfFile(file: File) {
    setPdfFile(file);
    setPdfError('');
    setPdfParsing(true);
    setPdfParsed(null);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await fetch('/api/gameplan/parse-diagnostic', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { setPdfError(data.error || 'Parse failed'); return; }
      setPdfParsed(data);
      setDiagnosticEntries(data.diagnosticEntries);
      if (data.baselineScore) setProgram(p => ({ ...p, baselineScore: String(data.baselineScore) }));
      if (data.rwScore) setProgram(p => ({ ...p, rwScore: String(data.rwScore) }));
      if (data.mathScore) setProgram(p => ({ ...p, mathScore: String(data.mathScore) }));
      if (data.blanks != null) setProgram(p => ({ ...p, blanks: String(data.blanks) }));
    } catch (e: any) {
      setPdfError(e.message);
    } finally {
      setPdfParsing(false);
    }
  }

  async function handleGenerate() {
    setGenerateError('');
    setProgressMsgs([]);
    setStep('generating');
    setPlans(null);

    try {
      const response = await fetch('/api/gameplan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentData: {
            ...program,
            currentTutor: tutorName,
          },
          diagnosticEntries,
          planType: 'standard',
        }),
      });

      if (!response.ok) {
        setGenerateError(`Server error: ${response.statusText}`);
        setStep('program');
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const raw of lines) {
          if (!raw.trim()) continue;
          try {
            const event = JSON.parse(raw);
            if (event.status === 'error') {
              setGenerateError(event.error);
              setStep('program');
              return;
            } else if (['generating', 'building', 'routing_complete', 'saving'].includes(event.status)) {
              setProgressMsgs(prev => [...prev, event.message]);
            } else if (event.status === 'done') {
              setPlans({
                tutorPlanPdfB64:    event.gameplanBase64,
                internalBriefPdfB64: event.internalPlanBase64,
                studentPlanPdfB64:  event.studentPlanBase64,
                trackerUrl:         event.trackerUrl,
                programSummary:     event.programSummary,
              });
              setProgressMsgs(prev => [...prev, 'Done!']);
              setStep('review');
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (e: any) {
      setGenerateError(e.message);
      setStep('program');
    }
  }

  async function handleConfirmAndSend() {
    if (!plans) return;
    setSendError('');
    setStep('sending');

    try {
      const res = await fetch('/api/confirm-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId:    student.opportunityId,
          contactId:        student.contactId,
          studentName:      program.studentName,
          studentEmail:     '',
          parentEmail:      student.parentEmail,
          parentName:       student.parentName,
          currentScore:     program.baselineScore,
          targetScore:      program.targetScore,
          availability:     student.availability,
          sessionsPerWeek:  program.sessionFrequency.replace('x', ''),
          tutorName,
          tutorEmail,
          zoomUrl,
          firstSession,
          notes,
          tutorPlanPdfB64:     plans.tutorPlanPdfB64,
          studentPlanPdfB64:   plans.studentPlanPdfB64,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSendError(err.error || `Request failed (${res.status})`);
        setStep('review');
        return;
      }

      setStep('done');
      onSuccess(tutorName);
    } catch (e: any) {
      setSendError(e.message);
      setStep('review');
    }
  }

  const canProceedDiagnostic = !!(diagnosticEntries && diagnosticEntries.length > 0);
  const canProceedProgram = !!(program.studentName && program.baselineScore && program.targetScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assign Tutor — {student.studentName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'tutor-info'  && 'Step 1 of 4 — Tutor details'}
              {step === 'diagnostic'  && 'Step 2 of 4 — Diagnostic data'}
              {step === 'program'     && 'Step 3 of 4 — Program details'}
              {step === 'generating'  && 'Generating gameplans…'}
              {step === 'review'      && 'Step 4 of 4 — Review & send'}
              {step === 'sending'     && 'Sending…'}
              {step === 'done'        && 'Done!'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
        </div>

        <div className="px-6 py-5">

          {/* ── STEP 1: Tutor Info ──────────────────────────────────────── */}
          {step === 'tutor-info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tutor Name <span className="text-red-500">*</span></label>
                  <input
                    value={tutorName} onChange={e => setTutorName(e.target.value)}
                    placeholder="First Last"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tutor Email <span className="text-red-500">*</span></label>
                  <input
                    type="email" value={tutorEmail} onChange={e => setTutorEmail(e.target.value)}
                    placeholder="tutor@email.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Zoom Link</label>
                  <input
                    value={zoomUrl} onChange={e => setZoomUrl(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Session Date</label>
                  <input
                    value={firstSession} onChange={e => setFirstSession(e.target.value)}
                    placeholder="e.g. Mon Oct 27, 4pm"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes for tutor</label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  rows={2} placeholder="Anything the tutor should know about this student"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  disabled={!tutorName || !tutorEmail}
                  onClick={() => setStep('diagnostic')}
                  className="bg-gray-900 disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                >
                  Next: Diagnostic Data →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Diagnostic ──────────────────────────────────────── */}
          {step === 'diagnostic' && (
            <div className="space-y-4">
              {/* HS auto-match status */}
              {hsLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
                  <span className="animate-spin">⏳</span> Loading platform data…
                </div>
              )}

              {!hsLoading && selectedHs && !showPdfFallback && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-600 font-bold text-sm">✓ Platform data loaded</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    <strong>{selectedHs.name}</strong> — {diagnosticEntries?.length} topics found on HighScores
                  </p>
                  <button
                    onClick={() => { setSelectedHs(null); setDiagnosticEntries(null); setShowPdfFallback(false); }}
                    className="mt-2 text-xs text-gray-500 underline"
                  >
                    Search for a different student
                  </button>
                </div>
              )}

              {!hsLoading && !selectedHs && !showPdfFallback && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Search HighScores platform</label>
                    <input
                      value={hsSearch}
                      onChange={e => setHsSearch(e.target.value)}
                      placeholder="Student name…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {hsFiltered.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      {hsFiltered.map(s => (
                        <button
                          key={s.id}
                          onClick={() => selectHsStudent(s)}
                          className="w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 hover:bg-gray-50"
                        >
                          {s.name}
                          <span className="text-gray-400 ml-2 text-xs">{s.topicAccuracy.length} topics</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {hsError && <p className="text-xs text-red-500">{hsError}</p>}
                  <button
                    onClick={() => setShowPdfFallback(true)}
                    className="text-xs text-gray-500 underline"
                  >
                    Student not on platform — upload diagnostic PDF instead
                  </button>
                </div>
              )}

              {/* PDF fallback */}
              {showPdfFallback && (
                <div className="space-y-3">
                  <div
                    onClick={() => !pdfParsing && pdfInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                      pdfParsed ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 bg-gray-50'
                    }`}
                  >
                    <div className="text-3xl mb-2">{pdfParsed ? '✅' : '📄'}</div>
                    <div className="text-sm font-medium text-gray-700">
                      {pdfParsing ? 'Parsing with Claude…' : pdfParsed ? pdfFile?.name : 'Drop diagnostic PDF or click to browse'}
                    </div>
                    {pdfParsed && (
                      <div className="text-xs text-gray-500 mt-1">
                        {diagnosticEntries?.length} topics parsed
                        {pdfParsed.baselineScore ? ` · Score: ${pdfParsed.baselineScore}` : ''}
                      </div>
                    )}
                    <input
                      ref={pdfInputRef} type="file" accept="application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}
                    />
                  </div>
                  {pdfError && <p className="text-xs text-red-500">{pdfError}</p>}
                  <button onClick={() => setShowPdfFallback(false)} className="text-xs text-gray-500 underline">
                    Back to platform search
                  </button>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('tutor-info')} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Back
                </button>
                <button
                  disabled={!canProceedDiagnostic}
                  onClick={() => setStep('program')}
                  className="bg-gray-900 disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                >
                  Next: Program Details →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Program Details ──────────────────────────────────── */}
          {step === 'program' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Student Name <span className="text-red-500">*</span></label>
                  <input
                    value={program.studentName} onChange={e => setProgram(p => ({ ...p, studentName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Baseline Score <span className="text-red-500">*</span></label>
                  <input
                    type="number" value={program.baselineScore}
                    onChange={e => setProgram(p => ({ ...p, baselineScore: e.target.value }))}
                    placeholder="e.g. 1150" min="400" max="1600"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Score <span className="text-red-500">*</span></label>
                  <input
                    type="number" value={program.targetScore}
                    onChange={e => setProgram(p => ({ ...p, targetScore: e.target.value }))}
                    placeholder="e.g. 1400" min="400" max="1600"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">R&W Score</label>
                  <input
                    type="number" value={program.rwScore}
                    onChange={e => setProgram(p => ({ ...p, rwScore: e.target.value }))}
                    placeholder="e.g. 580"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Math Score</label>
                  <input
                    type="number" value={program.mathScore}
                    onChange={e => setProgram(p => ({ ...p, mathScore: e.target.value }))}
                    placeholder="e.g. 570"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">SAT Test Date</label>
                <select
                  value={showCustomDate ? '__custom__' : (program.targetTestDate || '')}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setShowCustomDate(true);
                      setProgram(p => ({ ...p, targetTestDate: '' }));
                    } else {
                      setShowCustomDate(false);
                      setProgram(p => ({ ...p, targetTestDate: e.target.value }));
                    }
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select test date —</option>
                  {SAT_DATES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  <option value="__custom__">Custom date…</option>
                </select>
                {showCustomDate && (
                  <input
                    type="date" value={program.targetTestDate}
                    onChange={e => setProgram(p => ({ ...p, targetTestDate: e.target.value }))}
                    className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Session Frequency</label>
                <div className="flex gap-2">
                  {(['1x', '2x', '3x'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setProgram(p => ({ ...p, sessionFrequency: f }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${
                        program.sessionFrequency === f
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {f === '3x' ? '3×/week' : f === '2x' ? '2×/week' : '1×/week'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Grade</label>
                  <input
                    value={program.grade} onChange={e => setProgram(p => ({ ...p, grade: e.target.value }))}
                    placeholder="e.g. 11"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date" value={program.programStartDate}
                    onChange={e => setProgram(p => ({ ...p, programStartDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Hours Purchased</label>
                  <input
                    type="number" value={program.sessionsPurchased}
                    onChange={e => setProgram(p => ({ ...p, sessionsPurchased: e.target.value }))}
                    placeholder="e.g. 20"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {generateError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {generateError}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('diagnostic')} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Back
                </button>
                <button
                  disabled={!canProceedProgram}
                  onClick={handleGenerate}
                  className="bg-blue-600 disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                >
                  Generate Gameplans →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Generating ──────────────────────────────────────── */}
          {step === 'generating' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 mb-3">Generating {program.studentName}'s gameplans…</p>
                <div className="space-y-1.5">
                  {progressMsgs.map((m, i) => (
                    <div
                      key={i}
                      className={`text-xs px-3 py-2 rounded-lg border-l-2 ${
                        i === progressMsgs.length - 1
                          ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {i === progressMsgs.length - 1 && <span className="mr-1.5">⏳</span>}{m}
                    </div>
                  ))}
                  {progressMsgs.length === 0 && (
                    <div className="text-xs text-blue-500 animate-pulse">Starting…</div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">This takes 30–60 seconds. Don't close this window.</p>
            </div>
          )}

          {/* ── STEP 5: Review & Send ───────────────────────────────────── */}
          {(step === 'review' || step === 'sending') && plans && (
            <div className="space-y-4">
              {/* Generated PDFs */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-green-700 mb-3">3 PDFs generated for {program.studentName}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => downloadPdf(plans.tutorPlanPdfB64, `${program.studentName}_Tutor_Gameplan.pdf`)}
                    className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg font-medium"
                  >
                    Tutor Gameplan PDF
                  </button>
                  {plans.internalBriefPdfB64 && (
                    <button
                      onClick={() => downloadPdf(plans.internalBriefPdfB64, `${program.studentName}_Internal_Brief.pdf`)}
                      className="text-xs bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium"
                    >
                      Internal Brief PDF
                    </button>
                  )}
                  {plans.studentPlanPdfB64 && (
                    <button
                      onClick={() => downloadPdf(plans.studentPlanPdfB64, `${program.studentName}_Student_Plan.pdf`)}
                      className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium"
                    >
                      Student Plan PDF
                    </button>
                  )}
                  {plans.trackerUrl && (
                    <a href={plans.trackerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium no-underline"
                    >
                      Mastery Tracker →
                    </a>
                  )}
                </div>
              </div>

              {/* What will be sent */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-700 mb-1">Clicking "Confirm & Send" will:</p>
                {[
                  { icon: '📝', label: `Send signing contract to ${tutorName} (${tutorEmail})` },
                  { icon: '📄', label: `Email Tutor Gameplan PDF to ${tutorName}` },
                  { icon: '👨‍👩‍👦', label: `Email Student Plan PDF to ${student.parentName} (${student.parentEmail})` },
                  { icon: '📱', label: 'Mark tutor as assigned in GHL' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {sendError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {sendError}
                </div>
              )}

              <div className="flex justify-between pt-1">
                <button
                  disabled={step === 'sending'}
                  onClick={() => setStep('program')}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                  ← Regenerate
                </button>
                <button
                  disabled={step === 'sending'}
                  onClick={handleConfirmAndSend}
                  className="bg-green-600 disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2"
                >
                  {step === 'sending' ? (
                    <><span className="animate-spin">⏳</span> Sending…</>
                  ) : (
                    'Confirm & Send Everything'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── DONE ───────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">✅</div>
              <div>
                <p className="font-semibold text-gray-900">{program.studentName} matched with {tutorName}</p>
                <p className="text-sm text-gray-500 mt-1">Contract, gameplans, and student plan sent.</p>
              </div>
              <button
                onClick={onClose}
                className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
