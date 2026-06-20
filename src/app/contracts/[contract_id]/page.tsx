'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BookOpen, CheckCircle, Download, Loader2 } from 'lucide-react';
import type { Contract } from '@/types';

const NAVY = '#1e2090';

const CONTRACT_TEMPLATE = `
STUDYCORE TUTOR COMMITMENT CONTRACT

This agreement is between StudyCore ("Company") and {TUTOR_NAME} ("Tutor").

1. COMMITMENT
Tutor agrees to fulfill all scheduled tutoring sessions with {STUDENT_NAME} as outlined in the attached Game Plan. The full program duration and session schedule are detailed in the Game Plan document.

2. SESSIONS & CANCELLATIONS
Tutor must provide at least 24 hours notice for any cancellation. Failure to provide notice or missing a session without notice constitutes a violation. On the 3rd violation, this contract is terminated and all unpaid session earnings are forfeited.

3. NOTICE PERIOD
To discontinue tutoring {STUDENT_NAME}, Tutor must provide a minimum of 2 weeks written notice to StudyCore admin.

4. COMPENSATION
Tutor will be compensated at \${HOURLY_RATE}/hour for all completed sessions as confirmed via session logs.

5. CONFIDENTIALITY
Tutor agrees to keep all student information strictly confidential, including but not limited to: academic performance, test scores, personal details, and family information.

6. EXCLUSIVITY
While engaged with StudyCore, Tutor agrees not to provide tutoring services for any other company, platform, or organization. Tutor may only conduct independent (non-company) tutoring with prior written approval from StudyCore.

7. CONSEQUENCES OF VIOLATION
- 1st & 2nd violation: Forfeiture of pay for the missed session and written warning
- 3rd violation: Immediate contract termination and forfeiture of all unpaid session earnings

By signing below, Tutor acknowledges they have read, understood, and agree to all terms.
`.trim();

function fillTemplate(template: string, tutor: string, student: string, rate: number) {
  return template
    .replace(/{TUTOR_NAME}/g, tutor)
    .replace(/{STUDENT_NAME}/g, student)
    .replace(/\$\{HOURLY_RATE\}/g, String(rate));
}

export default function ContractSigningPage() {
  const { contract_id } = useParams<{ contract_id: string }>();
  const supabase = createClient();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading]   = useState(true);
  const [signature, setSignature] = useState('');
  const [agreed, setAgreed]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pdfUrl, setPdfUrl]     = useState<string | null>(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch(`/api/contracts/${contract_id}/signing-data`)
      .then(r => r.json())
      .then(({ contract: data, error }) => {
        if (error) console.error('[ContractSigningPage] contract fetch error:', error);
        setContract(data as Contract);
        setLoading(false);
      })
      .catch(err => {
        console.error('[ContractSigningPage] contract fetch error:', err);
        setLoading(false);
      });
  }, [contract_id]);

  async function handleSign() {
    if (!signature.trim() || !agreed) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/contracts/${contract_id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_signature: signature.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to submit'); setSaving(false); return; }
      if (data.pdf_url) setPdfUrl(data.pdf_url);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ContractSigningPage] fetch/parse error:', err);
      setError(`Network error: ${msg}. Please try again.`);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Contract not found.</p>
      </div>
    );
  }

  const tutorName   = (contract.tutor as any)?.name   ?? '';
  const studentName = (contract.student as any)?.name ?? '';
  const filledText  = fillTemplate(CONTRACT_TEMPLATE, tutorName, studentName, contract.hourly_rate ?? 0);

  // ── Already signed ──────────────────────────────────────────────────────
  if (contract.status === 'signed' && !submitted) {
    return (
      <PageShell>
        <div className="text-center py-12">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Already Signed</h2>
          <p className="text-gray-500">This contract was signed on {new Date(contract.signed_at!).toLocaleDateString()}.</p>
          {contract.pdf_url && (
            <a
              href={contract.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: NAVY }}
            >
              <Download className="w-4 h-4" /> Download Your Copy
            </a>
          )}
        </div>
      </PageShell>
    );
  }

  // ── Voided ──────────────────────────────────────────────────────────────
  if (contract.status === 'voided') {
    return (
      <PageShell>
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⛔</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Contract Voided</h2>
          <p className="text-gray-500">This contract is no longer active. Please contact StudyCore for more information.</p>
        </div>
      </PageShell>
    );
  }

  // ── Success after signing ────────────────────────────────────────────────
  if (submitted) {
    return (
      <PageShell>
        <div className="text-center py-12">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Contract Signed!</h2>
          <p className="text-gray-600">Thank you, <strong>{signature}</strong>. Your commitment contract for {studentName} has been recorded.</p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: NAVY }}
            >
              <Download className="w-4 h-4" /> Download Your Copy
            </a>
          )}
        </div>
      </PageShell>
    );
  }

  // ── Main signing page ────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* Contract meta */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-gray-500">Tutor</span><p className="font-semibold text-gray-900">{tutorName}</p></div>
          <div><span className="text-gray-500">Student</span><p className="font-semibold text-gray-900">{studentName}</p></div>
          <div><span className="text-gray-500">Hourly Rate</span><p className="font-semibold text-gray-900">${contract.hourly_rate}/hour</p></div>
          <div><span className="text-gray-500">Date</span><p className="font-semibold text-gray-900">{new Date(contract.created_at).toLocaleDateString()}</p></div>
        </div>
      </div>

      {/* Game plan download */}
      {contract.game_plan_url && (
        <div className="mb-6">
          <a
            href={contract.game_plan_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Download Game Plan PDF
          </a>
        </div>
      )}

      {/* Contract body */}
      <div className="border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contract Terms</p>
        </div>
        <div className="px-6 py-5">
          {filledText.split('\n\n').map((section, i) => {
            const lines = section.split('\n');
            const heading = lines[0];
            const body    = lines.slice(1).join('\n');
            const isTitle = i === 0;
            const isSection = /^\d+\./.test(heading);
            return (
              <div key={i} className={isTitle ? 'mb-6 text-center' : 'mb-5'}>
                {isTitle ? (
                  <h1 className="text-lg font-bold text-gray-900">{heading}</h1>
                ) : isSection ? (
                  <>
                    <h3 className="text-sm font-bold text-gray-900 mb-1.5">{heading}</h3>
                    {body.split('\n').map((line, j) => (
                      <p key={j} className={`text-sm text-gray-700 leading-relaxed ${line.startsWith('-') ? 'ml-4' : ''}`}>
                        {line}
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed">{section}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Signature section */}
      <div className="border-t border-gray-200 pt-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1.5">
            Type your full legal name to sign
          </label>
          <input
            value={signature}
            onChange={e => setSignature(e.target.value)}
            placeholder="Your full name"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium italic text-lg"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#1e2090]"
          />
          <span className="text-sm text-gray-700">
            I have read and agree to all terms in the StudyCore Tutor Commitment Contract above.
          </span>
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSign}
          disabled={!signature.trim() || !agreed || saving}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: NAVY }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Submitting…' : 'Sign Contract'}
        </button>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900">StudyCore</span>
            <span className="text-gray-400 text-sm ml-2">Tutor Commitment Contract</span>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}
