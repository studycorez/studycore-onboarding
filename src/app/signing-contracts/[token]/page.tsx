'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function SignContractPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading'|'ready'|'signing'|'success'|'error'|'already_signed'>('loading');
  const [contractInfo, setContractInfo] = useState<{ type: string; recipientName: string; contractData: Record<string,any> } | null>(null);
  const [signedName, setSignedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/signing-contracts/sign?token=${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.alreadySigned) setState('already_signed');
        else if (data.error) { setErrorMsg(data.error); setState('error'); }
        else { setContractInfo(data); setState('ready'); }
      })
      .catch(() => { setErrorMsg('Failed to load contract.'); setState('error'); });
  }, [token]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!signedName.trim() || !agreed) return;
    setState('signing');
    try {
      const res = await fetch('/api/signing-contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signedName: signedName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signing failed');
      setState('success');
    } catch (err: any) {
      setErrorMsg(err.message);
      setState('error');
    }
  }

  const isTutor = contractInfo?.type === 'tutor';
  const isTutorStudent = contractInfo?.type === 'tutor-student';

  function contractTitle() {
    if (isTutorStudent) return 'Tutor-Student Assignment Agreement';
    if (isTutor) return 'Tutor Services Agreement';
    return 'SAT Tutoring Services Agreement';
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>SC</div>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>StudyCore LLC</span>
            <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 10 }}>· Electronic Signature Request</span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Powered by StudyCore Contracts</span>
      </div>

      <div style={{ maxWidth: 820, margin: '40px auto', padding: '0 24px 60px' }}>

        {state === 'loading' && (
          <div style={card}>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#0f172a', borderRadius: '50%', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b', fontSize: 14 }}>Loading your contract…</p>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div style={{ ...card, borderLeft: '4px solid #ef4444' }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#dc2626', marginBottom: 8 }}>Unable to Load Contract</p>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Contact <a href="mailto:support@studycore.net" style={{ color: '#0f172a' }}>support@studycore.net</a> for help.</p>
          </div>
        )}

        {state === 'already_signed' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={successCircle}>✓</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, margin: '0 0 4px' }}>Already Signed</p>
                <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>This contract has already been signed. No further action is needed.</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 20 }}>Questions? <a href="mailto:support@studycore.net" style={{ color: '#0f172a' }}>support@studycore.net</a></p>
          </div>
        )}

        {state === 'success' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={successCircle}>✓</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, margin: '0 0 4px' }}>Agreement Signed</p>
                <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Thank you, <strong>{signedName}</strong>. Your signed agreement has been recorded.</p>
              </div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                A signed copy has been saved on file with StudyCore. By signing electronically, you have agreed to all terms of the {contractTitle()} under the ESIGN Act.
              </p>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>A copy has been sent to the StudyCore team at info@studycore.net.</p>
          </div>
        )}

        {(state === 'ready' || state === 'signing') && contractInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Banner */}
            <div style={{ background: '#0f172a', borderRadius: 8, padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 4px' }}>StudyCore LLC</p>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: '0 0 2px' }}>{contractTitle()}</p>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                  Sent to {contractInfo.recipientName}
                  {contractInfo.contractData?.studentName ? ` · Student: ${contractInfo.contractData.studentName}` : ''}
                </p>
              </div>
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Awaiting Signature</span>
            </div>

            {/* Contract body */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Contract Terms</h2>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Scroll to review before signing</span>
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto', fontSize: 13, lineHeight: 1.8, color: '#334155', fontFamily: 'Georgia, serif', paddingRight: 8 }}>
                {isTutorStudent
                  ? <TutorStudentContractText data={contractInfo.contractData} recipientName={contractInfo.recipientName} />
                  : isTutor
                    ? <TutorContractText data={contractInfo.contractData} recipientName={contractInfo.recipientName} />
                    : <StudentContractText data={contractInfo.contractData} />}
              </div>
            </div>

            {/* Signature panel */}
            <div style={card}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Sign this Agreement</h2>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                By typing your full legal name below and checking the box, you are electronically signing this Agreement. This signature is legally binding under the ESIGN Act (15 U.S.C. § 7001).
              </p>
              <form onSubmit={handleSign}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Full Legal Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={signedName}
                    onChange={e => setSignedName(e.target.value)}
                    placeholder="Your full legal name"
                    required
                    disabled={state === 'signing'}
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 16, fontFamily: 'Georgia, serif', boxSizing: 'border-box', color: '#0f172a', background: '#fafafa' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 24 }}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    disabled={state === 'signing'}
                    style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                    I confirm that I have read and understand all terms of this Agreement{isTutorStudent ? ', including the Early Departure Consequences in Section 3,' : ''} and agree to be legally bound by them. I acknowledge this electronic signature carries the same legal weight as a handwritten signature.
                  </span>
                </label>

                {signedName && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '14px 18px', marginBottom: 20 }}>
                    <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Signature Preview</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#0f172a', margin: 0, fontStyle: 'italic' }}>{signedName}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!signedName.trim() || !agreed || state === 'signing'}
                  style={{ ...primaryBtn, width: '100%', padding: '14px', fontSize: 15, opacity: (!signedName.trim() || !agreed || state === 'signing') ? 0.4 : 1, cursor: (!signedName.trim() || !agreed || state === 'signing') ? 'not-allowed' : 'pointer' }}
                >
                  {state === 'signing' ? 'Processing signature…' : 'Sign Agreement'}
                </button>
              </form>
            </div>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              Questions? Contact <a href="mailto:support@studycore.net" style={{ color: '#475569' }}>support@studycore.net</a>
            </p>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '16px 40px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>StudyCore LLC · San Ramon, California · support@studycore.net · studycore.net</p>
      </div>
    </div>
  );
}

// ─── Contract text renderers ──────────────────────────────────────────────────

function ContractSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>{title}</p>
      {children}
    </div>
  );
}

function TutorContractText({ data, recipientName }: { data: Record<string,any>; recipientName: string }) {
  const name = recipientName || data?.tutorName || '[Tutor Name]';
  const date = data?.effectiveDate || '';
  const students: string[] = data?.assignedStudents ? data.assignedStudents.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  return (
    <div>
      <p>This Tutor Services Agreement is entered into as of <strong>{date}</strong> by and between <strong>StudyCore LLC</strong>, a California limited liability company, and <strong>{name}</strong> ("Tutor").</p>
      {students.length > 0 && (
        <ContractSection title="Assigned Students">
          <p>Tutor commits to delivering services for the following student(s) for the full duration of each student's program:</p>
          <ul>{students.map((s, i) => <li key={i}><strong>{s}</strong></li>)}</ul>
        </ContractSection>
      )}
      <ContractSection title="01 — Independent Contractor Relationship">
        <p>Tutor is an independent contractor, not an employee of StudyCore LLC. No employment relationship is created. Tutor is not entitled to employee benefits of any kind.</p>
        <p><strong>SAT Score Accuracy:</strong> Tutor represents and warrants a verified SAT score of 1550 or higher. Misrepresentation is grounds for immediate termination without pay and may result in legal action.</p>
        <p><strong>Background Check Consent:</strong> Tutor consents to a background check prior to being assigned to any student. Misrepresentation of criminal history is grounds for immediate termination without pay.</p>
        <p><strong>Competing Employment:</strong> Tutor agrees not to provide SAT, ACT, or standardized test preparation services for any competing company or platform during the term of this Agreement.</p>
      </ContractSection>
      <ContractSection title="02 — Services & Obligations">
        <ul>
          <li>Deliver all assigned 1-on-1 sessions per each student's agreed schedule</li>
          <li>Lead office hours only when explicitly assigned by StudyCore</li>
          <li>Submit a written session report after every session</li>
          <li>Respond to all messages from StudyCore and parents within 24 hours</li>
          <li>Monitor student progress proactively and report concerns immediately</li>
          <li>Participate in weekly check-ins with Harshil Chilukuri</li>
          <li>Conduct all sessions with camera on, reliable internet, and via Zoom with Fathom recording</li>
          <li><strong>Rescheduling:</strong> Must give 24+ hours notice. Less than 24 hours = 1 strike. Max 3 reschedules per student per calendar month — a 4th = 1 strike.</li>
          <li><strong>Makeup Sessions:</strong> If Tutor cancels a session, a makeup must be coordinated as soon as possible — same week if possible, following week at latest. Failure to arrange = 1 strike.</li>
        </ul>
      </ContractSection>
      <ContractSection title="03 — Student Commitment">
        <p>Once Tutor accepts a student assignment, Tutor commits to remaining for the full program duration. Early departure without prior written approval from StudyCore is a terminable offense. No circumstance automatically qualifies for an exception — written approval must be obtained before departing.</p>
      </ContractSection>
      <ContractSection title="04 — Performance Standards & Strike System">
        <ul>
          <li><strong>1 Strike:</strong> Arriving 10+ minutes late to a scheduled session</li>
          <li><strong>2 Strikes:</strong> Missing a session without prior notice. Tutor forfeits pay for that session.</li>
          <li><strong>3 Strikes:</strong> Termination without pay for the current pay period</li>
        </ul>
      </ContractSection>
      <ContractSection title="05 — Payment & Compensation">
        <p><strong>Rate:</strong> $20.00/hour for 1-on-1 sessions and office hours.</p>
        <p><strong>Pay Schedule:</strong> 15th and last day of each month via Zelle.</p>
        <p><strong>Missed Sessions:</strong> Tutor forfeits pay for sessions missed without prior notice.</p>
        <p><strong>Refund Clause:</strong> If a student discontinues within their first 3 sessions, Tutor will not receive payment for those sessions. If the discontinuation is due to Tutor's conduct, Tutor also receives one strike.</p>
      </ContractSection>
      <ContractSection title="06 — Tax Responsibility">
        <p>Tutor is solely responsible for all federal, state, and local taxes. StudyCore will issue a 1099-NEC for earnings of $600+ in any calendar year. Tutor agrees to provide a completed W-9 upon request.</p>
      </ContractSection>
      <ContractSection title="07 — Session Recording & Confidentiality">
        <p>All sessions are recorded via Fathom. By signing, Tutor consents to recording. All student information is strictly confidential — this obligation survives termination.</p>
        <p><strong>Social Media:</strong> Tutor agrees not to post any information identifying or relating to StudyCore students on any public platform. This obligation survives termination.</p>
      </ContractSection>
      <ContractSection title="08 — Intellectual Property">
        <p>All StudyCore materials are proprietary IP of StudyCore LLC. Tutor may not reproduce, distribute, or use them outside of StudyCore-assigned sessions without written consent.</p>
      </ContractSection>
      <ContractSection title="09 — Non-Solicitation">
        <p>Tutor may not directly hire, solicit, or engage any StudyCore student for private tutoring during this Agreement and for 12 months following its termination. Violation: fee equal to 6 months of Tutor's standard rate.</p>
      </ContractSection>
      <ContractSection title="10 — Non-Disparagement">
        <p>Tutor agrees not to make disparaging statements about StudyCore LLC, its founders, employees, or services to students, parents, or in any public forum. Tutor may not encourage chargebacks, disputes, or complaints against StudyCore. This obligation survives termination.</p>
      </ContractSection>
      <ContractSection title="11 — Termination">
        <p><strong>Tutor-Initiated:</strong> 2 weeks written notice required.</p>
        <p><strong>StudyCore-Initiated for Cause:</strong> Immediate termination without pay for: 3-strike threshold, unprofessional conduct, confidentiality breach, student abandonment without approval, or other serious misconduct.</p>
      </ContractSection>
      <ContractSection title="12–14 — Limitation of Liability, Dispute Resolution, Entire Agreement">
        <p>Liability capped at amounts paid to Tutor in the prior 60 days. Disputes via arbitration in San Ramon, CA under AAA rules, governed by California law. This Agreement supersedes all prior discussions; modifications require writing. Written notice may be delivered via email or SMS.</p>
      </ContractSection>
    </div>
  );
}

function TutorStudentContractText({ data, recipientName }: { data: Record<string,any>; recipientName: string }) {
  const d = data || {};
  const name = recipientName || d.tutorName || '[Tutor Name]';
  return (
    <div>
      <p>This Tutor-Student Assignment Agreement is entered into as of <strong>{d.effectiveDate || '—'}</strong> by and between <strong>StudyCore LLC</strong> and <strong>{name}</strong> ("Tutor"). This Agreement governs Tutor's assignment to student <strong>{d.studentName || '[Student Name]'}</strong> and supplements the General Tutor Services Agreement already signed.</p>
      <ContractSection title="Assignment Details">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {([
              ['Student Name', d.studentName],
              ['Target SAT Score', d.targetScore],
              ['Program Duration', d.programWeeks ? `${d.programWeeks} weeks` : undefined],
              ['Total Hours', d.totalHours],
              ['Session Schedule', d.sessionDaysTimes],
              ['Start Date', d.startDate],
              ['End Date', d.endDate],
            ] as [string, string|undefined][]).map(([l, v]) => (
              <tr key={l} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ fontWeight: 700, padding: '5px 12px 5px 0', width: 160, verticalAlign: 'top' }}>{l}</td>
                <td style={{ padding: '5px 0', color: '#475569' }}>{v || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ContractSection>
      <ContractSection title="01 — Acceptance of Assignment">
        <p>By signing this Agreement, Tutor confirms acceptance of this assignment and commits to delivering all scheduled sessions for the full duration of the student's program.</p>
      </ContractSection>
      <ContractSection title="02 — Full-Program Commitment">
        <p>Tutor commits to remaining with {d.studentName || 'the assigned student'} from the Start Date through the End Date. Exceptions are at StudyCore's sole discretion — no circumstance automatically qualifies. Written approval must be obtained <strong>before</strong> ending this assignment.</p>
      </ContractSection>
      <ContractSection title="03 — Early Departure Consequences">
        <div style={{ background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 4, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>IMPORTANT — Read Carefully</p>
          <p style={{ marginBottom: 0 }}>If Tutor departs before the program End Date without prior written approval, all four consequences below apply.</p>
        </div>
        <p><strong>(a) Four-Week Notice Requirement:</strong> Minimum 4 weeks written notice required before ending this assignment. Tutor must continue delivering all sessions during the notice period.</p>
        <p><strong>(b) Pay Clawback:</strong> StudyCore reserves the right to clawback payments from the most recently completed pay period.</p>
        <p><strong>(c) Refund Liability:</strong> If Tutor's early departure causes a refund to the student's family, Tutor is liable for up to 2 weeks of their standard hourly rate.</p>
        <p><strong>(d) Permanent Rehire Ban:</strong> Abandoning an assignment without written approval results in permanent ineligibility for future engagement with StudyCore LLC.</p>
      </ContractSection>
      <ContractSection title="04 — Session Obligations & Reporting">
        <ul>
          <li>Deliver all sessions per the schedule above</li>
          <li>Submit a session report within 24 hours of each session</li>
          <li>Maintain professional communication with the student's family</li>
          <li>Notify StudyCore immediately if any session must be rescheduled</li>
          <li><strong>Immediate Escalation Required:</strong> Notify StudyCore within 24 hours if student fails to complete homework, appears disengaged, or any concern arises that may affect progress. Failure to escalate = 1 strike.</li>
          <li>Participate in weekly check-ins with the StudyCore team to review {d.studentName || "this student"}'s progress</li>
        </ul>
      </ContractSection>
      <ContractSection title="05 — Payment for This Assignment">
        <p>Compensation per the General Agreement ($20.00/hour, paid 15th and last day of each month via Zelle).</p>
        <p><strong>Performance Bonus:</strong> If {d.studentName || 'Student'} achieves their target score of {d.targetScore || '—'} on the first official SAT after completing the program, Tutor receives a $200.00 one-time bonus and advances to the next rate tier.</p>
      </ContractSection>
      <ContractSection title="06 — Performance Guarantee Obligation">
        <p>If the student triggers StudyCore's guarantee, Tutor is required to continue delivering sessions at the standard rate until the guarantee obligation is fulfilled. StudyCore will notify Tutor in writing when the obligation has been fulfilled.</p>
      </ContractSection>
      <ContractSection title="07–08 — Relationship to General Agreement & Entire Agreement">
        <p>This Assignment Agreement supplements the General Tutor Services Agreement. In the event of conflict, the more restrictive provision applies. This document is the entire agreement for this specific student assignment — modifications require writing.</p>
      </ContractSection>
    </div>
  );
}

function StudentContractText({ data }: { data: Record<string,any> }) {
  const d = data || {};
  return (
    <div>
      <p>This SAT Tutoring Services Agreement is entered into as of <strong>{d.effectiveDate || '—'}</strong> by and between <strong>StudyCore LLC</strong> and <strong>{d.parentName || '[Parent Name]'}</strong>, parent or legal guardian of <strong>{d.studentName || '[Student Name]'}</strong>.</p>
      <ContractSection title="Program Details">
        <p>Student: {d.studentName || '—'} | Starting Score: {d.startingScore || '—'} | Target: {d.targetScore || '—'}</p>
        <p>Sessions: {d.sessionsPerWeek || '—'}/week · {d.sessionLengthHours || '—'} hr · {d.totalHours || '—'} total hours</p>
      </ContractSection>
      <p style={{ color: '#64748b', fontSize: 13 }}>Full contract terms available at request. By signing, you agree to all terms of the SAT Tutoring Services Agreement including payment terms, cancellation policy, and performance guarantee eligibility requirements.</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const primaryBtn: React.CSSProperties = { display: 'inline-block', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const successCircle: React.CSSProperties = { width: 44, height: 44, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 };
