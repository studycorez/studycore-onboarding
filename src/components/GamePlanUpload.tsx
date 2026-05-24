'use client';

import { useState, forwardRef, useImperativeHandle } from 'react';
import { Check, Upload, FileText, Loader2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';

// Exposed handle for staged mode (used by the onboarding orchestrator via ref)
export interface GamePlanUploadHandle {
  hasStagedFile: boolean;
  // Uploads the staged file under the given studentId, fires extract-hours
  // fire-and-forget, returns { url } on success or { error } on upload failure.
  commitStagedFile: (studentId: string) => Promise<{ url: string } | { error: string }>;
}

interface Props {
  studentId?: string;            // required in immediate mode; omit in staged mode
  existingUrl?: string | null;
  existingUploadedAt?: string | null;
  onComplete?: () => void;
  staged?: boolean;              // true → hold File, don't upload until commitStagedFile()
}

const GamePlanUpload = forwardRef<GamePlanUploadHandle, Props>(function GamePlanUpload(
  { studentId, existingUrl, existingUploadedAt, onComplete, staged = false },
  ref,
) {
  const supabase = createClient();

  // Immediate-mode state (unchanged from original)
  const [uploading, setUploading]               = useState(false);
  const [extracting, setExtracting]             = useState(false);
  const [dragOver, setDragOver]                 = useState(false);
  const [uploadError, setUploadError]           = useState('');
  const [aiResult, setAiResult]                 = useState<{
    hours: number | null;
    target_score: number | null;
    test_date: string | null;
    weak_areas: string[] | null;
    reasoning: string;
  } | null>(null);
  const [aiModalOpen, setAiModalOpen]           = useState(false);
  const [aiHoursEdit, setAiHoursEdit]           = useState('');
  const [confirmingSaving, setConfirmingSaving] = useState(false);

  // Staged-mode state
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  // Expose staged handle via ref
  useImperativeHandle(ref, () => ({
    get hasStagedFile() { return stagedFile !== null; },
    commitStagedFile: async (newStudentId: string) => {
      if (!stagedFile) return { error: 'No file staged' };

      const { error: upErr } = await supabase.storage
        .from('game-plans')
        .upload(`student-${newStudentId}/gameplan.pdf`, stagedFile, { upsert: true, contentType: 'application/pdf' });
      if (upErr) return { error: upErr.message };

      const { data: urlData } = supabase.storage
        .from('game-plans')
        .getPublicUrl(`student-${newStudentId}/gameplan.pdf`);
      const url = urlData?.publicUrl ?? '';

      await supabase
        .from('students')
        .update({ game_plan_url: url, game_plan_uploaded_at: new Date().toISOString() })
        .eq('id', newStudentId);

      // Fire extract-hours — non-fatal, do NOT block pipeline, NO modal in staged mode
      fetch(`/api/students/${newStudentId}/extract-hours`, { method: 'POST' }).catch(() => {});

      setStagedFile(null);
      return { url };
    },
  }), [stagedFile, supabase]);

  // Called whenever a file is picked (drop or input). Routes to staged or immediate.
  function handleFileSelected(file: File) {
    if (!file.type.includes('pdf')) {
      setUploadError('Please upload a PDF file.');
      setTimeout(() => setUploadError(''), 4000);
      return;
    }
    setUploadError('');
    if (staged) {
      setStagedFile(file);
    } else {
      handleGamePlanUpload(file);
    }
  }

  // ── Immediate-mode upload (unchanged from original) ───────────────────────
  async function handleGamePlanUpload(file: File) {
    setUploading(true);
    const { error: upErr } = await supabase.storage
      .from('game-plans')
      .upload(`student-${studentId}/gameplan.pdf`, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) {
      setUploading(false);
      setUploadError('Upload failed: ' + upErr.message);
      setTimeout(() => setUploadError(''), 5000);
      return;
    }
    const { data: urlData } = supabase.storage
      .from('game-plans')
      .getPublicUrl(`student-${studentId}/gameplan.pdf`);
    const gamePlanUrl = urlData?.publicUrl ?? null;
    await supabase.from('students').update({ game_plan_url: gamePlanUrl, game_plan_uploaded_at: new Date().toISOString() }).eq('id', studentId);
    setUploading(false);
    onComplete?.();
    setExtracting(true);
    try {
      const res = await fetch(`/api/students/${studentId}/extract-hours`, { method: 'POST' });
      const data = await res.json();
      const hasAny = data.hours != null || data.target_score != null || data.test_date != null || (Array.isArray(data.weak_areas) && data.weak_areas.length > 0);
      if (hasAny) {
        setAiResult({ hours: data.hours, target_score: data.target_score, test_date: data.test_date, weak_areas: data.weak_areas, reasoning: data.reasoning });
        setAiHoursEdit(data.hours != null ? String(data.hours) : '');
        setAiModalOpen(true);
        onComplete?.(); // reload to show extracted data
      }
    } catch { /* non-fatal */ }
    setExtracting(false);
  }

  async function confirmAiHours() {
    setConfirmingSaving(true);
    const patch: Record<string, any> = { low_hours_alerted: false };
    const val = parseFloat(aiHoursEdit);
    if (!isNaN(val) && val >= 0) patch.purchased_hours = val;
    if (aiResult?.target_score != null) patch.target_score = aiResult.target_score;
    if (aiResult?.test_date) patch.test_date = aiResult.test_date;
    if (Array.isArray(aiResult?.weak_areas) && aiResult!.weak_areas!.length > 0) patch.weak_areas = aiResult!.weak_areas;
    await supabase.from('students').update(patch).eq('id', studentId);
    setConfirmingSaving(false);
    setAiModalOpen(false);
    setAiResult(null);
    onComplete?.();
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Drop-zone label text
  const dropLabel = staged
    ? 'Select game plan PDF (attached on send)'
    : (existingUrl ? 'Replace game plan' : 'Upload game plan PDF');

  return (
    <>
      {/* Upload error toast */}
      {uploadError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          {uploadError}
        </div>
      )}

      {/* Upload UI */}
      <div>
        {/* Existing-URL link — immediate mode only */}
        {!staged && existingUrl && (
          <a href={existingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-navy-700 hover:text-navy-900 font-medium mb-3">
            <FileText className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">View game plan PDF</span>
          </a>
        )}

        {/* Staged-file indicator */}
        {staged && stagedFile && (
          <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
            <div className="flex items-center gap-2 text-sm text-green-700 font-medium min-w-0">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{stagedFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setStagedFile(null)}
              className="text-green-500 hover:text-green-700 flex-shrink-0"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Spinner — immediate mode only */}
        {!staged && (uploading || extracting) ? (
          <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-4 border border-dashed border-gray-200 rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-navy-500" />
            <span>{uploading ? 'Uploading…' : 'Extracting data with AI…'}</span>
          </div>
        ) : (
          // Show drop zone when: immediate mode (not busy), OR staged mode (always — allows re-select)
          (!staged || !stagedFile) && (
            <label
              className={`flex flex-col items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-4 border-2 border-dashed transition-colors ${
                dragOver
                  ? 'border-navy-400 bg-navy-50 text-navy-700'
                  : 'border-gray-300 text-gray-500 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelected(f); }}
            >
              <Upload className="w-5 h-5 flex-shrink-0" />
              <span className="text-center leading-tight">
                {dragOver ? 'Drop PDF here' : dropLabel}
              </span>
              <span className="text-xs text-gray-400">or click to browse</span>
              <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ''; }} />
            </label>
          )
        )}

        {!staged && existingUploadedAt && (
          <p className="text-xs text-gray-400 mt-2">Uploaded {new Date(existingUploadedAt).toLocaleDateString()}</p>
        )}
      </div>

      {/* AI extraction confirmation modal — immediate mode only */}
      <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="AI Data Extracted">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            AI extracted the following from the game plan. Review and confirm to save.
          </p>
          {aiResult?.reasoning && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 leading-relaxed">{aiResult.reasoning}</div>
          )}
          {aiResult?.hours != null && (
            <div>
              <label className="label">Purchased Hours</label>
              <input type="number" min="0" step="0.5" value={aiHoursEdit} onChange={e => setAiHoursEdit(e.target.value)} className="input" autoFocus />
            </div>
          )}
          {aiResult?.target_score != null && (
            <div className="flex items-center justify-between bg-navy-50 rounded-lg px-3 py-2.5">
              <span className="text-sm text-navy-700">Target Score</span>
              <span className="font-semibold text-navy-900">{aiResult.target_score}</span>
            </div>
          )}
          {aiResult?.test_date && (
            <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2.5">
              <span className="text-sm text-blue-700">Test Date</span>
              <span className="font-semibold text-blue-900">{new Date(aiResult.test_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {Array.isArray(aiResult?.weak_areas) && aiResult!.weak_areas!.length > 0 && (
            <div className="bg-amber-50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-amber-700 mb-1.5">Weak Areas</p>
              <div className="flex flex-wrap gap-1.5">
                {aiResult!.weak_areas!.map((area, i) => (
                  <span key={i} className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-medium">{area}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setAiModalOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="button" onClick={confirmAiHours} disabled={confirmingSaving} className="btn-primary flex-1 justify-center">
              {confirmingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmingSaving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
});

export default GamePlanUpload;
