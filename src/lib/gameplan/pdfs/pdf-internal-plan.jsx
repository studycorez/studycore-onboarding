import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const C = {
  navy:      '#1B365D',
  blue:      '#2E75B6',
  green:     '#27AE60',
  orange:    '#D4740E',
  red:       '#C0392B',
  white:     '#FFFFFF',
  offWhite:  '#F7FAFD',
  lightBlue: '#EAF3FB',
  border:    '#DDE3EC',
  textDark:  '#1A1A1A',
  textMid:   '#444444',
  textLight: '#777777',
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    paddingTop: 30,
    paddingBottom: 40,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.textDark,
  },
  header: {
    backgroundColor: C.navy,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: {},
  headerBrand: { color: '#7FB3D8', fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 2, marginBottom: 3 },
  headerName:  { color: C.white,   fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerSub:   { color: '#B8CDE0', fontSize: 8, fontFamily: 'Helvetica-Oblique' },
  headerBadge: {
    backgroundColor: C.red,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBadgeText: { color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },

  // Metric grid
  metricRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  metricCard: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 8, alignItems: 'center' },
  metricLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase', textAlign: 'center' },
  metricValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 1 },
  metricSub:   { fontSize: 6.5, color: C.textLight, textAlign: 'center' },

  // Guarantee box
  guaranteeBox: {
    backgroundColor: C.lightBlue,
    borderWidth: 1.5,
    borderColor: C.blue,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  guaranteeTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 1, marginBottom: 8 },
  guaranteeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  guaranteeCell: { width: '33%', marginBottom: 8 },
  guaranteeCellLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.textLight, letterSpacing: 0.5, marginBottom: 2, textTransform: 'uppercase' },
  guaranteeCellValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy },
  guaranteeCellSub:   { fontSize: 6.5, color: C.textLight },

  // Section bar
  sectionBar: {
    backgroundColor: C.navy,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionBarText: { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    borderRadius: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableHeaderCell: { color: C.white, fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  tableCell: { fontSize: 7, color: C.textDark },

  // Tier badge inline
  badge: { borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeText: { fontSize: 6, fontFamily: 'Helvetica-Bold' },

  // Feasibility bar
  feasBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    padding: '6px 10px',
    borderRadius: 4,
  },

  // Footer
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6.5, color: C.textLight },
});

const TIER_COLORS = {
  'Teach First':  { bg: '#FDEDEC', text: C.red },
  'High Value':   { bg: '#FEF3E2', text: C.orange },
  'Standard':     { bg: '#EAF3FB', text: C.blue },
  'Only If Time': { bg: '#F4F6F7', text: C.textLight },
  'Pacing':       { bg: '#EAFAF1', text: C.green },
  'Cross-Cutting':{ bg: '#EAF3FB', text: C.blue },
};

const START_TIER_ABBR = { Foundational: 'F', Developing: 'D', Optimization: 'O' };
const START_TIER_COLORS = {
  Foundational: { bg: '#FDEDEC', text: C.red },
  Developing:   { bg: '#FEF3E2', text: C.orange },
  Optimization: { bg: '#EAFAF1', text: C.green },
};

function Footer({ studentName }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>StudyCore · {studentName} · Internal Program Brief · CONFIDENTIAL</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function SectionBar({ label }) {
  return <View style={s.sectionBar}><Text style={s.sectionBarText}>{label}</Text></View>;
}

function InternalDocument({ data }) {
  const {
    studentName, baselineScore, rwScore, mathScore, targetScore,
    targetTestDate, currentTutor, sessionFrequency, programStartDate,
    sessionsPurchased,
    topicSequence, programSummary, guaranteeMode,
  } = data;

  const contentTopics = topicSequence.filter(t => !t.isPacing && !t.isWAE);
  const feasColor = { reachable: C.green, tight: C.orange, unlikely: C.red }[programSummary.feasibility] || C.textLight;

  const ps = programSummary;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerBrand}>S T U D Y C O R E  ·  I N T E R N A L  B R I E F</Text>
            <Text style={s.headerName}>{studentName}</Text>
            <Text style={s.headerSub}>
              {baselineScore} to {targetScore} · +{ps.targetGain} pts · {ps.sessionsPerWeek}x/week{currentTutor ? ` · Tutor: ${currentTutor}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {guaranteeMode && (
              <View style={[s.headerBadge, { backgroundColor: C.green }]}>
                <Text style={s.headerBadgeText}>FREE SESSIONS</Text>
              </View>
            )}
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>CONFIDENTIAL</Text>
            </View>
          </View>
        </View>

        {/* Scores row */}
        <View style={s.metricRow}>
          {[
            { label: 'Baseline', value: baselineScore, sub: 'Total SAT' },
            { label: 'R&W',      value: rwScore || '—', sub: 'Reading & Writing' },
            { label: 'Math',     value: mathScore || '—', sub: 'Mathematics' },
            { label: 'Target',   value: targetScore, sub: targetTestDate || 'TBD' },
            { label: 'Gap',      value: `+${ps.targetGain}`, sub: 'points needed' },
          ].map((m, i) => (
            <View key={i} style={s.metricCard}>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text style={s.metricValue}>{m.value}</Text>
              <Text style={s.metricSub}>{m.sub}</Text>
            </View>
          ))}
        </View>

        {/* Guarantee / Pricing */}
        <View style={s.guaranteeBox}>
          <Text style={s.guaranteeTitle}>{guaranteeMode ? 'GUARANTEE \u2014 FREE SESSIONS ACTIVE' : 'GUARANTEE & PRICING'}</Text>
          <View style={s.guaranteeGrid}>
            {[
              { label: 'Paid Sessions',    value: ps.paidSessions != null ? String(ps.paidSessions) : '—',        sub: 'contracted' },
              { label: 'Median Free Ses.', value: ps.medianFreeSessions != null ? String(ps.medianFreeSessions) : '—', sub: 'median outcome' },
              { label: 'P90 Free Ses.',    value: ps.p90FreeSessions != null ? String(ps.p90FreeSessions) : '—',   sub: 'worst-case free' },
              { label: 'Price For',        value: ps.priceFor != null ? `${ps.priceFor} ses.` : '—',              sub: 'what student pays for' },
              { label: 'Contract Cap',     value: ps.contractCap != null ? `${ps.contractCap} ses.` : '—',        sub: 'max sessions' },
              { label: 'Guarantee',        value: ps.guaranteeStatus || '—',                                       sub: '' },
            ].map((c, i) => (
              <View key={i} style={s.guaranteeCell}>
                <Text style={s.guaranteeCellLabel}>{c.label}</Text>
                <Text style={s.guaranteeCellValue}>{c.value}</Text>
                {c.sub ? <Text style={s.guaranteeCellSub}>{c.sub}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        {/* Program metrics */}
        <View style={s.metricRow}>
          {[
            { label: 'Topics to Teach',    value: String(ps.topicsToTeach),        sub: 'content topics' },
            { label: 'Core Sessions',      value: String(ps.coreSessionsNeeded),   sub: 'Phase 1+2' },
            { label: 'Total Sessions',     value: String(ps.totalSessionsNeeded),  sub: 'incl. Phase 3-5' },
            { label: ps.weeksUntilTest != null ? 'Weeks to Test' : 'Weeks',
              value: String(ps.weeksUntilTest ?? ps.weeksNeeded),
              sub: ps.weeksUntilTest != null
                ? (ps.totalScheduledHours != null ? `${ps.totalScheduledHours}h purchased` : `${ps.availableSessions} sessions avail.`)
                : `at ${ps.sessionsPerWeek}×/week` },
            { label: 'Feasibility',        value: ps.feasibility,                  sub: `${ps.totalDiagnosticMisses} misses` },
          ].map((m, i) => (
            <View key={i} style={[s.metricCard, m.label === 'Feasibility' && { borderColor: feasColor }]}>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text style={[s.metricValue, m.label === 'Feasibility' && { fontSize: 12, color: feasColor }]}>{m.value}</Text>
              <Text style={s.metricSub}>{m.sub}</Text>
            </View>
          ))}
        </View>

        {/* Pacing flag */}
        {ps.needsPacing && (
          <View style={{ backgroundColor: '#EAFAF1', borderLeftWidth: 3, borderLeftColor: C.green, borderRadius: 3, padding: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.green, marginBottom: 2 }}>PACING FLAG</Text>
            <Text style={{ fontSize: 8, color: C.textDark }}>
              Student left {ps.blanks} questions blank. Pacing, Triage & Test Execution runs as Session 1 before any content topic. Free sessions for blanks: ~{Math.round(ps.blanks * 0.5)} pts recoverable.
            </Text>
          </View>
        )}

        {/* Topic table */}
        <SectionBar label="TOPIC SEQUENCE" />
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: '4%'  }]}>#</Text>
          <Text style={[s.tableHeaderCell, { width: '34%' }]}>Topic</Text>
          <Text style={[s.tableHeaderCell, { width: '12%' }]}>Section</Text>
          <Text style={[s.tableHeaderCell, { width: '10%' }]}>Misses</Text>
          <Text style={[s.tableHeaderCell, { width: '10%' }]}>Pts/Ses</Text>
          <Text style={[s.tableHeaderCell, { width: '16%' }]}>Priority</Text>
          <Text style={[s.tableHeaderCell, { width: '14%' }]}>Start Tier</Text>
        </View>
        {topicSequence.map((t, i) => {
          const tierC = TIER_COLORS[t.tierLabel] || { bg: '#F4F6F7', text: C.textLight };
          const stC   = t.startTier ? (START_TIER_COLORS[t.startTier] || {}) : null;
          return (
            <View key={i} style={[s.tableRow, i % 2 === 1 && { backgroundColor: C.offWhite }]} wrap={false}>
              <Text style={[s.tableCell, { width: '4%', color: C.textLight }]}>
                {t.isPacing || t.isWAE ? '★' : t.rank}
              </Text>
              <Text style={[s.tableCell, { width: '34%', fontFamily: 'Helvetica-Bold' }]}>{t.topic}</Text>
              <Text style={[s.tableCell, { width: '12%' }]}>{t.section}</Text>
              <Text style={[s.tableCell, { width: '10%', color: t.misses > 0 ? C.red : C.textLight, fontFamily: t.misses > 0 ? 'Helvetica-Bold' : 'Helvetica' }]}>
                {t.misses > 0 ? t.misses.toFixed(1) : '—'}
              </Text>
              <Text style={[s.tableCell, { width: '10%' }]}>
                {t.ptsPerSession > 0 ? `+${t.ptsPerSession}` : '—'}
              </Text>
              <View style={{ width: '16%', justifyContent: 'center' }}>
                <View style={[s.badge, { backgroundColor: tierC.bg }]}>
                  <Text style={[s.badgeText, { color: tierC.text }]}>{t.tierLabel || '—'}</Text>
                </View>
              </View>
              <View style={{ width: '14%', justifyContent: 'center' }}>
                {stC ? (
                  <View style={[s.badge, { backgroundColor: stC.bg }]}>
                    <Text style={[s.badgeText, { color: stC.text }]}>{t.startTier}</Text>
                  </View>
                ) : <Text style={[s.tableCell, { color: C.textLight }]}>—</Text>}
              </View>
            </View>
          );
        })}

        {/* Conversion math */}
        <View style={{ marginTop: 8, padding: '8px 10px', backgroundColor: C.offWhite, borderRadius: 4, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 7.5, color: C.textMid }}>
            Correct answers needed: {ps.correctAnswersNeeded} · Diagnostic misses: {ps.totalDiagnosticMisses} · Must convert: {ps.missesToConvert?.toFixed(0)} · Conversion rate assumed: 50%{ps.blanks > 0 ? ` · Blanks: ${ps.blanks}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function buildDocumentData(studentData, routingResult) {
  return {
    studentName:      studentData.studentName,
    baselineScore:    studentData.baselineScore,
    rwScore:          studentData.rwScore || null,
    mathScore:        studentData.mathScore || null,
    targetScore:      studentData.targetScore,
    targetTestDate:   studentData.targetTestDate || null,
    currentTutor:     studentData.currentTutor || null,
    sessionFrequency: studentData.sessionFrequency || '2x',
    programStartDate: studentData.programStartDate || null,
    sessionsPurchased:studentData.sessionsPurchased || null,
    topicSequence:    routingResult.topicSequence,
    programSummary:   routingResult.programSummary,
    guaranteeMode:    studentData.guaranteeMode || false,
  };
}

export async function buildInternalPlanPdf(studentData, routingResult) {
  const data = buildDocumentData(studentData, routingResult);
  return await renderToBuffer(<InternalDocument data={data} />);
}
