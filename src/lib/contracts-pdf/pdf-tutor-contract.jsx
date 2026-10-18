import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 56,
    color: '#111',
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 12,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  docTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  effectiveLine: {
    fontSize: 9,
    color: '#555',
  },
  sectionNumber: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 2,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    width: 12,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
  },
  strikeBox: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  signaturesSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 20,
  },
  signatureBlock: {
    marginBottom: 24,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 4,
    marginTop: 20,
    width: 280,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#555',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    textAlign: 'center',
    fontSize: 8,
    color: '#aaa',
  },
  signedByBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 2,
  },
  signedByText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  signedByMeta: {
    fontSize: 9,
    color: '#555',
    marginTop: 2,
  },
});

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function Section({ number, title, children }) {
  return (
    <View>
      <Text style={styles.sectionNumber}>{String(number).padStart(2, '0')}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * @param {object} data
 * @param {string} data.tutorName
 * @param {string} data.effectiveDate   — e.g. "September 23, 2026"
 * @param {string|null} data.signedName — null = unsigned, string = signed
 * @param {string|null} data.signedAt   — ISO timestamp
 */
function TutorContractDocument({ data }) {
  const { tutorName, effectiveDate, signedName, signedAt, assignedStudents } = data;
  const studentList = assignedStudents
    ? assignedStudents.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const signedDateStr = signedAt
    ? new Date(signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>StudyCore LLC</Text>
          <Text style={styles.docTitle}>Tutor Services Agreement</Text>
          <Text style={styles.effectiveLine}>
            Effective {effectiveDate} between StudyCore LLC and {tutorName || '[Tutor Name]'}.
          </Text>
        </View>

        {/* Intro */}
        <Text style={styles.paragraph}>
          This Tutor Services Agreement ("Agreement") is entered into as of {effectiveDate} by and between StudyCore LLC, a California limited liability company ("StudyCore"), and {tutorName || '[Tutor Name]'} ("Tutor").
        </Text>

        {/* Assigned Students */}
        {studentList.length > 0 && (
          <View style={{ marginBottom: 12, padding: 10, backgroundColor: '#f8f8f8', borderLeftWidth: 3, borderLeftColor: '#333' }}>
            <Text style={[styles.sectionTitle, { fontSize: 10, marginBottom: 4 }]}>ASSIGNED STUDENTS</Text>
            <Text style={[styles.paragraph, { marginBottom: 4 }]}>
              Tutor commits to delivering services for the following student(s) for the full duration of each student's program:
            </Text>
            {studentList.map((s, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 01 */}
        <Section number={1} title="INDEPENDENT CONTRACTOR RELATIONSHIP">
          <Text style={styles.paragraph}>
            Tutor is engaged as an independent contractor and not as an employee, partner, or agent of StudyCore LLC. StudyCore does not control the manner in which Tutor delivers instruction, only the outcomes and standards described herein. Nothing in this Agreement creates an employment relationship. Tutor is not entitled to employee benefits, workers' compensation, unemployment insurance, or any other employer-provided benefits.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>SAT Score Accuracy: </Text>Tutor represents and warrants that they have achieved a verified SAT score of 1550 or higher and that all information provided to StudyCore regarding their score, qualifications, and identity is accurate and truthful. Tutor agrees to provide official proof of score (e.g., College Board score report) upon request. Misrepresentation of SAT score or qualifications is grounds for immediate termination without pay and may result in legal action.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Background Check Consent: </Text>Tutor consents to StudyCore conducting a background check prior to being assigned to any student. Tutor represents that no criminal history exists that would disqualify them from working with minors. Tutor agrees to promptly disclose any relevant criminal history to StudyCore. Misrepresentation is grounds for immediate termination without pay.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Competing Employment: </Text>During the term of this Agreement, Tutor agrees not to provide SAT, ACT, or standardized test preparation services for any competing tutoring company, platform, or agency. Tutor may engage in independent tutoring outside of StudyCore provided it does not involve students sourced from StudyCore and does not interfere with Tutor's obligations hereunder.
          </Text>
        </Section>

        {/* 02 */}
        <Section number={2} title="SERVICES & OBLIGATIONS">
          <Text style={styles.paragraph}>Tutor agrees to:</Text>
          <Bullet>Deliver all assigned 1-on-1 tutoring sessions per the student's agreed schedule</Bullet>
          <Bullet>Lead office hours only when explicitly assigned by StudyCore</Bullet>
          <Bullet>Submit a session report after every session documenting session content, student progress, and any concerns</Bullet>
          <Bullet>Respond to all messages from StudyCore and parents within 24 hours</Bullet>
          <Bullet>Monitor student progress proactively and report any concerns to StudyCore immediately</Bullet>
          <Bullet>Participate in weekly check-ins with Harshil Chilukuri to discuss student progress and flag any issues</Bullet>
          <Bullet>Conduct all sessions with camera on, reliable internet, and via the platform designated by StudyCore (currently Zoom with Fathom recording)</Bullet>
          <Bullet><Text style={styles.bold}>Rescheduling: </Text>Tutor must provide at least 24 hours notice to reschedule a session. Rescheduling with less than 24 hours notice counts as 1 strike. With proper notice (24+ hours), Tutor may reschedule a maximum of 3 sessions per student per calendar month — a fourth reschedule in the same calendar month counts as 1 strike.</Bullet>
          <Bullet><Text style={styles.bold}>Makeup Sessions: </Text>If Tutor must cancel a scheduled session for any reason, Tutor is required to coordinate a makeup session with the student at a mutually agreeable time as soon as possible. Makeup sessions must be completed within the same calendar week where possible, or the following week at the latest. Failure to arrange a timely makeup is grounds for a strike.</Bullet>
        </Section>

        {/* 03 */}
        <Section number={3} title="STUDENT COMMITMENT">
          <Text style={styles.paragraph}>
            Once Tutor accepts a student assignment, Tutor commits to remaining with that student for the full duration of the student's program. Early departure without prior written approval from StudyCore is a terminable offense and may affect Tutor's final compensation.
          </Text>
          <Text style={styles.paragraph}>
            Exceptions are considered solely at StudyCore's discretion. No category of circumstance automatically qualifies. Tutor must submit a written request and receive written approval from StudyCore before ending any student assignment.
          </Text>
        </Section>

        {/* 04 */}
        <Section number={4} title="PERFORMANCE STANDARDS & STRIKE SYSTEM">
          <Text style={styles.paragraph}>StudyCore maintains the following strike policy to ensure student experience and program integrity:</Text>
          <Bullet><Text style={styles.bold}>1 Strike: </Text>Arriving 10 or more minutes late to a scheduled session</Bullet>
          <Bullet><Text style={styles.bold}>2 Strikes: </Text>Missing a scheduled session without prior notice. Tutor forfeits pay for any session they miss.</Bullet>
          <Bullet><Text style={styles.bold}>3 Strikes: </Text>Termination without pay for the current pay period</Bullet>
          <Text style={styles.paragraph}>
            Strikes are tracked and issued at StudyCore's discretion. Tutor will be notified in writing each time a strike is issued.
          </Text>
        </Section>

        {/* 05 */}
        <Section number={5} title="PAYMENT & COMPENSATION">
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Starting Rate: </Text>$20.00 per hour for 1-on-1 tutoring sessions and office hours.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Performance Rate Progression: </Text>Each time a student assigned to Tutor achieves their target SAT score on their first official SAT after completing the program, Tutor advances to the next rate tier. Tiers: $20.00 → $22.00 → $25.00 → $27.00 → $30.00 → $32.00 → $35.00/hr (maximum). Rate increase takes effect the pay period following score confirmation. Tutor's current rate at signing governs all active assignments until the next progression.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Pay Schedule: </Text>Payments are issued twice monthly — on the 15th and on the last day of each calendar month — via Zelle.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Forfeited Sessions: </Text>Tutor forfeits pay for any session they miss without prior notice to StudyCore.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Refund Clause: </Text>If a student discontinues within their first three (3) 1-on-1 sessions, Tutor will not receive payment for those sessions. If the discontinuation is determined by StudyCore to be due to Tutor's conduct or performance, Tutor will additionally receive one (1) strike.
          </Text>
        </Section>

        {/* 06 */}
        <Section number={6} title="TAX RESPONSIBILITY">
          <Text style={styles.paragraph}>
            Tutor is solely responsible for reporting and paying all federal, state, and local taxes on income earned under this Agreement, including self-employment tax. StudyCore will not withhold income tax, Social Security, or Medicare from any payments. StudyCore will issue a 1099-NEC to Tutor for any calendar year in which Tutor earns $600.00 or more. Tutor agrees to provide accurate tax information (including a completed W-9) upon request.
          </Text>
        </Section>

        {/* 07 */}
        <Section number={7} title="SESSION RECORDING & CONFIDENTIALITY">
          <Text style={styles.paragraph}>
            All tutoring sessions are recorded via Fathom for quality assurance and student progress review. By signing this Agreement, Tutor consents to session recording. Recordings are confidential and accessible only to the student, parent, and StudyCore team.
          </Text>
          <Text style={styles.paragraph}>
            Tutor agrees to keep all student information — including name, contact details, academic performance, and session content — strictly confidential. Tutor may not share, distribute, or discuss any student information outside of the StudyCore team. This obligation survives the termination of this Agreement.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Social Media & Public Posting: </Text>Tutor agrees not to post, share, or publish any information identifying or relating to StudyCore students — including names, academic performance, session content, or any identifiable details — on any social media platform, online forum, or public channel. General references to tutoring work that do not identify or expose any student are permitted. This obligation survives termination of this Agreement.
          </Text>
        </Section>

        {/* 08 */}
        <Section number={8} title="INTELLECTUAL PROPERTY">
          <Text style={styles.paragraph}>
            All study materials, lesson plans, drill sets, strategy guides, and resources provided by or created in connection with StudyCore are proprietary intellectual property of StudyCore LLC. Tutor may use these materials solely for the purpose of delivering services under this Agreement. Tutor may not reproduce, distribute, resell, or use these materials outside of StudyCore-assigned sessions without prior written consent from StudyCore LLC.
          </Text>
        </Section>

        {/* 09 */}
        <Section number={9} title="NON-SOLICITATION">
          <Text style={styles.paragraph}>
            Tutor agrees not to directly hire, solicit, or engage any StudyCore student or family for private tutoring services outside of StudyCore LLC during the term of this Agreement and for twelve (12) months following its termination. Violation of this clause will result in a fee equal to six (6) months of Tutor's standard StudyCore rate, payable immediately upon demand by StudyCore LLC.
          </Text>
        </Section>

        {/* 10 */}
        <Section number={10} title="NON-DISPARAGEMENT">
          <Text style={styles.paragraph}>
            Tutor agrees not to make any disparaging, defamatory, or negative statements about StudyCore LLC, its founders, employees, or services to current or former students, parents, or in any public forum (including but not limited to Google, Yelp, Reddit, or social media). Tutor also agrees not to encourage any student or parent to request a chargeback, dispute a payment, or file a complaint against StudyCore. This obligation survives termination of this Agreement.
          </Text>
        </Section>

        {/* 11 */}
        <Section number={11} title="TERMINATION">
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Tutor-Initiated: </Text>Tutor must provide a minimum of two (2) weeks written notice before terminating this Agreement. Tutor will be compensated for sessions delivered during the notice period.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>StudyCore-Initiated for Cause: </Text>StudyCore may terminate this Agreement immediately and without pay for the current pay period for any of the following: reaching the three-strike threshold, unprofessional conduct toward parents, students, or the StudyCore team, breach of confidentiality, abandonment of a student mid-program without approval, or any other serious misconduct at StudyCore's discretion.
          </Text>
          <Text style={styles.paragraph}>
            Upon termination for any reason, Tutor must immediately cease use of all StudyCore materials and return or destroy any proprietary resources in their possession.
          </Text>
        </Section>

        {/* 12 */}
        <Section number={12} title="LIMITATION OF LIABILITY">
          <Text style={styles.paragraph}>
            StudyCore LLC's total liability to Tutor shall not exceed the total amount paid to Tutor in the sixty (60) days preceding the claim. StudyCore LLC is not liable for indirect, incidental, or consequential damages.
          </Text>
        </Section>

        {/* 13 */}
        <Section number={13} title="DISPUTE RESOLUTION">
          <Text style={styles.paragraph}>
            Disputes shall first be attempted informally via support@studycore.net. If unresolved within thirty (30) days, disputes shall be resolved by binding arbitration in San Ramon, California under AAA rules. This Agreement is governed by the laws of the State of California.
          </Text>
        </Section>

        {/* 14 */}
        <Section number={14} title="ENTIRE AGREEMENT">
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Written Notice: </Text>For purposes of this Agreement, "written notice" means a communication delivered via email to the contact addresses on file or via text message (SMS) to the phone numbers on file. Notice is deemed received upon successful delivery.
          </Text>
          <Text style={styles.paragraph}>
            This Agreement supersedes all prior discussions and agreements between the parties. Modifications must be in writing and signed by both parties. If any provision is found unenforceable, remaining provisions remain in full force.
          </Text>
        </Section>

        {/* Signatures */}
        <View style={styles.signaturesSection}>
          <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>SIGNATURES</Text>

          <View style={styles.signatureBlock}>
            <View style={styles.signedByBox}>
              <Text style={styles.signedByText}>Electronically signed by: Harshil Chilukuri</Text>
              <Text style={styles.signedByMeta}>Title: Founder, StudyCore LLC</Text>
              <Text style={styles.signedByMeta}>Date: {effectiveDate}</Text>
            </View>
          </View>

          <View style={styles.signatureBlock}>
            {signedName ? (
              <View style={styles.signedByBox}>
                <Text style={styles.signedByText}>Electronically signed by: {signedName}</Text>
                <Text style={styles.signedByMeta}>Date: {signedDateStr}</Text>
                <Text style={styles.signedByMeta}>
                  By signing this Agreement electronically, Tutor agrees to all terms above.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>Tutor Name (Print): {tutorName || '___________________________'}</Text>
                <Text style={styles.signatureLabel}>Date: ___________________________</Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          StudyCore LLC · San Ramon, California · support@studycore.net · studycore.net
        </Text>
      </Page>
    </Document>
  );
}

export async function generateTutorContractPdf(data) {
  return renderToBuffer(<TutorContractDocument data={data} />);
}
