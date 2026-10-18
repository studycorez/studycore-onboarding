'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// ─── SAT / PSAT test dates ─────────────────────────────────────────────────────
const SAT_PSAT_DATES = [
  { value: '2026-10-03', label: 'SAT — Oct 3, 2026' },
  { value: '2026-10-17', label: 'PSAT/NMSQT — Oct 17, 2026' },
  { value: '2026-11-07', label: 'SAT — Nov 7, 2026' },
  { value: '2026-12-05', label: 'SAT — Dec 5, 2026' },
  { value: '2027-03-06', label: 'SAT — Mar 6, 2027' },
  { value: '2027-05-01', label: 'SAT — May 1, 2027' },
  { value: '2027-06-05', label: 'SAT — Jun 5, 2027' },
  { value: '2027-08-28', label: 'SAT — Aug 28, 2027' },
  { value: '2027-09-18', label: 'SAT — Sep 18, 2027' },
  { value: '2027-10-02', label: 'SAT — Oct 2, 2027' },
  { value: '2027-11-06', label: 'SAT — Nov 6, 2027' },
  { value: '2027-12-04', label: 'SAT — Dec 4, 2027' },
];

function calcWeeksAndSessions(startDateStr, testDateStr, freq) {
  if (!testDateStr) return null;
  const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : new Date();
  const test  = new Date(testDateStr + 'T00:00:00');
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.round((test - start) / msPerWeek);
  if (weeks <= 0) return null;
  const perWeek = freq === '3x' ? 3 : freq === '2x' ? 2 : 1;
  return { weeks, sessionsAt1x: weeks, sessionsAt2x: weeks * 2, sessionsAt3x: weeks * 3, perWeek };
}

// Compress image files before upload to stay under Vercel's 4.5MB request limit.
// PDFs pass through unchanged. Images are resized (max 1600px) and re-encoded as JPEG @ 80%.
async function compressImage(file) {
  if (!file || file.type === 'application/pdf') return file;
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => resolve(new File([blob], file.name.replace(/\.(png|webp|gif)$/i, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg', 0.80
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fallback: use original
    img.src = url;
  });
}

// Estimate sessions needed and recommend a frequency based on target gain + weeks until test
function getRecommendedFreq(targetGain, weeks) {
  if (!targetGain || !weeks || weeks <= 0) return null;
  // Rough estimate: each 10-pt gain needs ~1 topic; each topic = 2 phases + 0.43 overhead = ~2.86 sessions
  const topicsEst   = Math.ceil(targetGain / 10 / 0.5 / 3); // misses needed / conversion / avg misses per topic
  const sessionsEst = Math.ceil(topicsEst * 2 * 1.43);
  const ratio = sessionsEst / weeks;
  const freq  = ratio > 2.5 ? '3x' : ratio > 1.5 ? '2x' : '1x';
  const sessLabel = freq === '3x' ? weeks * 3 : freq === '2x' ? weeks * 2 : weeks;
  return { freq, sessionsEst, sessLabel, topicsEst };
}

// ─── Style constants ───────────────────────────────────────────────────────────
const NAVY   = '#1B365D';
const BLUE   = '#2E75B6';
const GREEN  = '#27AE60';
const ORANGE = '#D4740E';
const RED    = '#C0392B';
const BORDER = '#DDE3EC';
const BG     = '#F0F3F8';

const inp = {
  width: '100%',
  padding: '9px 10px',
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: 'white',
};

const btn = (color, disabled) => ({
  padding: '11px 24px',
  backgroundColor: disabled ? '#ccc' : color,
  color: 'white',
  border: 'none',
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background-color 0.15s',
});

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5, color: '#222' }}>
      {children}{required && <span style={{ color: RED }}> *</span>}
    </label>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {hint && <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      padding: 28,
      marginBottom: 20,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── PDF Upload Zone ───────────────────────────────────────────────────────────
function UploadZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') onFile(file);
  }, [onFile, disabled]);

  const handleDragOver = (e) => { e.preventDefault(); if (!disabled) setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        border: `2px dashed ${dragging ? BLUE : BORDER}`,
        borderRadius: 8,
        padding: '40px 24px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: dragging ? '#EAF3FB' : (disabled ? '#F7F7F7' : '#FAFBFD'),
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: disabled ? '#aaa' : NAVY, marginBottom: 4 }}>
        {disabled ? 'Processing…' : 'Drop PDF here or click to browse'}
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>StudyCore diagnostic report (PDF)</div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }}
        disabled={disabled}
      />
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Upload Diagnostic', 'Program Details', 'Generate'];
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done   = step > n;
        return (
          <div key={n} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              backgroundColor: active ? NAVY : done ? BLUE : '#D8E0EA',
              color: active || done ? 'white' : '#888',
              borderRadius: 4,
              padding: '8px 4px',
              fontSize: 12,
              fontWeight: active ? 700 : 400,
            }}>
              {n}. {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Parsed data preview ───────────────────────────────────────────────────────
function ParsedPreview({ parsed }) {
  if (!parsed) return null;
  return (
    <div style={{
      backgroundColor: '#EAFAF1',
      border: `1px solid ${GREEN}`,
      borderRadius: 6,
      padding: 16,
      marginTop: 16,
    }}>
      <div style={{ fontWeight: 700, color: GREEN, fontSize: 14, marginBottom: 10 }}>
        Parsed successfully
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Student', value: parsed.studentName || '—' },
          { label: 'Score', value: parsed.baselineScore ? String(parsed.baselineScore) : '—' },
          { label: 'Topics found', value: parsed.diagnosticEntries?.length ? `${parsed.diagnosticEntries.length} topics` : '—' },
          { label: 'R&W', value: parsed.rwScore ? String(parsed.rwScore) : '—' },
          { label: 'Math', value: parsed.mathScore ? String(parsed.mathScore) : '—' },
          { label: 'Blanks', value: parsed.blanks != null ? String(parsed.blanks) : '—' },
        ].map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{c.value}</div>
          </div>
        ))}
      </div>
      {parsed.testDate && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
          Test date: <strong>{parsed.testDate}</strong>
        </div>
      )}
    </div>
  );
}

// ─── Progress messages ─────────────────────────────────────────────────────────
function ProgressLog({ messages }) {
  if (!messages.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      {messages.map((m, i) => (
        <div key={i} style={{
          padding: '7px 12px',
          backgroundColor: i === messages.length - 1 ? '#EAF3FB' : '#F7FAFD',
          borderLeft: `3px solid ${i === messages.length - 1 ? BLUE : BORDER}`,
          marginBottom: 4,
          fontSize: 12,
          color: i === messages.length - 1 ? BLUE : '#666',
          borderRadius: '0 4px 4px 0',
        }}>
          {i === messages.length - 1 && <span style={{ marginRight: 6 }}>⏳</span>}{m}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function GameplanGenerator() {
  const [step, setStep]           = useState(1);

  // Step 1 state
  const [parsing, setParsing]     = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed]       = useState(null); // raw Claude output
  const [pdfFile, setPdfFile]     = useState(null);

  // Step 2 state — student/program details (pre-filled from parsed, editable)
  const [student, setStudent] = useState({
    studentName: '',
    baselineScore: '',
    rwScore: '',
    mathScore: '',
    blanks: '0',
    targetScore: '',
    targetTestDate: '',
    currentTutor: '',
    sessionFrequency: '2x',
    grade: '',
    programStartDate: '',
    sessionsPurchased: '',
    sessionsCompleted: '',
    programNotes: '',
  });

  const [showCustomDate, setShowCustomDate] = useState(false);

  // Guarantee mode state
  const [mode, setMode] = useState('new'); // 'new' | 'guarantee'
  const [scoreReportFile, setScoreReportFile] = useState(null);
  const [portalFiles, setPortalFiles] = useState([]);
  const [guaranteeParsing, setGuaranteeParsing] = useState(false);
  const [guaranteeParsed, setGuaranteeParsed] = useState(null);
  const [guaranteeParseError, setGuaranteeParseError] = useState('');
  const [srDrag, setSrDrag] = useState(false);
  const [portalDrag, setPortalDrag] = useState(false);
  const srInputRef = useRef();
  const portalInputRef = useRef();

  // Platform pull state
  const [pullMode, setPullMode]           = useState('pdf'); // 'pdf' | 'platform'
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null); // { id, name, topicAccuracy }
  const [platformData, setPlatformData]   = useState(null);
  const [platformError, setPlatformError] = useState('');
  const [hsStudents, setHsStudents]       = useState([]);
  const [hsLoading, setHsLoading]         = useState(false);

  // Step 3 state
  const [generating, setGenerating]   = useState(false);
  const [progressMsgs, setProgressMsgs] = useState([]);
  const [generateError, setGenerateError] = useState('');
  const [result, setResult]           = useState(null); // { trackerUrl, programSummary, pdfBase64, studentName }

  // Weekly schedule state (active when test date is set)
  const [weeklySchedule, setWeeklySchedule] = useState([]);
  const [schedDefSessions, setSchedDefSessions] = useState(2);
  const [schedDefHours, setSchedDefHours] = useState(1);
  const [weeksOverride, setWeeksOverride] = useState(''); // manual override of auto-calculated weeks

  // Build/reset weekly schedule when test date, start date, or weeks override changes
  useEffect(() => {
    if (!student.targetTestDate && !weeksOverride) { setWeeklySchedule([]); return; }
    let weeksCount;
    if (weeksOverride && parseInt(weeksOverride) > 0) {
      weeksCount = parseInt(weeksOverride);
    } else if (student.targetTestDate) {
      const start = student.programStartDate
        ? new Date(student.programStartDate + 'T00:00:00')
        : new Date();
      const end = new Date(student.targetTestDate + 'T00:00:00');
      weeksCount = Math.max(1, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)));
    } else {
      setWeeklySchedule([]); return;
    }
    const defSess = student.sessionFrequency === '3x' ? 3 : student.sessionFrequency === '2x' ? 2 : 1;
    setSchedDefSessions(defSess);
    setWeeklySchedule(Array.from({ length: weeksCount }, (_, i) => ({
      week: i + 1,
      sessions: defSess,
      hoursPerSession: schedDefHours,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.targetTestDate, student.programStartDate, weeksOverride]);

  // Load HighScores student list when switching to platform mode
  const loadHsStudents = () => {
    setHsLoading(true);
    setPlatformError('');
    setHsStudents([]);
    fetch('/api/gameplan/highscores-students')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setPlatformError(d.error); return; }
        setHsStudents(d.students || []);
      })
      .catch(e => setPlatformError(e.message))
      .finally(() => setHsLoading(false));
  };

  useEffect(() => {
    if (pullMode !== 'platform' && mode !== 'group') return;
    loadHsStudents();
  }, [pullMode, mode]);

  const handleStudentChange = e => {
    const { name, value } = e.target;
    setStudent(prev => ({ ...prev, [name]: value }));
  };

  // Client-side filter of HighScores student list
  const hsFiltered = useMemo(() => {
    if (!studentSearch.trim()) return hsStudents.slice(0, 12);
    const q = studentSearch.toLowerCase();
    return hsStudents.filter(s => s.name?.toLowerCase().includes(q)).slice(0, 15);
  }, [studentSearch, hsStudents]);

  const handleSelectHsStudent = (s) => {
    setSelectedStudent(s);
    setPlatformError('');
    const diagnosticEntries = s.topicAccuracy.map(t => ({
      platformName: t.topicName,
      qs: t.total,
      mastery: t.accuracyPercent,
    }));
    setPlatformData({
      diagnosticEntries,
      topicCount: s.topicAccuracy.length,
      assignmentCompletion: s.assignmentCompletion,
    });
    setStudent(prev => ({ ...prev, studentName: s.name || prev.studentName }));
  };

  const handleGuaranteeParse = async () => {
    if (!scoreReportFile) return;
    setGuaranteeParsing(true);
    setGuaranteeParsed(null);
    setGuaranteeParseError('');
    try {
      const [compressedScore, ...compressedPortal] = await Promise.all([
        compressImage(scoreReportFile),
        ...portalFiles.map(f => compressImage(f)),
      ]);
      const fd = new FormData();
      fd.append('scoreReport', compressedScore);
      compressedPortal.forEach((f, i) => fd.append(`portalScreenshot_${i}`, f));
      const res = await fetch('/api/gameplan/parse-guarantee', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { setGuaranteeParseError(data.error || 'Parse failed'); return; }
      setGuaranteeParsed(data);
      // Pre-fill student form from score report
      const sr = data.scoreReport || {};
      setStudent(prev => ({
        ...prev,
        studentName: sr.studentName || prev.studentName,
        baselineScore: sr.totalScore != null ? String(sr.totalScore) : prev.baselineScore,
        rwScore: sr.rwScore != null ? String(sr.rwScore) : prev.rwScore,
        mathScore: sr.mathScore != null ? String(sr.mathScore) : prev.mathScore,
        sessionsCompleted: data.portal?.sessionsCompleted != null ? String(data.portal.sessionsCompleted) : prev.sessionsCompleted,
      }));
    } catch (err) {
      setGuaranteeParseError(err.message);
    } finally {
      setGuaranteeParsing(false);
    }
  };

  // ── Step 1: Upload + parse ────────────────────────────────────────────────
  const handleFile = async (file) => {
    setPdfFile(file);
    setParsed(null);
    setParseError('');
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const res = await fetch('/api/gameplan/parse-diagnostic', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        setParseError(data.error || `Parse failed (${res.status})`);
        setParsing(false);
        return;
      }
      setParsed(data);
      // Pre-fill step 2 form
      setStudent(prev => ({
        ...prev,
        studentName:  data.studentName  || prev.studentName,
        baselineScore: data.baselineScore != null ? String(data.baselineScore) : prev.baselineScore,
        rwScore:      data.rwScore      != null ? String(data.rwScore)      : prev.rwScore,
        mathScore:    data.mathScore    != null ? String(data.mathScore)    : prev.mathScore,
        blanks:       data.blanks       != null ? String(data.blanks)       : prev.blanks,
        targetTestDate: data.testDate   || prev.targetTestDate,
      }));
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
    }
  };

  // ── Step 3: Generate ──────────────────────────────────────────────────────
  const downloadFile = (base64, filename) => {
    const binary = atob(base64);
    const arr    = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    setGenerateError('');
    setProgressMsgs([]);
    setGenerating(true);
    setResult(null);

    try {
      const response = await fetch('/api/gameplan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentData: {
            ...student,
            weeklySchedule: weeklySchedule.length > 0 ? weeklySchedule : null,
            weeksOverride: weeksOverride && parseInt(weeksOverride) > 0 ? parseInt(weeksOverride) : null,
            ...(mode === 'guarantee' && guaranteeParsed?.scoreReport?.domains ? {
              guaranteeDomains: guaranteeParsed.scoreReport.domains,
              coveredTopics: guaranteeParsed.portal?.topicsCovered || [],
            } : {}),
          },
          diagnosticEntries: mode === 'guarantee'
            ? null
            : (mode === 'group' || (mode === 'new' && pullMode === 'platform'))
              ? platformData?.diagnosticEntries
              : parsed?.diagnosticEntries,
          guaranteeMode: mode === 'guarantee',
          planType: mode === 'group' ? 'group' : 'standard',
        }),
      });

      if (!response.ok) {
        setGenerateError(`Server error: ${response.statusText}`);
        setGenerating(false);
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

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
              setGenerating(false);
              return;
            } else if (event.status === 'generating' || event.status === 'building' || event.status === 'routing_complete' || event.status === 'saving') {
              setProgressMsgs(prev => [...prev, event.message]);
            } else if (event.status === 'done') {
              if (event.planType === 'group') {
                downloadFile(event.groupPlanBase64, `${event.studentName}_Assignment_Schedule.pdf`);
                setResult({
                  planType:        'group',
                  programSummary:  event.programSummary,
                  groupPlanBase64: event.groupPlanBase64,
                  studentName:     event.studentName,
                });
              } else {
                downloadFile(event.gameplanBase64, `${event.studentName}_Gameplan.pdf`);
                setResult({
                  trackerUrl:         event.trackerUrl,
                  programSummary:     event.programSummary,
                  pdfBase64:          event.gameplanBase64,
                  internalPlanBase64: event.internalPlanBase64,
                  studentPlanBase64:  event.studentPlanBase64,
                  studentName:        event.studentName,
                });
              }
              setProgressMsgs(prev => [...prev, 'Done!']);
              setGenerating(false);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (err) {
      setGenerateError(err.message);
      setGenerating(false);
    }
  };

  const canAdvanceStep1 = mode === 'guarantee'
    ? (guaranteeParsed && !guaranteeParsing)
    : mode === 'group' ? (platformData !== null)
    : (pullMode === 'platform' ? (platformData !== null) : (parsed && !parsing));
  const canAdvanceStep2Group = mode === 'group' && !!student.studentName && !!student.baselineScore && !!student.targetScore;
  const canAdvanceStep2 = canAdvanceStep2Group || (student.studentName.trim() && student.baselineScore && student.targetScore);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG }}>

      {/* Header */}
      <div style={{
        backgroundColor: NAVY,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            backgroundColor: BLUE,
            color: 'white',
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 1,
            padding: '4px 10px',
            borderRadius: 3,
          }}>
            SC
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Gameplan Generator</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#8EA8C3', fontSize: 12 }}>Diagnostic-Driven · SAT</span>
          <a href="/gameplans" style={{ color: '#8EA8C3', fontSize: 12, textDecoration: 'none', borderBottom: '1px solid #8EA8C3', paddingBottom: 1 }}>View History</a>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
          {[
            { key: 'new', label: 'New Student', icon: '📋' },
            { key: 'group', label: 'Group Session', icon: '👥' },
            { key: 'guarantee', label: 'Guarantee Recovery', icon: '🔄' },
          ].map(m => (
            <button key={m.key} onClick={() => { setMode(m.key); setStep(1); setParsed(null); setGuaranteeParsed(null); setResult(null); }}
              style={{ flex: 1, padding: '10px 16px', border: 'none', backgroundColor: mode === m.key ? NAVY : 'white',
                color: mode === m.key ? 'white' : '#555', fontWeight: mode === m.key ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <StepBar step={step} />

        {/* ── STEP 1: Upload & Parse ──────────────────────────────────── */}
        {step === 1 && (
          <Card>
            {mode === 'new' && (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 4 }}>
                  {pullMode === 'platform' ? 'Pull from Platform' : 'Upload Diagnostic PDF'}
                </div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
                  {pullMode === 'platform'
                    ? 'Fetch the student\'s latest finished SAT attempt directly from the StudyCore platform.'
                    : 'Upload the StudyCore SAT diagnostic report. Claude will extract all topic data automatically.'}
                </div>

                {/* PDF vs Platform toggle */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
                  {[
                    { val: 'pdf',      label: 'Upload Diagnostic PDF' },
                    { val: 'platform', label: 'Pull from Platform' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => { setPullMode(opt.val); setPlatformData(null); setPlatformError(''); setSearchResults([]); setSelectedStudent(null); }}
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        border: 'none',
                        backgroundColor: pullMode === opt.val ? NAVY : 'white',
                        color: pullMode === opt.val ? 'white' : '#555',
                        fontWeight: pullMode === opt.val ? 700 : 400,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* PDF upload UI */}
                {pullMode === 'pdf' && (
                  <>
                    <UploadZone onFile={handleFile} disabled={parsing} />

                    {parsing && (
                      <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#EAF3FB', borderRadius: 4, fontSize: 13, color: BLUE, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>⏳</span> Parsing PDF with Claude…
                      </div>
                    )}

                    {parseError && (
                      <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#FDEDEC', borderRadius: 4, color: RED, fontSize: 13 }}>
                        <strong>Parse error:</strong> {parseError}
                        <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                          Check that the file is a valid StudyCore diagnostic PDF and that ANTHROPIC_API_KEY is set.
                        </div>
                      </div>
                    )}

                    {pdfFile && !parsing && !parseError && (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
                        File: <strong>{pdfFile.name}</strong>
                      </div>
                    )}

                    <ParsedPreview parsed={parsed} />
                  </>
                )}

                {/* Platform pull UI */}
                {pullMode === 'platform' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Student search */}
                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5, color: '#222' }}>
                        Student Name <span style={{ color: RED }}>*</span>
                      </label>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hsLoading ? 'Loading student list from platform…' : `${hsStudents.length} active students loaded · type to filter`}
                        {!hsLoading && (
                          <button
                            onClick={() => { setSelectedStudent(null); setPlatformData(null); setStudentSearch(''); loadHsStudents(); }}
                            style={{ fontSize: 10, color: BLUE, background: 'none', border: `1px solid ${BLUE}`, borderRadius: 3, cursor: 'pointer', padding: '1px 6px' }}
                          >
                            ↻ Refresh
                          </button>
                        )}
                      </div>
                      <input
                        value={studentSearch}
                        onChange={e => { setStudentSearch(e.target.value); setSelectedStudent(null); setPlatformData(null); }}
                        placeholder="Type student name…"
                        style={{ ...inp }}
                        disabled={hsLoading}
                      />
                    </div>

                    {/* Filtered results */}
                    {!hsLoading && studentSearch.trim() && hsFiltered.length > 0 && !selectedStudent && (
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden' }}>
                        {hsFiltered.map(s => (
                          <div
                            key={s.id}
                            onClick={() => handleSelectHsStudent(s)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              backgroundColor: 'white',
                              borderBottom: `1px solid ${BORDER}`,
                              fontSize: 13,
                              color: '#222',
                            }}
                          >
                            {s.name}
                            <span style={{ color: '#888', marginLeft: 8, fontSize: 11 }}>{s.topicAccuracy.length} topics</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!hsLoading && studentSearch.trim() && hsFiltered.length === 0 && !selectedStudent && (
                      <div style={{ fontSize: 12, color: '#888' }}>No students found matching "{studentSearch}"</div>
                    )}

                    {/* Platform error */}
                    {platformError && (
                      <div style={{ padding: '10px 12px', backgroundColor: '#FDEDEC', border: `1px solid ${RED}`, borderRadius: 4, color: RED, fontSize: 13 }}>
                        {platformError}
                      </div>
                    )}

                    {/* Success state */}
                    {platformData && selectedStudent && (
                      <div style={{ padding: '12px 14px', backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 4 }}>
                        <div style={{ fontWeight: 700, color: GREEN, fontSize: 13, marginBottom: 4 }}>
                          {selectedStudent.name} — data loaded
                        </div>
                        <div style={{ fontSize: 12, color: '#444' }}>
                          {platformData.topicCount} topics pulled from platform
                          {platformData.assignmentCompletion && ` · ${platformData.assignmentCompletion.completed}/${platformData.assignmentCompletion.total} assignments completed (${platformData.assignmentCompletion.completionPercent?.toFixed(0)}%)`}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>Enter baseline + target scores below to generate the gameplan</div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button
                    style={btn(NAVY, !canAdvanceStep1)}
                    disabled={!canAdvanceStep1}
                    onClick={() => setStep(2)}
                  >
                    Next: Program Details →
                  </button>
                </div>
              </>
            )}

            {mode === 'group' && (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 4 }}>
                  Group Session — Assignment Schedule
                </div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
                  Pull the student's diagnostic data from the StudyCore platform to generate a personalised weekly assignment schedule.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5, color: '#222' }}>
                      Student Name <span style={{ color: RED }}>*</span>
                    </label>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {hsLoading ? 'Loading student list from platform…' : `${hsStudents.length} active students loaded · type to filter`}
                      {!hsLoading && (
                        <button
                          onClick={() => { setSelectedStudent(null); setPlatformData(null); setStudentSearch(''); loadHsStudents(); }}
                          style={{ fontSize: 10, color: BLUE, background: 'none', border: `1px solid ${BLUE}`, borderRadius: 3, cursor: 'pointer', padding: '1px 6px' }}
                        >
                          ↻ Refresh
                        </button>
                      )}
                    </div>
                    <input
                      value={studentSearch}
                      onChange={e => { setStudentSearch(e.target.value); setSelectedStudent(null); setPlatformData(null); }}
                      placeholder="Type student name…"
                      style={{ ...inp }}
                      disabled={hsLoading}
                    />
                  </div>
                  {!hsLoading && studentSearch.trim() && hsFiltered.length > 0 && !selectedStudent && (
                    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden' }}>
                      {hsFiltered.map(s => (
                        <div key={s.id} onClick={() => handleSelectHsStudent(s)}
                          style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: 'white', borderBottom: `1px solid ${BORDER}`, fontSize: 13, color: '#222' }}>
                          {s.name}
                          <span style={{ color: '#888', marginLeft: 8, fontSize: 11 }}>{s.topicAccuracy.length} topics</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!hsLoading && studentSearch.trim() && hsFiltered.length === 0 && !selectedStudent && (
                    <div style={{ fontSize: 12, color: '#888' }}>No students found matching "{studentSearch}"</div>
                  )}
                  {platformError && (
                    <div style={{ padding: '10px 12px', backgroundColor: '#FDEDEC', border: `1px solid ${RED}`, borderRadius: 4, color: RED, fontSize: 13 }}>
                      {platformError}
                    </div>
                  )}
                  {platformData && selectedStudent && (
                    <div style={{ padding: '12px 14px', backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 4 }}>
                      <div style={{ fontWeight: 700, color: GREEN, fontSize: 13, marginBottom: 4 }}>
                        {selectedStudent.name} — data loaded
                      </div>
                      <div style={{ fontSize: 12, color: '#444' }}>
                        {platformData.topicCount} topics pulled from platform
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button
                    style={btn(NAVY, !canAdvanceStep1)}
                    disabled={!canAdvanceStep1}
                    onClick={() => setStep(2)}
                  >
                    Next: Program Details →
                  </button>
                </div>
              </>
            )}

            {mode === 'guarantee' && (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 4 }}>
                  Upload Score Report & Portal
                </div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
                  Upload the student's official SAT score report and optionally their StudyCore portal screenshot.
                </div>

                {/* Score Report upload */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#222', marginBottom: 6 }}>
                    Score Report <span style={{ color: RED }}>*</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Image (JPG/PNG/WEBP) or PDF</div>
                  <div
                    onClick={() => srInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setSrDrag(true); }}
                    onDragLeave={() => setSrDrag(false)}
                    onDrop={e => { e.preventDefault(); setSrDrag(false); const f = e.dataTransfer.files[0]; if (f) setScoreReportFile(f); }}
                    style={{
                      border: `2px dashed ${srDrag ? BLUE : scoreReportFile ? GREEN : BORDER}`,
                      borderRadius: 8, padding: '28px 24px', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: srDrag ? '#EAF3FB' : scoreReportFile ? '#EAFAF1' : '#FAFBFD',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{scoreReportFile ? '✅' : '📄'}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: scoreReportFile ? GREEN : NAVY, marginBottom: 4 }}>
                      {scoreReportFile ? scoreReportFile.name : srDrag ? 'Drop it here' : 'Drop here or click to browse'}
                    </div>
                    {!scoreReportFile && <div style={{ fontSize: 11, color: '#888' }}>Official SAT score report (image or PDF)</div>}
                    <input ref={srInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files[0]; if (f) setScoreReportFile(f); }} />
                  </div>
                </div>

                {/* Platform report upload */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#222', marginBottom: 6 }}>
                    StudyCore Platform Reports <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>(optional)</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Latest test score report from the StudyCore platform — shows topics covered and performance</div>
                  <div
                    onClick={() => portalInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setPortalDrag(true); }}
                    onDragLeave={() => setPortalDrag(false)}
                    onDrop={e => {
                      e.preventDefault(); setPortalDrag(false);
                      const files = Array.from(e.dataTransfer.files)
                        .filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
                      if (files.length) setPortalFiles(prev => [...prev, ...files]);
                    }}
                    style={{
                      border: `2px dashed ${portalDrag ? BLUE : portalFiles.length > 0 ? BLUE : BORDER}`,
                      borderRadius: 8, padding: '20px 24px', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: portalDrag ? '#EAF3FB' : portalFiles.length > 0 ? '#EAF3FB' : '#FAFBFD',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{portalFiles.length > 0 ? '✅' : '📊'}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: portalFiles.length > 0 ? BLUE : '#777', marginBottom: 2 }}>
                      {portalFiles.length > 0 ? `${portalFiles.length} file${portalFiles.length > 1 ? 's' : ''} selected` : portalDrag ? 'Drop report here' : 'Drop here or click to browse'}
                    </div>
                    {portalFiles.length > 0
                      ? <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{portalFiles.map(f => f.name).join(' · ')}</div>
                      : <div style={{ fontSize: 11, color: '#888' }}>Upload as many as needed — one per section, topic area, etc.</div>
                    }
                    <input ref={portalInputRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
                      onChange={e => setPortalFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  </div>
                </div>

                {/* Parse button */}
                <div style={{ marginBottom: 12 }}>
                  <button
                    style={btn(BLUE, !scoreReportFile || guaranteeParsing)}
                    disabled={!scoreReportFile || guaranteeParsing}
                    onClick={handleGuaranteeParse}
                  >
                    {guaranteeParsing ? '⏳ Parsing Documents…' : 'Parse Documents'}
                  </button>
                </div>

                {/* Error */}
                {guaranteeParseError && (
                  <div style={{ padding: '10px 14px', backgroundColor: '#FDEDEC', borderRadius: 4, color: RED, fontSize: 13, marginBottom: 12 }}>
                    <strong>Parse error:</strong> {guaranteeParseError}
                  </div>
                )}

                {/* Parsed result display */}
                {guaranteeParsed && (
                  <div style={{ backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: GREEN, fontSize: 14, marginBottom: 10 }}>
                      Documents parsed successfully
                    </div>
                    {/* Scores */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Total Score', value: guaranteeParsed.scoreReport?.totalScore ?? '—' },
                        { label: 'R&W', value: guaranteeParsed.scoreReport?.rwScore ?? '—' },
                        { label: 'Math', value: guaranteeParsed.scoreReport?.mathScore ?? '—' },
                        { label: 'Student', value: guaranteeParsed.scoreReport?.studentName || '—' },
                        { label: 'Test Date', value: guaranteeParsed.scoreReport?.testDate || '—' },
                        { label: 'Topics Covered', value: guaranteeParsed.portal?.topicsCovered?.length ? `${guaranteeParsed.portal.topicsCovered.length} topics` : '—' },
                      ].map((c, i) => (
                        <div key={i}>
                          <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                          <div style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>{c.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Domain bands */}
                    {guaranteeParsed.scoreReport?.domains && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Domain Bands</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {Object.entries(guaranteeParsed.scoreReport.domains).map(([key, band]) => {
                            if (!band || band === 'N/A') return null;
                            const DOMAIN_LABELS = { cs:'Craft & Struct', ii:'Info & Ideas', eoi:'Expression', sec:'Conventions', alg:'Algebra', am:'Adv Math', psda:'Data Analysis', gt:'Geometry' };
                            const lowBands = ['Below 400','400\u2013450','450\u2013500','490\u2013540','500\u2013550'];
                            const isLow = lowBands.includes(band);
                            return (
                              <div key={key} style={{
                                backgroundColor: isLow ? '#FDEDEC' : '#EAFAF1',
                                border: `1px solid ${isLow ? RED : GREEN}`,
                                borderRadius: 4,
                                padding: '3px 8px',
                                fontSize: 11,
                              }}>
                                <span style={{ fontWeight: 700, color: isLow ? RED : GREEN }}>{DOMAIN_LABELS[key] || key}</span>
                                <span style={{ color: '#555', marginLeft: 4 }}>{band}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button
                    style={btn(NAVY, !canAdvanceStep1)}
                    disabled={!canAdvanceStep1}
                    onClick={() => setStep(2)}
                  >
                    Next: Program Details →
                  </button>
                </div>
              </>
            )}
          </Card>
        )}

        {/* ── STEP 2: Program Details ─────────────────────────────────── */}
        {step === 2 && (
          <Card>
            {mode === 'group' && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 16 }}>Assignment Schedule Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Field label="Student Name" hint="Pre-filled from platform">
                    <input name="studentName" value={student.studentName} onChange={handleStudentChange} style={inp} placeholder="Student Name" />
                  </Field>
                  <Field label="Baseline Score" hint="Total SAT score from diagnostic">
                    <input type="number" name="baselineScore" value={student.baselineScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 1100" min="400" max="1600" />
                  </Field>
                  <Field label="Target Score">
                    <input type="number" name="targetScore" value={student.targetScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 1400" min="400" max="1600" />
                  </Field>
                  <Field label="R&W Score" hint="Optional">
                    <input type="number" name="rwScore" value={student.rwScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 550" />
                  </Field>
                  <Field label="Math Score" hint="Optional">
                    <input type="number" name="mathScore" value={student.mathScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 550" />
                  </Field>
                  <Field label="Program Start Date" hint="Used to calculate week dates in PDF">
                    <input type="date" name="programStartDate" value={student.programStartDate} onChange={handleStudentChange} style={inp} />
                  </Field>
                </div>
                <Field label="SAT Test Date" hint="Pre-filled from their existing plan if available">
                  <select
                    name="targetTestDate"
                    value={student.targetTestDate}
                    onChange={handleStudentChange}
                    style={inp}
                  >
                    <option value="">Select test date…</option>
                    {SAT_PSAT_DATES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input
                    type="date" name="targetTestDate" value={student.targetTestDate}
                    onChange={handleStudentChange}
                    style={{ ...inp, marginTop: 6 }}
                    placeholder="Or enter custom date"
                  />
                </Field>
              </div>
            )}
            {mode !== 'group' && (<>
            <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 4 }}>
              Program Details
            </div>
            {mode === 'guarantee' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 4, padding: '4px 10px', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>GUARANTEE RECOVERY — FREE SESSIONS</span>
              </div>
            )}
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              {mode === 'guarantee'
                ? 'Student did not hit target. Free sessions activated. New score is the new baseline.'
                : 'Fields pre-filled from the diagnostic. Review and complete before generating.'}
            </div>

            {/* Scores row */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' }}>Scores</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Field label="Baseline Score" required>
                  <input type="number" name="baselineScore" value={student.baselineScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 1150" />
                </Field>
                <Field label="Target Score" required>
                  <input type="number" name="targetScore" value={student.targetScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 1400" />
                </Field>
                <Field label="Blanks on Diagnostic" hint="Leave 0 if none">
                  <input type="number" name="blanks" value={student.blanks} onChange={handleStudentChange} style={inp} placeholder="0" />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="R&W Score" hint="Optional — from score report">
                  <input type="number" name="rwScore" value={student.rwScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 580" />
                </Field>
                <Field label="Math Score" hint="Optional — from score report">
                  <input type="number" name="mathScore" value={student.mathScore} onChange={handleStudentChange} style={inp} placeholder="e.g. 570" />
                </Field>
                <div />
              </div>
              {(student.rwScore || student.mathScore) && (
                <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#F8F4FF', border: `1px solid #9B59B6`, borderRadius: 4, fontSize: 12, color: '#6C3483' }}>
                  <strong>Section breakdown:</strong>{' '}
                  {student.rwScore ? `R&W ${student.rwScore}` : ''}
                  {student.rwScore && student.mathScore ? ' · ' : ''}
                  {student.mathScore ? `Math ${student.mathScore}` : ''}
                  {student.rwScore && student.mathScore && parseInt(student.rwScore) + parseInt(student.mathScore) !== parseInt(student.baselineScore) && parseInt(student.baselineScore) > 0 && (
                    <span style={{ marginLeft: 8, color: ORANGE }}>
                      (sum = {parseInt(student.rwScore) + parseInt(student.mathScore)}, baseline = {student.baselineScore})
                    </span>
                  )}
                </div>
              )}
              {student.baselineScore && student.targetScore && (
                <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#EAF3FB', borderRadius: 4, fontSize: 12 }}>
                  <strong style={{ color: NAVY }}>Gap: </strong>
                  <span style={{ color: BLUE }}>+{parseInt(student.targetScore) - parseInt(student.baselineScore)} points</span>
                  {parseInt(student.targetScore) - parseInt(student.baselineScore) > 200 && (
                    <span style={{ color: ORANGE, marginLeft: 10 }}>Large gap — review feasibility carefully</span>
                  )}
                </div>
              )}
            </div>

            {/* Program row */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' }}>Program</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Student Name" required>
                  <input name="studentName" value={student.studentName} onChange={handleStudentChange} style={inp} placeholder="First Last" />
                </Field>
                <Field label="Assigned Tutor">
                  <input name="currentTutor" value={student.currentTutor} onChange={handleStudentChange} style={inp} placeholder="Tutor name" />
                </Field>
                <Field label="Target Test Date">
                  <select
                    value={showCustomDate ? '__custom__' : (student.targetTestDate || '')}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setShowCustomDate(true);
                        setStudent(prev => ({ ...prev, targetTestDate: '' }));
                      } else {
                        setShowCustomDate(false);
                        setStudent(prev => ({ ...prev, targetTestDate: e.target.value }));
                      }
                    }}
                    style={inp}
                  >
                    <option value="">— Select a test date —</option>
                    {SAT_PSAT_DATES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                    <option value="__custom__">Custom date…</option>
                  </select>
                  {showCustomDate && (
                    <input
                      type="date"
                      name="targetTestDate"
                      value={student.targetTestDate}
                      onChange={handleStudentChange}
                      style={{ ...inp, marginTop: 6 }}
                    />
                  )}
                </Field>
                <Field label="Session Frequency">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['1x', '2x', '3x'].map(freq => (
                      <button
                        key={freq}
                        onClick={() => setStudent(prev => ({ ...prev, sessionFrequency: freq }))}
                        style={{
                          flex: 1,
                          padding: '9px 0',
                          border: `1px solid ${student.sessionFrequency === freq ? BLUE : BORDER}`,
                          borderRadius: 4,
                          backgroundColor: student.sessionFrequency === freq ? '#EAF3FB' : 'white',
                          color: student.sessionFrequency === freq ? BLUE : '#555',
                          fontWeight: student.sessionFrequency === freq ? 700 : 400,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {freq === '3x' ? '3× / week' : freq === '2x' ? '2× / week' : '1× / week'}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Weeks & pacing recommendation */}
              {(() => {
                const calc = calcWeeksAndSessions(student.programStartDate, student.targetTestDate, student.sessionFrequency);
                const overrideWeeks = weeksOverride && parseInt(weeksOverride) > 0 ? parseInt(weeksOverride) : null;
                if (!calc && !overrideWeeks) return null;
                const baseCalc = calc || { weeks: overrideWeeks, sessionsAt1x: overrideWeeks, sessionsAt2x: overrideWeeks * 2, sessionsAt3x: overrideWeeks * 3 };
                const weeks = overrideWeeks ?? baseCalc.weeks;
                const sessionsAt1x = weeks;
                const sessionsAt2x = weeks * 2;
                const sessionsAt3x = weeks * 3;
                const purchased = parseInt(student.sessionsPurchased) || null;
                const freqSessions = student.sessionFrequency === '3x' ? sessionsAt3x : student.sessionFrequency === '2x' ? sessionsAt2x : sessionsAt1x;
                const tight = weeks < 8;
                const urgent = weeks < 5;
                const boxColor = urgent ? '#FDEDEC' : tight ? '#FEF3E2' : '#EAFAF1';
                const borderColor = urgent ? RED : tight ? ORANGE : GREEN;
                const labelColor = urgent ? RED : tight ? ORANGE : GREEN;

                const targetGain = parseInt(student.targetScore) - parseInt(student.baselineScore);
                const rec = (!isNaN(targetGain) && targetGain > 0) ? getRecommendedFreq(targetGain, weeks) : null;
                const isApplied = rec && student.sessionFrequency === rec.freq;

                return (
                  <div style={{ marginTop: 12, padding: '12px 14px', backgroundColor: boxColor, border: `1.5px solid ${borderColor}`, borderRadius: 6 }}>
                    <div style={{ fontWeight: 700, color: labelColor, fontSize: 12, letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>
                      {urgent ? 'Urgent — Very Short Window' : tight ? 'Tight Timeline' : 'Pacing Overview'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                      {[
                          { label: 'Weeks to Test', value: String(weeks), sub: overrideWeeks ? 'manual override' : student.programStartDate ? 'from start date' : 'from today' },
                        { label: '1× / week', value: String(sessionsAt1x), sub: 'sessions available' },
                        { label: '2× / week', value: String(sessionsAt2x), sub: 'sessions available' },
                        { label: '3× / week', value: String(sessionsAt3x), sub: 'sessions available' },
                      ].map((m, i) => (
                        <div key={i} style={{ backgroundColor: 'white', borderRadius: 4, padding: '8px 10px', border: `1px solid ${BORDER}` }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{m.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{m.value}</div>
                          <div style={{ fontSize: 10, color: '#888' }}>{m.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Manual weeks override */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>Override weeks:</div>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={weeksOverride}
                        onChange={e => setWeeksOverride(e.target.value)}
                        placeholder={String(baseCalc.weeks)}
                        style={{ ...inp, width: 72, padding: '5px 8px', fontSize: 12 }}
                      />
                      {overrideWeeks && (
                        <button
                          onClick={() => setWeeksOverride('')}
                          style={{ fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          Reset
                        </button>
                      )}
                      <div style={{ fontSize: 11, color: '#999' }}>Use this if the date-based calc doesn't match the actual program length.</div>
                    </div>

                    {/* Recommended plan box */}
                    {rec && (
                      <div style={{ backgroundColor: 'white', border: `1.5px solid ${BLUE}`, borderRadius: 5, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                            Recommended Plan
                          </div>
                          <div style={{ fontSize: 12, color: '#222' }}>
                            <strong>{rec.freq === '3x' ? '3×' : rec.freq === '2x' ? '2×' : '1×'}/week</strong>
                            {' — '}~{rec.sessionsEst} sessions estimated for a +{targetGain} pt gain
                            {rec.freq === '3x' ? ` (${sessionsAt3x} available — fits the program)` : rec.freq === '2x' ? ` (${sessionsAt2x} available)` : ` (${sessionsAt1x} available)`}
                          </div>
                          <div style={{ fontSize: 11, color: '#777', marginTop: 3 }}>
                            {rec.freq === '3x'
                              ? `Short timeline — 3 sessions/week is the minimum to cover all required topics before the test.`
                              : rec.freq === '2x'
                              ? `Standard pace — 2 sessions/week comfortably covers the program in this timeframe.`
                              : `Relaxed pace — 1 session/week is sufficient with this much time available.`}
                          </div>
                        </div>
                        <button
                          onClick={() => setStudent(prev => ({ ...prev, sessionFrequency: rec.freq }))}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: isApplied ? GREEN : BLUE,
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {isApplied ? 'Applied' : 'Use this plan'}
                        </button>
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: '#444' }}>
                      At <strong>{student.sessionFrequency === '3x' ? '3×' : student.sessionFrequency === '2x' ? '2×' : '1×'}/week</strong> you have <strong>{freqSessions} sessions</strong> before the test.
                      {purchased && (
                        <span style={{ marginLeft: 6, color: freqSessions >= purchased ? GREEN : ORANGE }}>
                          {freqSessions >= purchased
                            ? `${purchased} purchased sessions fit comfortably.`
                            : `Only ${freqSessions} of ${purchased} purchased sessions fit at this pace — consider ${student.sessionFrequency === '1x' ? '2×/week' : '3×/week'}.`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Weekly Schedule Editor */}
              {weeklySchedule.length > 0 && (() => {
                const totalSessions = weeklySchedule.reduce((s, w) => s + w.sessions, 0);
                const totalHours    = weeklySchedule.reduce((s, w) => s + w.sessions * w.hoursPerSession, 0);
                const selStyle = (active) => ({
                  padding: '2px 7px', fontSize: 11, fontWeight: active ? 700 : 400,
                  border: `1px solid ${active ? BLUE : BORDER}`, borderRadius: 3, cursor: 'pointer',
                  backgroundColor: active ? '#EAF3FB' : 'white', color: active ? BLUE : '#555',
                });
                return (
                  <div style={{ marginTop: 12, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ backgroundColor: NAVY, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        Weekly Schedule
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#B8CDE0', fontSize: 11 }}>Default:</span>
                        <select
                          value={schedDefSessions}
                          onChange={e => setSchedDefSessions(Number(e.target.value))}
                          style={{ fontSize: 11, padding: '2px 4px', borderRadius: 3, border: `1px solid ${BORDER}` }}
                        >
                          {[0,1,2,3].map(n => <option key={n} value={n}>{n} sessions</option>)}
                        </select>
                        <select
                          value={schedDefHours}
                          onChange={e => setSchedDefHours(Number(e.target.value))}
                          style={{ fontSize: 11, padding: '2px 4px', borderRadius: 3, border: `1px solid ${BORDER}` }}
                        >
                          <option value={1}>1h</option>
                          <option value={1.5}>1.5h</option>
                          <option value={2}>2h</option>
                        </select>
                        <button
                          onClick={() => setWeeklySchedule(ws => ws.map(w => ({ ...w, sessions: schedDefSessions, hoursPerSession: schedDefHours })))}
                          style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', backgroundColor: BLUE, color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Apply to all
                        </button>
                      </div>
                    </div>

                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 60px', gap: 0, backgroundColor: '#F0F3F8', borderBottom: `1px solid ${BORDER}` }}>
                      {['Week','Sessions','Duration','Hours'].map(h => (
                        <div key={h} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</div>
                      ))}
                    </div>

                    {/* Week rows */}
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {weeklySchedule.map((wk, i) => {
                        const wkHours = wk.sessions * wk.hoursPerSession;
                        return (
                          <div key={wk.week} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 60px', backgroundColor: i % 2 === 0 ? 'white' : '#F7FAFD', borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
                            <div style={{ padding: '5px 8px', fontSize: 12, color: '#555', fontWeight: 600 }}>Wk {wk.week}</div>
                            <div style={{ padding: '4px 8px', display: 'flex', gap: 4 }}>
                              {[0,1,2,3].map(n => (
                                <button key={n} onClick={() => setWeeklySchedule(ws => ws.map(w => w.week === wk.week ? { ...w, sessions: n } : w))} style={selStyle(wk.sessions === n)}>
                                  {n}
                                </button>
                              ))}
                            </div>
                            <div style={{ padding: '4px 8px' }}>
                              <select
                                value={wk.hoursPerSession}
                                onChange={e => setWeeklySchedule(ws => ws.map(w => w.week === wk.week ? { ...w, hoursPerSession: Number(e.target.value) } : w))}
                                style={{ fontSize: 11, padding: '2px 3px', borderRadius: 3, border: `1px solid ${BORDER}`, width: '100%' }}
                              >
                                <option value={1}>1h</option>
                                <option value={1.5}>1.5h</option>
                                <option value={2}>2h</option>
                              </select>
                            </div>
                            <div style={{ padding: '4px 8px', fontSize: 11, color: wkHours === 0 ? '#bbb' : NAVY, fontWeight: wkHours > 0 ? 700 : 400 }}>{wkHours > 0 ? `${wkHours % 1 === 0 ? wkHours : wkHours.toFixed(1)}h` : '—'}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals row */}
                    <div style={{ backgroundColor: '#EAF3FB', padding: '8px 12px', borderTop: `1.5px solid ${BLUE}`, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12 }}><strong style={{ color: NAVY }}>{totalSessions}</strong> <span style={{ color: '#555' }}>sessions</span></div>
                      <div style={{ fontSize: 12 }}><strong style={{ color: GREEN }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</strong> <span style={{ color: '#555' }}>total hours</span></div>
                      <div style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>Each session = 1 plan entry · hours tracked for billing</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Optional fields */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' }}>Optional</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Field label="Grade">
                  <input name="grade" value={student.grade} onChange={handleStudentChange} style={inp} placeholder="e.g. 11" />
                </Field>
                <Field label="Program Start Date" hint="Used to calculate weeks to test">
                  <input type="date" name="programStartDate" value={student.programStartDate} onChange={handleStudentChange} style={inp} />
                </Field>
                <Field label="Hours Purchased" hint="Total tutoring hours contracted">
                  <input type="number" name="sessionsPurchased" value={student.sessionsPurchased} onChange={handleStudentChange} style={inp} placeholder="e.g. 20" />
                </Field>
                <Field label="Sessions Completed">
                  <input type="number" name="sessionsCompleted" value={student.sessionsCompleted} onChange={handleStudentChange} style={inp} placeholder="0" />
                </Field>
              </div>
              <Field label="Program Notes">
                <textarea name="programNotes" value={student.programNotes} onChange={handleStudentChange} style={{ ...inp, minHeight: 70, resize: 'vertical' }} placeholder="Any relevant context about the student or situation" />
              </Field>
            </div>
            </>)}

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'space-between' }}>
              <button style={btn('#888', false)} onClick={() => setStep(1)}>← Back</button>
              <button
                style={btn(NAVY, !canAdvanceStep2)}
                disabled={!canAdvanceStep2}
                onClick={() => { setResult(null); setGenerateError(''); setProgressMsgs([]); setStep(3); }}
              >
                Next: Generate →
              </button>
            </div>
          </Card>
        )}

        {/* ── STEP 3: Generate ────────────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 18, color: NAVY, marginBottom: 4 }}>
              Generate Gameplan
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              Review the summary below and click Generate. The PDF will download automatically.
            </div>

            {/* Summary */}
            <div style={{ backgroundColor: '#F7FAFD', border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 10 }}>{student.studentName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
                {[
                  { label: 'Baseline',   value: student.baselineScore },
                  { label: 'Target',     value: student.targetScore },
                  { label: 'Gap',        value: `+${parseInt(student.targetScore) - parseInt(student.baselineScore)} pts` },
                  { label: 'Tutor',      value: student.currentTutor || 'TBD' },
                  { label: 'Frequency',  value: student.sessionFrequency === '2x' ? '2×/week' : '1×/week' },
                  { label: 'Test Date',  value: student.targetTestDate || 'TBD' },
                ].map((c, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontWeight: 700, color: NAVY }}>{c.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                {mode === 'guarantee'
                  ? `Guarantee recovery — domain bands inferred from score report${guaranteeParsed?.portal?.topicsCovered?.length ? ` · ${guaranteeParsed.portal.topicsCovered.length} topics covered` : ''}`
                  : mode === 'group'
                    ? `Group session plan · ${platformData?.topicCount || 0} topics pulled from platform`
                    : (pullMode === 'platform' && platformData)
                      ? `${platformData.topicCount} topics pulled from platform`
                      : `${parsed?.diagnosticEntries?.length || 0} diagnostic topics parsed from PDF`}
              </div>
            </div>

            {/* What gets generated */}
            {!result && !generating && (
              <div style={{ padding: '12px 16px', backgroundColor: '#EAFAF1', borderRadius: 4, fontSize: 13, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: GREEN, marginBottom: 8 }}>What this generates:</div>
                {(mode === 'group' ? [
                  { name: 'Assignment Schedule PDF', desc: 'Week-by-week StudyCore platform assignments ranked by diagnostic gaps, with practice test checkpoints' },
                ] : [
                  { name: 'Tutor Gameplan PDF', desc: 'Topic sequence, 5-phase session plan, Notion lesson links, tutor guidance, checkpoint triggers' },
                  { name: 'Internal Brief PDF', desc: 'Pricing, guarantee status, paid/free session breakdown, topic table — for the team' },
                  { name: 'Student Plan PDF', desc: 'Plain-language program overview for the family — no jargon, homework guide, checkpoint explainers' },
                  { name: 'Mastery Tracker', desc: 'Google Sheet with student\'s topic sequence pre-filled (requires Google credentials)' },
                ]).map((item, i) => (
                  <div key={i} style={{ color: '#333', marginBottom: 5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: GREEN, fontWeight: 700, minWidth: 12 }}>✓</span>
                    <span><strong>{item.name}</strong> — {item.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress */}
            {generating && <ProgressLog messages={progressMsgs} />}

            {/* Error */}
            {generateError && (
              <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: '#FDEDEC', borderRadius: 4, color: RED, fontSize: 13 }}>
                <strong>Error:</strong> {generateError}
              </div>
            )}

            {/* Result */}
            {result && result.planType === 'group' && (
              <div style={{ marginTop: 12, padding: '16px', backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 6 }}>
                <div style={{ fontWeight: 700, color: GREEN, marginBottom: 10, fontSize: 15 }}>
                  Assignment Schedule generated!
                </div>
                <div style={{ fontSize: 13, color: '#333', marginBottom: 12 }}>
                  PDF downloaded automatically.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    onClick={() => downloadFile(result.groupPlanBase64, `${result.studentName}_Assignment_Schedule.pdf`)}
                    style={{ ...btn(NAVY, false), padding: '9px 16px', fontSize: 12 }}
                  >
                    Download Assignment Schedule
                  </button>
                </div>
                {result.programSummary && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Topics',         value: result.programSummary.topicsToTeach },
                      { label: 'Weeks',          value: result.programSummary.weeksUntilTest },
                      { label: 'Practice Tests', value: result.programSummary.practiceTestCount },
                      { label: 'Feasibility',    value: result.programSummary.feasibility },
                    ].map((c, i) => (
                      <div key={i} style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {result && result.planType !== 'group' && (
              <div style={{ marginTop: 12, padding: '16px', backgroundColor: '#EAFAF1', border: `1px solid ${GREEN}`, borderRadius: 6 }}>
                <div style={{ fontWeight: 700, color: GREEN, marginBottom: 10, fontSize: 15 }}>
                  Gameplan generated!
                </div>
                <div style={{ fontSize: 13, color: '#333', marginBottom: 12 }}>
                  PDF downloaded automatically.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    onClick={() => downloadFile(result.pdfBase64, `${result.studentName}_Gameplan.pdf`)}
                    style={{ ...btn(NAVY, false), padding: '9px 16px', fontSize: 12 }}
                  >
                    Tutor Gameplan PDF
                  </button>
                  {result.internalPlanBase64 && (
                    <button
                      onClick={() => downloadFile(result.internalPlanBase64, `${result.studentName}_Internal_Brief.pdf`)}
                      style={{ ...btn('#6B4C9A', false), padding: '9px 16px', fontSize: 12 }}
                    >
                      Internal Brief PDF
                    </button>
                  )}
                  {result.studentPlanBase64 && (
                    <button
                      onClick={() => downloadFile(result.studentPlanBase64, `${result.studentName}_Student_Plan.pdf`)}
                      style={{ ...btn(ORANGE, false), padding: '9px 16px', fontSize: 12 }}
                    >
                      Student Plan PDF
                    </button>
                  )}
                  {result.trackerUrl && (
                    <a
                      href={result.trackerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...btn(GREEN, false), padding: '9px 16px', fontSize: 12, textDecoration: 'none', display: 'inline-block' }}
                    >
                      Open Mastery Tracker →
                    </a>
                  )}
                </div>
                {!result.trackerUrl && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Google Sheets credentials not configured — tracker skipped. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to enable.
                  </div>
                )}
                {result.programSummary && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Topics',   value: result.programSummary.topicsToTeach },
                      { label: 'Sessions', value: result.programSummary.totalSessionsNeeded },
                      { label: 'Weeks',    value: result.programSummary.weeksNeeded },
                      { label: 'Feasibility', value: result.programSummary.feasibility },
                    ].map((c, i) => (
                      <div key={i} style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'space-between' }}>
              <button style={btn('#888', generating)} disabled={generating} onClick={() => setStep(2)}>
                ← Back
              </button>
              <button
                style={btn(result ? GREEN : NAVY, generating)}
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating ? 'Generating…' : result ? 'Regenerate' : mode === 'group' ? 'Generate Assignment Schedule' : 'Generate Gameplan + Tracker'}
              </button>
            </div>
          </Card>
        )}

        <div style={{ textAlign: 'center', color: '#aaa', fontSize: 11, marginTop: 4 }}>
          StudyCore Gameplan Generator · Diagnostic-Driven
        </div>
      </div>
    </div>
  );
}
