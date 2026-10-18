import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link, renderToBuffer } from '@react-pdf/renderer';

const C = {
  navy:        '#1B365D',
  blue:        '#2E75B6',
  green:       '#27AE60',
  orange:      '#D4740E',
  red:         '#C0392B',
  white:       '#FFFFFF',
  offWhite:    '#F7FAFD',
  lightBlue:   '#EAF3FB',
  lightOrange: '#FFF3E0',
  lightGreen:  '#EAFAF1',
  border:      '#DDE3EC',
  textDark:    '#1A1A1A',
  textMid:     '#444444',
  textLight:   '#777777',
};

const TIER_COLORS = {
  'Teach First':  { bg: '#FDEDEC', text: C.red },
  'High Value':   { bg: '#FEF3E2', text: C.orange },
  'Standard':     { bg: '#EAF3FB', text: C.blue },
  'Only If Time': { bg: '#F4F6F7', text: C.textLight },
  'Pacing':       { bg: '#EAFAF1', text: C.green },
  'Cross-Cutting':{ bg: '#EAF3FB', text: C.blue },
};

const START_TIER_COLORS = {
  'Foundational':  { bg: '#FDEDEC', text: C.red },
  'Developing':    { bg: '#FEF3E2', text: C.orange },
  'Optimization':  { bg: '#EAFAF1', text: C.green },
};

const PHASE_COLORS = {
  'Phase 1': C.navy,
  'Phase 2': '#4A6FA5',
  'Phase 3': '#2980B9',
  'Phase 4': '#1A6B5A',
  'Phase 5': '#6C3483',
  'Pacing':  C.green,
  'WAE':     C.blue,
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    paddingTop: 32,
    paddingBottom: 40,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.textDark,
  },
  // Header
  header: {
    backgroundColor: C.navy,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  headerBrand: {
    color: '#7FB3D8',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
    marginBottom: 3,
  },
  headerName: {
    color: C.white,
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  headerTagline: {
    color: '#B8CDE0',
    fontSize: 9,
    fontFamily: 'Helvetica-Oblique',
  },
  // Score cards row
  scoreRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 8,
  },
  scoreCard: {
    flex: 1,
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  scoreValue: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  scoreSub: {
    fontSize: 7,
    textAlign: 'center',
  },
  // Section bar
  sectionBar: {
    backgroundColor: C.navy,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionBarText: {
    color: C.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
  },
  // Body text
  body: {
    fontSize: 9,
    lineHeight: 1.55,
    color: C.textMid,
    marginBottom: 4,
  },
  // Callout boxes
  calloutBlue: {
    backgroundColor: C.lightBlue,
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  calloutOrange: {
    backgroundColor: C.lightOrange,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  calloutGreen: {
    backgroundColor: C.lightGreen,
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  calloutLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 3,
  },
  calloutBody: {
    fontSize: 8.5,
    lineHeight: 1.5,
    color: C.textDark,
  },
  // Overview grid
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 8,
  },
  overviewCell: {
    width: '30%',
    marginBottom: 6,
  },
  overviewLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: C.blue,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  overviewValue: {
    fontSize: 9,
    color: C.textDark,
    fontFamily: 'Helvetica-Bold',
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    borderRadius: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  tableHeaderCell: {
    color: C.white,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    backgroundColor: C.offWhite,
  },
  tableCell: {
    fontSize: 7.5,
    color: C.textDark,
  },
  // Tier badge
  tierBadge: {
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tierBadgeText: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
  },
  // Session plan row
  sessionRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  sessionWeekBadge: {
    backgroundColor: C.navy,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
    marginRight: 6,
  },
  sessionWeekText: {
    color: C.white,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  // Phase card
  phaseCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  phaseHeader: {
    backgroundColor: C.navy,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  phaseHeaderText: {
    color: C.white,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  phaseBody: {
    padding: 10,
  },
  // CHK card
  chkCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    marginBottom: 5,
    overflow: 'hidden',
  },
  chkBadge: {
    backgroundColor: C.red,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  chkBadgeLabel: {
    color: C.white,
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  chkBadgeNum: {
    color: C.white,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  chkContent: {
    flex: 1,
    padding: 8,
  },
  chkTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.textDark,
    marginBottom: 2,
  },
  chkDetail: {
    fontSize: 7.5,
    color: C.textMid,
    lineHeight: 1.4,
  },
  // Bottom line
  bottomLine: {
    backgroundColor: C.navy,
    borderRadius: 4,
    padding: 12,
    marginTop: 8,
  },
  bottomLineLabel: {
    color: '#7FB3D8',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  bottomLineText: {
    color: C.white,
    fontSize: 9,
    lineHeight: 1.55,
    fontFamily: 'Helvetica-Bold',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: C.textLight,
  },
});

// ── Helper components ─────────────────────────────────────────────────────────

function SectionBar({ label }) {
  return (
    <View style={s.sectionBar}>
      <Text style={s.sectionBarText}>{label}</Text>
    </View>
  );
}

function TierBadge({ tier }) {
  const colors = TIER_COLORS[tier] || { bg: '#F4F6F7', text: C.textLight };
  return (
    <View style={[s.tierBadge, { backgroundColor: colors.bg }]}>
      <Text style={[s.tierBadgeText, { color: colors.text }]}>{tier}</Text>
    </View>
  );
}

function Footer({ studentName }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>StudyCore · {studentName} · SAT Gameplan · Confidential</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

function GameplanDocument({ data }) {
  const {
    studentName, grade, baselineScore, rwScore, mathScore, targetScore,
    targetTestDate, programStartDate, currentTutor, sessionFrequency,
    sessionsPurchased, sessionsCompleted,
    // Routing engine output
    topicSequence, programSummary, weeklyPlan,
    // Claude output
    executiveSummary, riskAssessment, tutorSessionGuidance, parentSupportGuide,
    phaseNarratives, checkpointTriggers, bottomLine,
  } = data;

  const scoreCards = [
    { label: 'BASELINE SCORE', value: baselineScore, sub: 'SAT diagnostic', bg: C.navy, labelC: '#7FB3D8', valueC: C.white, subC: '#B8CDE0' },
    { label: 'R/W SCORE',      value: rwScore || '—', sub: 'Reading & Writing', bg: '#2E75B6', labelC: '#B8D6F5', valueC: C.white, subC: '#B8D6F5' },
    { label: 'MATH SCORE',     value: mathScore || '—', sub: 'Mathematics',     bg: C.orange, labelC: '#F5D5A8', valueC: C.white, subC: '#F5D5A8' },
    { label: 'TARGET SCORE',   value: targetScore, sub: targetTestDate || '',  bg: C.green,  labelC: '#C8F0D8', valueC: C.white, subC: '#C8F0D8' },
  ];

  const contentTopics = topicSequence.filter(t => !t.isPacing && !t.isWAE);
  const feasibilityColor = { reachable: C.green, tight: C.orange, unlikely: C.red }[programSummary.feasibility] || C.textLight;

  return (
    <Document>
      {/* ── PAGE 1: Header, Scores, Summary, Overview, Topics ─────────────── */}
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerBrand}>S T U D Y C O R E  ·  S A T  G A M E P L A N</Text>
          <Text style={s.headerName}>{studentName}{grade ? `, Grade ${grade}` : ''}</Text>
          <Text style={s.headerTagline}>
            Baseline: {baselineScore} · Target: {targetScore} · Gap: +{programSummary.targetGain} pts · {programSummary.weeksNeeded} weeks
          </Text>
        </View>

        {/* Score cards */}
        <View style={s.scoreRow}>
          {scoreCards.map((c, i) => (
            <View key={i} style={[s.scoreCard, { backgroundColor: c.bg }]}>
              <Text style={[s.scoreLabel, { color: c.labelC }]}>{c.label}</Text>
              <Text style={[s.scoreValue, { color: c.valueC }]}>{c.value}</Text>
              <Text style={[s.scoreSub,  { color: c.subC   }]}>{c.sub}</Text>
            </View>
          ))}
        </View>

        {/* Executive Summary */}
        <View style={s.calloutBlue}>
          <Text style={[s.calloutLabel, { color: C.blue }]}>EXECUTIVE SUMMARY</Text>
          <Text style={s.calloutBody}>{executiveSummary}</Text>
        </View>

        {/* Risk Assessment */}
        <View style={s.calloutOrange}>
          <Text style={[s.calloutLabel, { color: C.orange }]}>RISK ASSESSMENT</Text>
          <Text style={s.calloutBody}>{riskAssessment}</Text>
        </View>

        {/* Program Overview */}
        <SectionBar label="PROGRAM OVERVIEW" />
        <View style={s.overviewGrid}>
          {[
            { label: 'ASSIGNED TUTOR',    value: currentTutor || 'TBD' },
            { label: 'PROGRAM START',     value: programStartDate || 'TBD' },
            { label: 'TEST DATE',         value: targetTestDate || 'TBD' },
            { label: 'SESSION FREQUENCY', value: sessionFrequency === '2x' ? '2× / week' : '1× / week' },
            { label: 'SESSIONS PURCHASED',value: sessionsPurchased || '—' },
            { label: 'SESSIONS COMPLETED',value: sessionsCompleted || '0' },
            { label: 'TOPICS TO TEACH',   value: String(programSummary.topicsToTeach) },
            { label: 'TOTAL SESSIONS NEEDED', value: String(programSummary.totalSessionsNeeded) },
            { label: 'WEEKS AT CADENCE',  value: String(programSummary.weeksNeeded) },
          ].map((item, i) => (
            <View key={i} style={s.overviewCell}>
              <Text style={s.overviewLabel}>{item.label}</Text>
              <Text style={s.overviewValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Feasibility */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
          <View style={[s.tierBadge, { backgroundColor: feasibilityColor + '22' }]}>
            <Text style={[s.tierBadgeText, { color: feasibilityColor, fontSize: 7.5 }]}>
              FEASIBILITY: {programSummary.feasibility.toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 8, color: C.textMid }}>
            {programSummary.totalDiagnosticMisses} diagnostic misses · {programSummary.missesToConvert.toFixed(0)} must convert · {programSummary.guaranteeStatus}
          </Text>
        </View>

        {/* Topic Priority Table */}
        <SectionBar label="TOPIC PRIORITY SEQUENCE" />
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: '4%'  }]}>#</Text>
          <Text style={[s.tableHeaderCell, { width: '36%' }]}>Topic</Text>
          <Text style={[s.tableHeaderCell, { width: '14%' }]}>Section</Text>
          <Text style={[s.tableHeaderCell, { width: '20%' }]}>Domain</Text>
          <Text style={[s.tableHeaderCell, { width: '9%'  }]}>Misses</Text>
          <Text style={[s.tableHeaderCell, { width: '17%' }]}>Priority</Text>
        </View>
        {topicSequence.map((t, i) => (
          <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]} wrap={false}>
            <Text style={[s.tableCell, { width: '4%',  color: C.textLight }]}>
              {t.isPacing || t.isWAE ? '★' : t.rank}
            </Text>
            <Text style={[s.tableCell, { width: '36%', fontFamily: 'Helvetica-Bold' }]}>{t.topic}</Text>
            <Text style={[s.tableCell, { width: '14%' }]}>{t.section}</Text>
            <Text style={[s.tableCell, { width: '20%' }]}>{t.domain}</Text>
            <Text style={[s.tableCell, { width: '9%',  color: t.misses > 0 ? C.red : C.textLight }]}>
              {t.misses > 0 ? t.misses.toFixed(1) : '—'}
            </Text>
            <View style={{ width: '17%' }}>
              <TierBadge tier={t.tierLabel} />
            </View>
          </View>
        ))}
      </Page>

      {/* ── PAGE 2: Session Plan ───────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />
        <SectionBar label="SESSION-BY-SESSION PLAN" />
        <View style={{ marginBottom: 4 }}>
          <Text style={[s.body, { fontSize: 7.5, color: C.textLight }]}>
            Phase 1 = content mastery (Gate 1: 9/10 untimed) · Phase 2 = speed drills (Gate 2: 90%+ timed ×2) · Phase 3 = error pattern analysis (every 3 topics) · Phase 4 = practice test review (every 6 topics) · Phase 5 = weak point deep dive (only if Phase 4 flags it)
          </Text>
        </View>

        {/* Session plan header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: '7%'  }]}>WK</Text>
          <Text style={[s.tableHeaderCell, { width: '6%'  }]}>#</Text>
          <Text style={[s.tableHeaderCell, { width: '9%'  }]}>Phase</Text>
          <Text style={[s.tableHeaderCell, { width: '33%' }]}>Topic</Text>
          <Text style={[s.tableHeaderCell, { width: '12%' }]}>Start Tier</Text>
          <Text style={[s.tableHeaderCell, { width: '33%' }]}>Gate / Target</Text>
        </View>

        {weeklyPlan.map((row, i) => {
          const phaseColor = PHASE_COLORS[row.phase] || C.navy;
          const rowBg = row.isSharedPhase
            ? (row.phase === 'Phase 3' ? '#EAF3FB' : row.phase === 'Phase 4' ? '#EAFAF1' : '#F5EEF8')
            : (i % 2 === 1 ? C.offWhite : C.white);
          const startTierColors = row.startTier ? (START_TIER_COLORS[row.startTier] || {}) : null;
          return (
            <View key={i} style={[s.sessionRow, { backgroundColor: rowBg }]} wrap={false}>
              <View style={[s.sessionWeekBadge, { marginRight: 4, backgroundColor: phaseColor }]}>
                <Text style={s.sessionWeekText}>{row.week}</Text>
              </View>
              <Text style={[s.tableCell, { width: '5%', color: C.textLight }]}>{row.session}</Text>
              <View style={{ width: '10%', justifyContent: 'center' }}>
                <View style={[s.tierBadge, { backgroundColor: phaseColor + '22' }]}>
                  <Text style={[s.tierBadgeText, { color: phaseColor, fontSize: 6 }]}>{row.phase}</Text>
                </View>
              </View>
              <Text style={[s.tableCell, { width: '33%', fontFamily: row.isSharedPhase ? 'Helvetica-Oblique' : 'Helvetica-Bold', color: row.isSharedPhase ? C.textMid : C.textDark }]}>
                {row.topic}
              </Text>
              <View style={{ width: '12%', justifyContent: 'center' }}>
                {startTierColors && (
                  <View style={[s.tierBadge, { backgroundColor: startTierColors.bg }]}>
                    <Text style={[s.tierBadgeText, { color: startTierColors.text, fontSize: 6 }]}>
                      {row.startTier === 'Foundational' ? 'Found.' : row.startTier === 'Developing' ? 'Dev.' : 'Opt.'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[s.tableCell, { width: '33%', color: C.textMid, fontSize: 7 }]}>{row.gateTarget}</Text>
            </View>
          );
        })}

        {programSummary.needsPacing && (
          <View style={[s.calloutGreen, { marginTop: 8 }]}>
            <Text style={[s.calloutLabel, { color: C.green }]}>PACING NOTE</Text>
            <Text style={s.calloutBody}>
              Student left {programSummary.blanks} questions blank on the diagnostic. Session 1 is dedicated to Pacing, Triage & Test Execution — this must happen before any content topic is introduced.
            </Text>
          </View>
        )}
      </Page>

      {/* ── PAGE 3: Tutor Guidance, Parent Guide ──────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        <SectionBar label="TUTOR SESSION GUIDANCE" />
        {(tutorSessionGuidance || '').split('\n\n').filter(Boolean).map((para, i) => (
          <Text key={i} style={s.body}>{para}</Text>
        ))}

        <SectionBar label="PARENT SUPPORT GUIDE" />
        {(parentSupportGuide || '').split('\n\n').filter(Boolean).map((para, i) => (
          <Text key={i} style={s.body}>{para}</Text>
        ))}
      </Page>

      {/* ── PAGE 4: Curriculum Resources ──────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />
        <SectionBar label="CURRICULUM RESOURCES — LESSON PLAN LINKS" />
        <View style={{ marginBottom: 6 }}>
          <Text style={[s.body, { fontSize: 8, color: C.textLight }]}>
            Click any link below to open that topic's full lesson plan (Phase 1 script, drills, homework assignments, and error-pattern guide) in the StudyCore Notion curriculum.
          </Text>
        </View>

        {/* Resources table header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: '5%'  }]}>#</Text>
          <Text style={[s.tableHeaderCell, { width: '36%' }]}>Topic</Text>
          <Text style={[s.tableHeaderCell, { width: '14%' }]}>Section</Text>
          <Text style={[s.tableHeaderCell, { width: '13%' }]}>Start Tier</Text>
          <Text style={[s.tableHeaderCell, { width: '32%' }]}>Lesson Plan</Text>
        </View>

        {topicSequence.map((t, i) => {
          const startTierColors = t.startTier ? (START_TIER_COLORS[t.startTier] || {}) : null;
          return (
            <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]} wrap={false}>
              <Text style={[s.tableCell, { width: '5%', color: C.textLight }]}>
                {t.isPacing || t.isWAE ? '★' : t.rank}
              </Text>
              <Text style={[s.tableCell, { width: '36%', fontFamily: 'Helvetica-Bold' }]}>{t.topic}</Text>
              <Text style={[s.tableCell, { width: '14%' }]}>{t.section}</Text>
              <View style={{ width: '13%', justifyContent: 'center' }}>
                {startTierColors ? (
                  <View style={[s.tierBadge, { backgroundColor: startTierColors.bg }]}>
                    <Text style={[s.tierBadgeText, { color: startTierColors.text }]}>{t.startTier}</Text>
                  </View>
                ) : (
                  <Text style={[s.tableCell, { color: C.textLight }]}>—</Text>
                )}
              </View>
              <View style={{ width: '32%', justifyContent: 'center' }}>
                {t.notionUrl ? (
                  <Link src={t.notionUrl} style={{ textDecoration: 'none' }}>
                    <Text style={{ fontSize: 7, color: C.blue, fontFamily: 'Helvetica-Bold' }}>Open Lesson Plan</Text>
                  </Link>
                ) : (
                  <Text style={[s.tableCell, { color: C.textLight }]}>—</Text>
                )}
              </View>
            </View>
          );
        })}

        <View style={[s.calloutBlue, { marginTop: 10 }]}>
          <Text style={[s.calloutLabel, { color: C.blue }]}>HOW TO USE THESE LINKS</Text>
          <Text style={s.calloutBody}>
            Before each session: (1) check the student's Mastery Tracker for today's topic and phase, (2) identify the Start Tier from this table, (3) click "Open Lesson Plan" to go directly to the Phase 1 page for that topic. Start Tier is Foundational if the student missed easy/medium questions, Developing if they missed mostly hard questions, Optimization if they got nearly everything right (Phase 1 may be brief).
          </Text>
        </View>
      </Page>

      {/* ── PAGE 4: Phase Narratives, Checkpoints, Bottom Line ────────────── */}
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        <SectionBar label="PHASE-BY-PHASE PLAN" />
        {(phaseNarratives || []).map((phase, i) => (
          <View key={i} style={s.phaseCard} wrap={false}>
            <View style={s.phaseHeader}>
              <Text style={s.phaseHeaderText}>{phase.phaseLabel}</Text>
            </View>
            <View style={s.phaseBody}>
              <Text style={s.body}>{phase.description}</Text>
              {phase.tutorFocus && (
                <View style={[s.calloutBlue, { marginTop: 4 }]}>
                  <Text style={[s.calloutLabel, { color: C.blue }]}>TUTOR</Text>
                  <Text style={s.calloutBody}>{phase.tutorFocus}</Text>
                </View>
              )}
              {phase.parentCheckpoint && (
                <View style={[s.calloutOrange, { marginTop: 4 }]}>
                  <Text style={[s.calloutLabel, { color: C.orange }]}>PARENT CHECK</Text>
                  <Text style={s.calloutBody}>{phase.parentCheckpoint}</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        <SectionBar label="WHEN TO CONTACT STUDYCORE" />
        {(checkpointTriggers || []).map((trigger, i) => {
          const parts = trigger.split(/,\s*contact/i);
          return (
            <View key={i} style={s.chkCard} wrap={false}>
              <View style={s.chkBadge}>
                <Text style={s.chkBadgeLabel}>CHK</Text>
                <Text style={s.chkBadgeNum}>{i + 1}</Text>
              </View>
              <View style={s.chkContent}>
                <Text style={s.chkTitle}>{parts[0] || trigger}</Text>
                {parts[1] && <Text style={s.chkDetail}>Contact{parts[1]}</Text>}
              </View>
            </View>
          );
        })}

        {bottomLine && (
          <View style={s.bottomLine}>
            <Text style={s.bottomLineLabel}>T H E  B O T T O M  L I N E</Text>
            <Text style={s.bottomLineText}>{bottomLine}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

// ── Data transform ────────────────────────────────────────────────────────────

function buildDocumentData(studentData, routingResult, claudeOutput) {
  return {
    // Student / program info
    studentName:       studentData.studentName,
    grade:             studentData.grade || null,
    baselineScore:     studentData.baselineScore,
    rwScore:           studentData.rwScore || null,
    mathScore:         studentData.mathScore || null,
    targetScore:       studentData.targetScore,
    targetTestDate:    studentData.targetTestDate || null,
    programStartDate:  studentData.programStartDate || null,
    currentTutor:      studentData.currentTutor || null,
    sessionFrequency:  studentData.sessionFrequency || '2x',
    sessionsPurchased: studentData.sessionsPurchased || null,
    sessionsCompleted: studentData.sessionsCompleted || null,
    // Routing engine output
    topicSequence:     routingResult.topicSequence,
    programSummary:    routingResult.programSummary,
    weeklyPlan:        routingResult.weeklyPlan,
    // Claude output
    executiveSummary:    claudeOutput.executiveSummary    || '',
    riskAssessment:      claudeOutput.riskAssessment      || '',
    tutorSessionGuidance:claudeOutput.tutorSessionGuidance|| '',
    parentSupportGuide:  claudeOutput.parentSupportGuide  || '',
    phaseNarratives:     claudeOutput.phaseNarratives     || [],
    checkpointTriggers:  claudeOutput.checkpointTriggers  || [],
    bottomLine:          claudeOutput.bottomLine          || '',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function buildGameplanPdf(studentData, routingResult, claudeOutput) {
  const data = buildDocumentData(studentData, routingResult, claudeOutput);
  return await renderToBuffer(<GameplanDocument data={data} />);
}
