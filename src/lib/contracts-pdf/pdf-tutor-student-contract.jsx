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
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  alertBox: {
    marginTop: 12,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fff8f0',
    borderLeftWidth: 3,
    borderLeftColor: '#c2410c',
  },
  alertTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    color: '#c2410c',
  },
  infoBox: {
    marginBottom: 14,
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 4,
  },
  tableLabel: {
    width: 160,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
  },
  tableValue: {
    flex: 1,
    fontSize: 10,
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

function TableRow({ label, value }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue}>{value || '—'}</Text>
    </View>
  );
}

/**
 * @param {object} data
 * @param {string} data.tutorName
 * @param {string} data.tutorEmail
 * @param {string} data.effectiveDate
 * @param {string} data.studentName
 * @param {string} data.targetScore
 * @param {string} data.programWeeks
 * @param {string} data.sessionsPerWeek
 * @param {string} data.sessionLengthHours
 * @param {string} data.totalHours
 * @param {string} data.sessionDaysTimes
 * @param {string} data.startDate
 * @param {string} data.endDate
 * @param {string|null} data.signedName
 * @param {string|null} data.signedAt
 */
function TutorStudentContractDocument({ data }) {
  const {
    tutorName, effectiveDate, studentName, targetScore,
    programWeeks, sessionsPerWeek, sessionLengthHours, totalHours,
    sessionDaysTimes, startDate, endDate,
    signedName, signedAt,
  } = data;

  const signedDateStr = signedAt
    ? new Date(signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>StudyCore LLC</Text>
          <Text style={styles.docTitle}>Tutor-Student Assignment Agreement</Text>
          <Text style={styles.effectiveLine}>
            Effective {effectiveDate} between StudyCore LLC, {tutorName || '[Tutor Name]'}, and student {studentName || '[Student Name]'}.
          </Text>
        </View>

        {/* Intro */}
        <Text style={styles.paragraph}>
          This Tutor-Student Assignment Agreement ("Assignment Agreement") is entered into as of {effectiveDate} by and between StudyCore LLC, a California limited liability company ("StudyCore"), and {tutorName || '[Tutor Name]'} ("Tutor"). This Agreement governs Tutor's assignment to work with the student named below and supplements the General Tutor Services Agreement Tutor has already signed.
        </Text>

        {/* Assignment Details */}
        <View style={styles.infoBox}>
          <Text style={[styles.sectionTitle, { fontSize: 10, marginBottom: 6 }]}>ASSIGNMENT DETAILS</Text>
          <TableRow label="Student Name" value={studentName} />
          <TableRow label="Target SAT Score" value={targetScore} />
          <TableRow label="Program Duration" value={programWeeks ? `${programWeeks} weeks` : undefined} />
          <TableRow label="Total Hours" value={totalHours} />
          <TableRow label="Session Schedule" value={sessionDaysTimes} />
          <TableRow label="Program Start Date" value={startDate} />
          <TableRow label="Program End Date" value={endDate} />
        </View>

        {/* 01 */}
        <Section number={1} title="ACCEPTANCE OF ASSIGNMENT">
          <Text style={styles.paragraph}>
            By signing this Agreement, Tutor confirms acceptance of the above assignment and commits to delivering all scheduled sessions for the full duration of the student's program as defined above.
          </Text>
        </Section>

        {/* 02 */}
        <Section number={2} title="FULL-PROGRAM COMMITMENT">
          <Text style={styles.paragraph}>
            Tutor commits to remaining with {studentName || 'the assigned student'} for the full duration of the program. This commitment begins on the program Start Date and runs through the program End Date listed above.
          </Text>
          <Text style={styles.paragraph}>
            Exceptions to this commitment are considered solely at StudyCore's discretion. No category of circumstance automatically qualifies as an exception or exempts Tutor from the consequences described in Section 3. Tutor must submit a written request to StudyCore, provide any documentation requested, and receive written approval from StudyCore before ending this assignment. Departure without prior written approval from StudyCore — regardless of stated reason — does not exempt Tutor from the consequences set out in Section 3.
          </Text>
        </Section>

        {/* 03 — EARLY DEPARTURE */}
        <Section number={3} title="EARLY DEPARTURE CONSEQUENCES">
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>IMPORTANT — READ CAREFULLY</Text>
            <Text style={[styles.paragraph, { marginBottom: 0 }]}>
              If Tutor departs from this assignment before the program End Date without prior written approval from StudyCore, the following consequences apply:
            </Text>
          </View>

          <Text style={[styles.paragraph, { marginBottom: 2 }]}><Text style={styles.bold}>(a) Four-Week Notice Requirement: </Text>Tutor must provide a minimum of four (4) weeks written notice to StudyCore before ending this assignment. During the notice period, Tutor must continue delivering all scheduled sessions. Failure to provide adequate notice is a terminable offense under the General Agreement.</Text>

          <Text style={[styles.paragraph, { marginBottom: 2 }]}><Text style={styles.bold}>(b) Pay Clawback: </Text>If Tutor departs without completing the program and without StudyCore's written approval, StudyCore reserves the right to clawback payments made to Tutor in the most recently completed pay period. This clawback may be applied against any amounts owed to Tutor by StudyCore or demanded as repayment if no amounts are outstanding.</Text>

          <Text style={[styles.paragraph, { marginBottom: 2 }]}><Text style={styles.bold}>(c) Refund Liability: </Text>If Tutor's early departure causes StudyCore to issue a full or partial refund to the student's family, Tutor is liable for up to two (2) weeks of Tutor's standard hourly rate (calculated at the applicable session rate). StudyCore will notify Tutor in writing before exercising this clause.</Text>

          <Text style={[styles.paragraph, { marginBottom: 2 }]}><Text style={styles.bold}>(d) Permanent Rehire Ban: </Text>Tutor who abandons an assignment mid-program without written approval from StudyCore will be permanently ineligible for future engagement with StudyCore LLC in any capacity.</Text>
        </Section>

        {/* 04 */}
        <Section number={4} title="SESSION OBLIGATIONS & REPORTING">
          <Text style={styles.paragraph}>For the duration of this assignment, Tutor agrees to:</Text>
          <Bullet>Deliver all sessions per the schedule listed above</Bullet>
          <Bullet>Submit a session report within 24 hours of each session documenting content covered, student engagement, and homework assigned</Bullet>
          <Bullet>Maintain professional communication with the student's family</Bullet>
          <Bullet>Notify StudyCore immediately if any session must be rescheduled</Bullet>
          <Bullet><Text style={styles.bold}>Immediate Escalation Required: </Text>Tutor must notify StudyCore within 24 hours if: (a) the student fails to complete assigned homework, (b) the student appears disengaged or unresponsive during sessions, (c) Tutor observes any academic, motivational, or behavioral concern that may affect the student's progress toward their target score, or (d) any other issue arises that could impact the student's program outcome. Failure to escalate known issues is grounds for a strike.</Bullet>
          <Bullet>Participate in weekly check-ins with the StudyCore team to review {studentName || 'this student'}'s progress, flag any concerns, and align on next steps</Bullet>
        </Section>

        {/* 05 */}
        <Section number={5} title="PAYMENT FOR THIS ASSIGNMENT">
          <Text style={styles.paragraph}>
            Compensation for sessions delivered under this assignment is governed by the payment terms in the General Tutor Services Agreement ($20.00/hour, paid on the 15th and last day of each month via Zelle).
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Performance Bonus & Rate Progression: </Text>If {studentName || 'Student'} achieves their target score of {targetScore || '—'} on the first official SAT taken after completing the program, Tutor will receive a one-time cash bonus of $200.00 and will advance to the next rate tier per the Rate Progression schedule in the General Tutor Services Agreement. Both the bonus and rate increase take effect the pay period following official score confirmation. If the performance guarantee is triggered (see Section 6), Tutor forfeits the $200.00 bonus for this assignment.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Refund Clause: </Text>If the student discontinues within the first three (3) 1-on-1 sessions, Tutor will not receive payment for those sessions. If the discontinuation is determined by StudyCore to be caused by Tutor's conduct or performance, Tutor will additionally receive one (1) strike.
          </Text>
        </Section>

        {/* 06 */}
        <Section number={6} title="PERFORMANCE GUARANTEE OBLIGATION">
          <Text style={styles.paragraph}>
            StudyCore LLC offers a performance guarantee to students: if a student completes the full program and does not achieve their target score, StudyCore continues working with the student at no additional cost until the target is achieved.
          </Text>
          <Text style={styles.paragraph}>
            If {studentName || 'Student'} triggers this guarantee and Tutor remains actively engaged with StudyCore, Tutor is required to continue delivering sessions to {studentName || 'Student'} beyond the original program End Date. StudyCore will compensate Tutor at the standard rate ($20.00/hour) for all sessions delivered during the guarantee period. This obligation is a continuation of the current assignment and does not require a new contract.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Duration of Guarantee Obligation: </Text>The length of Tutor's guarantee obligation is determined at StudyCore's sole discretion. StudyCore will notify Tutor in writing when the guarantee obligation has been fulfilled or concluded.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Performance Review: </Text>If the guarantee is triggered, StudyCore will conduct a review of all session reports submitted by Tutor for this assignment. If the review identifies tutor-side deficiencies — including but not limited to missed session reports, poor session quality, lack of student engagement, or failure to meet obligations under Section 04 — Tutor will receive one (1) strike. If the review finds no tutor-side deficiencies, no consequence applies.
          </Text>
          <Text style={styles.paragraph}>
            If Tutor is no longer engaged with StudyCore at the time the guarantee is triggered, the continuation obligation does not apply and StudyCore will assign a replacement tutor. However, the performance review may still be conducted and a strike may still be issued if applicable.
          </Text>
        </Section>

        {/* 08 */}
        <Section number={8} title="RELATIONSHIP TO GENERAL AGREEMENT">
          <Text style={styles.paragraph}>
            This Assignment Agreement is a supplement to, and does not replace, the General Tutor Services Agreement. In the event of a conflict between the two agreements, the more restrictive provision applies. All other terms of the General Agreement remain in full force.
          </Text>
        </Section>

        {/* 07 */}
        <Section number={9} title="ENTIRE ASSIGNMENT AGREEMENT">
          <Text style={styles.paragraph}>
            This document constitutes the entire agreement between StudyCore and Tutor for this specific student assignment. Modifications must be in writing and signed by both parties.
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
                  By signing this Agreement electronically, Tutor agrees to all terms above, including early departure consequences in Section 3.
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

export async function generateTutorStudentContractPdf(data) {
  return renderToBuffer(<TutorStudentContractDocument data={data} />);
}
