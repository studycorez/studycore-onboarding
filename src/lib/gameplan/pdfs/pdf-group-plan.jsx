import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const C = {
  navy:      '#1B365D',
  blue:      '#2E75B6',
  green:     '#27AE60',
  orange:    '#D4740E',
  red:       '#C0392B',
  purple:    '#7B2D8B',
  teal:      '#0E7490',
  white:     '#FFFFFF',
  offWhite:  '#F7FAFD',
  lightBlue: '#EAF3FB',
  border:    '#DDE3EC',
  textDark:  '#1A1A1A',
  textMid:   '#444444',
  textLight: '#777777',
};

// Label badge colours per task type
const TYPE_META = {
  study:        { label: 'Study',      bg: '#EAF3FB', text: C.blue   },
  practice:     { label: 'Practice',   bg: '#EAFAF1', text: C.green  },
  review:       { label: 'Review',     bg: '#FEF3E2', text: C.orange },
  drill:        { label: 'Q-Bank',     bg: '#F3E8FF', text: C.purple },
  score_review: { label: 'Score Log',  bg: '#E0F2FE', text: C.teal  },
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    paddingTop: 30, paddingBottom: 40,
    paddingLeft: 36, paddingRight: 36,
    fontFamily: 'Helvetica', fontSize: 9, color: C.textDark,
  },
  header: {
    backgroundColor: C.navy, borderRadius: 4, padding: 12, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerBrand:     { color: '#7FB3D8', fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 2, marginBottom: 3 },
  headerName:      { color: C.white,   fontSize: 16,  fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerSub:       { color: '#B8CDE0', fontSize: 8,   fontFamily: 'Helvetica-Oblique' },
  headerBadge:     { backgroundColor: C.blue, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4 },
  headerBadgeText: { color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },

  metricRow:   { flexDirection: 'row', gap: 5, marginBottom: 8 },
  metricCard:  { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 8, alignItems: 'center' },
  metricLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase', textAlign: 'center' },
  metricValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 1 },
  metricSub:   { fontSize: 6.5, color: C.textLight, textAlign: 'center' },

  howToBox:   { backgroundColor: C.lightBlue, borderWidth: 1, borderColor: C.blue, borderRadius: 4, padding: 12, marginBottom: 8 },
  howToTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  howToRow:   { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-start' },
  howToNum:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, width: 14 },
  howToText:  { fontSize: 8, color: C.textDark, flex: 1 },

  tableHeader:     { flexDirection: 'row', backgroundColor: C.navy, borderRadius: 2, paddingVertical: 4, paddingHorizontal: 4, marginTop: 4 },
  tableHeaderCell: { color: C.white, fontSize: 6.5, fontFamily: 'Helvetica-Bold' },

  weekBar: {
    backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 8,
    marginTop: 6, marginBottom: 0, borderRadius: 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  weekBarText:  { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  weekBarRight: { color: '#B8CDE0', fontSize: 7, fontFamily: 'Helvetica-Oblique' },

  taskRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border,
    paddingVertical: 4, paddingHorizontal: 4, alignItems: 'flex-start',
  },

  badge: { borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 6, fontFamily: 'Helvetica-Bold' },

  ptBanner: {
    backgroundColor: '#FEF3E2', borderLeftWidth: 3, borderLeftColor: C.orange,
    paddingVertical: 7, paddingHorizontal: 10, marginTop: 2, borderRadius: 2,
  },
  ptBannerFinal: {
    backgroundColor: '#FDEDEC', borderLeftWidth: 3, borderLeftColor: C.red,
    paddingVertical: 7, paddingHorizontal: 10, marginTop: 2, borderRadius: 2,
  },

  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6.5, color: C.textLight },
});

function Footer({ studentName }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>StudyCore · {studentName} · Self-Study Assignment Schedule</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function getWeekLabel(weekNum, programStartDate) {
  if (!programStartDate) return `Week ${weekNum}`;
  const start    = new Date(programStartDate + 'T00:00:00');
  const wkStart  = new Date(start.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
  const wkEnd    = new Date(wkStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = d  => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Week ${weekNum}  ·  ${fmt(wkStart)} – ${fmt(wkEnd)}`;
}

function fmtTime(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function totalWeekMins(assignments) {
  return assignments.reduce((s, a) => s + (a.estMins || 0), 0);
}

function GroupDocument({ data }) {
  const { studentName, baselineScore, rwScore, mathScore, targetScore,
          targetTestDate, programStartDate, weeklyAssignments, programSummary } = data;
  const ps = programSummary;
  const feasColor = { reachable: C.green, tight: C.orange, unlikely: C.red }[ps.feasibility] || C.textLight;

  // Total assignments (excluding practice test rows, counting tasks)
  const totalTasks = weeklyAssignments.reduce((s, wk) =>
    s + wk.assignments.filter(a => a.type !== 'practice_test').length, 0);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerBrand}>S T U D Y C O R E  ·  S E L F - S T U D Y  P L A N</Text>
            <Text style={s.headerName}>{studentName}</Text>
            <Text style={s.headerSub}>
              {baselineScore} → {targetScore} · +{ps.targetGain} pts
              {targetTestDate ? `  ·  Test: ${targetTestDate}` : ''}
            </Text>
          </View>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>GROUP SESSION</Text>
          </View>
        </View>

        {/* Score cards */}
        <View style={s.metricRow}>
          {[
            { label: 'Baseline', value: String(baselineScore),      sub: 'Total SAT' },
            { label: 'R&W',      value: String(rwScore || '—'),     sub: 'Reading & Writing' },
            { label: 'Math',     value: String(mathScore || '—'),   sub: 'Mathematics' },
            { label: 'Target',   value: String(targetScore),        sub: targetTestDate || 'TBD' },
            { label: 'Gap',      value: `+${ps.targetGain}`,        sub: 'points needed' },
          ].map((m, i) => (
            <View key={i} style={s.metricCard}>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text style={s.metricValue}>{m.value}</Text>
              <Text style={s.metricSub}>{m.sub}</Text>
            </View>
          ))}
        </View>

        {/* Summary cards */}
        <View style={s.metricRow}>
          {[
            { label: 'Topics',         value: String(ps.topicsToTeach),      sub: 'StudyCore platform' },
            { label: 'Total Tasks',    value: String(totalTasks),             sub: 'assignments + drills' },
            { label: 'Weeks',          value: String(ps.weeksUntilTest),      sub: 'until test' },
            { label: 'Practice Tests', value: String(ps.practiceTestCount),   sub: 'full-length checkpoints' },
            { label: 'Feasibility',    value: ps.feasibility,                 sub: `${ps.totalDiagnosticMisses} diag. misses` },
          ].map((m, i) => (
            <View key={i} style={[s.metricCard, m.label === 'Feasibility' && { borderColor: feasColor }]}>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text style={[s.metricValue, m.label === 'Feasibility' && { fontSize: 11, color: feasColor }]}>{m.value}</Text>
              <Text style={s.metricSub}>{m.sub}</Text>
            </View>
          ))}
        </View>

        {/* How to use */}
        <View style={s.howToBox}>
          <Text style={s.howToTitle}>HOW TO USE THIS PLAN</Text>
          {[
            ['Study', 'Watch the lesson video and read all examples on the StudyCore platform before attempting any questions'],
            ['Practice', 'Complete all practice questions for that topic — attempt every question independently before reviewing'],
            ['Review', 'Label every wrong answer as Concept Gap, Careless, or Trap Answer. Bring your error log to office hours'],
            ['Q-Bank', 'Complete the mixed drill from the StudyCore Question Bank — no notes, under light time pressure'],
          ].map(([tag, text], i) => {
            const meta = TYPE_META[tag.toLowerCase().replace('-', '_')] || TYPE_META.study;
            return (
              <View key={i} style={s.howToRow}>
                <View style={[s.badge, { backgroundColor: meta.bg, marginRight: 6, marginTop: 1 }]}>
                  <Text style={[s.badgeText, { color: meta.text }]}>{tag}</Text>
                </View>
                <Text style={s.howToText}>{text}</Text>
              </View>
            );
          })}
        </View>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: '10%' }]}>Type</Text>
          <Text style={[s.tableHeaderCell, { width: '60%' }]}>Assignment</Text>
          <Text style={[s.tableHeaderCell, { width: '15%' }]}>Est. Time</Text>
          <Text style={[s.tableHeaderCell, { width: '15%' }]}>Done</Text>
        </View>

        {/* Weekly blocks */}
        {weeklyAssignments.map((wk) => {
          const weekMins = totalWeekMins(wk.assignments);
          return (
            <View key={wk.week} wrap={false}>
              {/* Week bar */}
              <View style={s.weekBar}>
                <Text style={s.weekBarText}>{getWeekLabel(wk.week, programStartDate)}</Text>
                {weekMins > 0 && (
                  <Text style={s.weekBarRight}>~{fmtTime(weekMins)} total</Text>
                )}
              </View>

              {/* Assignment rows */}
              {wk.assignments.map((a, ai) => {
                if (a.type === 'practice_test') {
                  const isFinal = a.isFinal;
                  return (
                    <View key={ai} style={isFinal ? s.ptBannerFinal : s.ptBanner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: isFinal ? C.red : C.orange }}>
                          {a.topic.toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 7.5, color: isFinal ? C.red : C.orange, marginLeft: 8, fontFamily: 'Helvetica-Bold' }}>
                          {fmtTime(a.estMins)}
                        </Text>
                        <Text style={{ fontSize: 10, color: isFinal ? C.red : C.orange, marginLeft: 'auto' }}>□</Text>
                      </View>
                      <Text style={{ fontSize: 7.5, color: C.textMid }}>{a.description}</Text>
                    </View>
                  );
                }

                const meta = TYPE_META[a.type] || { label: a.label || a.type, bg: '#F4F6F7', text: C.textLight };
                const isAlt = ai % 2 === 1;
                return (
                  <View key={ai} style={[s.taskRow, isAlt && { backgroundColor: C.offWhite }]}>
                    {/* Type badge */}
                    <View style={{ width: '10%', paddingTop: 1 }}>
                      <View style={[s.badge, { backgroundColor: meta.bg }]}>
                        <Text style={[s.badgeText, { color: meta.text }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {/* Description */}
                    <View style={{ width: '60%', paddingRight: 4 }}>
                      {a.topic && (
                        <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 1 }}>
                          {a.topic}
                        </Text>
                      )}
                      <Text style={{ fontSize: 7.5, color: C.textMid }}>{a.desc}</Text>
                    </View>
                    {/* Time */}
                    <Text style={{ width: '15%', fontSize: 7.5, color: C.textLight }}>{fmtTime(a.estMins)}</Text>
                    {/* Checkbox */}
                    <Text style={{ width: '15%', fontSize: 10, color: C.border }}>□</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

export async function buildGroupPlanPdf(studentData, groupResult) {
  const data = {
    studentName:      studentData.studentName,
    baselineScore:    studentData.baselineScore,
    rwScore:          studentData.rwScore || null,
    mathScore:        studentData.mathScore || null,
    targetScore:      studentData.targetScore,
    targetTestDate:   studentData.targetTestDate || null,
    programStartDate: studentData.programStartDate || null,
    topicSequence:    groupResult.topicSequence,
    weeklyAssignments: groupResult.weeklyAssignments,
    programSummary:   groupResult.programSummary,
  };
  return await renderToBuffer(<GroupDocument data={data} />);
}
