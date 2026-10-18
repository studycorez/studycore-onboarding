import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const C = {
  navy:        '#1B365D',
  blue:        '#2E75B6',
  green:       '#27AE60',
  orange:      '#D4740E',
  white:       '#FFFFFF',
  offWhite:    '#F7FAFD',
  lightBlue:   '#EAF3FB',
  lightGreen:  '#EAFAF1',
  lightOrange: '#FFF3E0',
  border:      '#DDE3EC',
  textDark:    '#1A1A1A',
  textMid:     '#444444',
  textLight:   '#777777',
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    paddingTop: 32,
    paddingBottom: 44,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.textDark,
  },
  header: {
    backgroundColor: C.navy,
    borderRadius: 5,
    padding: 18,
    marginBottom: 14,
  },
  headerEyebrow: { color: '#7FB3D8', fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 2, marginBottom: 4 },
  headerName:    { color: C.white, fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  headerSub:     { color: '#B8CDE0', fontSize: 9 },

  // Score cards
  scoreRow:  { flexDirection: 'row', gap: 6, marginBottom: 12 },
  scoreCard: { flex: 1, borderRadius: 4, padding: 10, alignItems: 'center' },
  scoreLabel:{ fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, marginBottom: 3, textAlign: 'center' },
  scoreValue:{ fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  scoreSub:  { fontSize: 7, textAlign: 'center' },

  // Section heading
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: C.blue,
    paddingBottom: 3,
  },

  body: { fontSize: 9.5, lineHeight: 1.6, color: C.textMid, marginBottom: 5 },

  // Topic pill row
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  pill: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: C.offWhite,
  },
  pillText: { fontSize: 8.5, color: C.navy, fontFamily: 'Helvetica-Bold' },

  // Step cards (how it works)
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  stepCard: { flex: 1, borderRadius: 5, padding: 10 },
  stepNum:  { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  stepTitle:{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  stepBody: { fontSize: 8, lineHeight: 1.5 },

  // Callout
  callout: {
    borderLeftWidth: 3,
    borderRadius: 3,
    padding: 10,
    marginBottom: 8,
  },
  calloutLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 4 },
  calloutBody:  { fontSize: 9, lineHeight: 1.55 },

  // Day-by-day table
  dayRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5, paddingHorizontal: 4 },
  dayCell:{ fontSize: 8.5 },

  // Session schedule table
  scheduleWeekHeader: {
    backgroundColor: C.navy,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
    borderRadius: 3,
  },
  scheduleWeekLabel: { color: C.white, fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  scheduleRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  scheduleRowAlt: { backgroundColor: C.offWhite },
  scheduleColSession: { width: 44, fontSize: 7.5, color: C.textLight },
  scheduleColPhase:   { width: 82, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  scheduleColTopic:   { flex: 1 },
  scheduleColTopicName: { fontSize: 7.5, color: C.textMid },
  scheduleColTopicBlurb: { fontSize: 6.5, color: C.textLight, fontFamily: 'Helvetica-Oblique', marginTop: 2, lineHeight: 1.4 },
  scheduleColHomework:{ flex: 1.3, fontSize: 7, color: C.textMid, paddingLeft: 6 },
  // Program phase header (full-width, navy)
  phaseHeader: {
    backgroundColor: C.navy,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 12,
    marginBottom: 0,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseHeaderLabel: { color: C.white, fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  phaseHeaderSub:   { color: '#7FB3D8', fontSize: 7.5 },

  // End-of-phase full-length test callout
  phaseEndBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1.5,
    borderColor: C.orange,
    borderRadius: 4,
    padding: 10,
    marginTop: 8,
    marginBottom: 2,
  },
  phaseEndBannerFinal: {
    backgroundColor: '#FDEDEC',
    borderColor: '#C0392B',
  },
  phaseEndLabel:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, letterSpacing: 0.5, marginBottom: 4 },
  phaseEndLabelFinal: { color: '#C0392B' },
  phaseEndTitle:   { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 4 },
  phaseEndBody:    { fontSize: 8, color: C.textMid, lineHeight: 1.5 },

  // Footer
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.textLight },
});

function Footer({ studentName }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>StudyCore · {studentName}'s SAT Study Plan</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// Maps a session object from buildWeeklyPlan to a short phase label and color
function phaseInfo(sess) {
  if (sess.phase === 'Pacing')          return { label: 'Pacing & Strategy',       color: C.navy };
  if (sess.gate  === 'WAE')             return { label: 'Wrong Answer Elimination', color: C.blue };
  if (sess.phase === 'Phase 1' && sess.needsSpeedFocus)
                                        return { label: 'Learn It ⚡ Speed',        color: C.blue };
  if (sess.phase === 'Phase 1')         return { label: 'Learn It',                 color: C.blue };
  if (sess.phase === 'Phase 2')         return { label: 'Speed Review',             color: C.orange };
  if (sess.phase === 'Phase 3')         return { label: 'Error Analysis',           color: C.green };
  if (sess.phase === 'Spaced Review')   return { label: 'Spaced Review',            color: C.green };
  if (sess.phase === 'Mixed Practice')  return { label: 'Mixed Practice',           color: C.orange };
  if (sess.phase === 'Timed Practice')  return { label: 'Timed Section',            color: C.navy };
  if (sess.phase === 'Phase 5')         return { label: 'Weak Point Elimination',   color: '#C0392B' };
  if (sess.isFinalPracticeTest)         return { label: 'Final Practice Test',      color: '#C0392B' };
  if (sess.phase === 'Phase 4')         return { label: 'Practice Test Review',     color: C.navy };
  return { label: sess.phase, color: C.textMid };
}

function StudentDocument({ data }) {
  const {
    studentName, baselineScore, rwScore, mathScore, targetScore,
    targetTestDate, currentTutor, sessionFrequency,
    topicSequence, programSummary, weeklyPlan,
  } = data;

  const contentTopics = topicSequence.filter(t => !t.isPacing && !t.isWAE);
  const hasPacing = programSummary.needsPacing;
  const firstName = studentName?.split(' ')[0] || studentName;

  // Group topics by section
  const rwTopics   = contentTopics.filter(t => t.section === 'R&W');
  const mathTopics = contentTopics.filter(t => t.section === 'Math');

  const freqLabel = sessionFrequency === '3x' ? '3 sessions per week' : sessionFrequency === '2x' ? '2 sessions per week' : '1 session per week';

  // Build flat render list with phase-start, week, end-of-phase, and session markers
  const renderItems = [];
  if (weeklyPlan && weeklyPlan.length > 0) {
    let curProgramPhase = null;
    let curWeek = null;
    // Pre-count topics per program phase for header subtitle
    const phaseTopicCounts = {};
    for (const sess of weeklyPlan) {
      const pp = sess.programPhase || 1;
      if (sess.phase === 'Phase 1' && sess.gate !== 'WAE') {
        phaseTopicCounts[pp] = (phaseTopicCounts[pp] || 0) + 1;
      }
    }
    let sessionRowIdx = 0;
    for (const sess of weeklyPlan) {
      const pp = sess.programPhase || 1;
      // Program phase start header (before phase-end sessions too — phase N ends with its own Phase 4)
      if (pp !== curProgramPhase) {
        curProgramPhase = pp;
        curWeek = null; // reset week so week header re-emits
        const topicCount = phaseTopicCounts[pp] || 0;
        const phaseWeeks = programSummary.phaseWeeks;
        const weekLabel = phaseWeeks
          ? { 1: `${phaseWeeks.p1} wk`, 2: `${phaseWeeks.p2} wk`, 3: `${phaseWeeks.p3} wk`, 4: `${phaseWeeks.p4} wk` }[pp] || ''
          : '';
        renderItems.push({ type: 'phaseStart', phaseNum: pp, topicCount, weekLabel });
      }
      // Week header
      if (sess.week !== curWeek) {
        curWeek = sess.week;
        renderItems.push({ type: 'week', week: curWeek });
      }
      // End-of-phase banner (replaces old checkpointBanner, shown before Phase 4 row)
      if (sess.isCheckpoint) {
        renderItems.push({ type: 'phaseEnd', sess });
      }
      renderItems.push({ type: 'session', sess, rowIdx: sessionRowIdx++ });
    }
  }

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerEyebrow}>S T U D Y C O R E  ·  Y O U R  S A T  S T U D Y  P L A N</Text>
          <Text style={s.headerName}>{studentName}</Text>
          <Text style={s.headerSub}>
            Current score: {baselineScore} · Goal: {targetScore} · {targetTestDate ? `Test date: ${targetTestDate}` : 'Test date: TBD'}
            {currentTutor ? ` · Tutor: ${currentTutor}` : ''}
          </Text>
        </View>

        {/* Score cards */}
        <View style={s.scoreRow}>
          {[
            { label: 'YOUR SCORE NOW', value: baselineScore, sub: 'SAT diagnostic', bg: C.navy, lC: '#7FB3D8', vC: C.white, sC: '#B8CDE0' },
            { label: 'R&W SCORE',      value: rwScore || '—', sub: 'Reading & Writing', bg: C.blue, lC: '#B8D6F5', vC: C.white, sC: '#B8D6F5' },
            { label: 'MATH SCORE',     value: mathScore || '—', sub: 'Mathematics', bg: C.orange, lC: '#F5D5A8', vC: C.white, sC: '#F5D5A8' },
            { label: 'YOUR GOAL',      value: targetScore, sub: `+${programSummary.targetGain} points`, bg: C.green, lC: '#C8F0D8', vC: C.white, sC: '#C8F0D8' },
          ].map((c, i) => (
            <View key={i} style={[s.scoreCard, { backgroundColor: c.bg }]}>
              <Text style={[s.scoreLabel, { color: c.lC }]}>{c.label}</Text>
              <Text style={[s.scoreValue, { color: c.vC }]}>{c.value}</Text>
              <Text style={[s.scoreSub,  { color: c.sC }]}>{c.sub}</Text>
            </View>
          ))}
        </View>

        {/* At a glance */}
        <View style={[s.callout, { backgroundColor: C.lightBlue, borderLeftColor: C.blue }]}>
          <Text style={[s.calloutLabel, { color: C.blue }]}>YOUR PROGRAM AT A GLANCE</Text>
          <Text style={s.calloutBody}>
            {programSummary.topicsToTeach} topics · {programSummary.totalSessionsNeeded} total sessions · {programSummary.weeksNeeded} weeks · {freqLabel}
            {hasPacing ? `\n\nNote: Because you left ${programSummary.blanks} questions blank on the diagnostic, your first session will focus on timing and test strategy before we start any topics.` : ''}
          </Text>
        </View>

        {/* Topics */}
        <Text style={s.sectionHeading}>What We're Working On</Text>
        <Text style={[s.body, { marginBottom: 6 }]}>
          These topics were chosen because they're where you're losing the most points right now. We work through them in this order — don't skip ahead.
        </Text>

        {rwTopics.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>Reading & Writing</Text>
            <View style={s.pillRow}>
              {rwTopics.map((t, i) => (
                <View key={i} style={s.pill}>
                  <Text style={s.pillText}>{t.rank}. {t.topic}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {mathTopics.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>Math</Text>
            <View style={s.pillRow}>
              {mathTopics.map((t, i) => (
                <View key={i} style={s.pill}>
                  <Text style={s.pillText}>{t.rank}. {t.topic}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* How it works */}
        <Text style={s.sectionHeading}>How Each Topic Works</Text>
        <View style={s.stepRow}>
          <View style={[s.stepCard, { backgroundColor: C.lightBlue }]}>
            <Text style={[s.stepNum, { color: C.blue }]}>1</Text>
            <Text style={[s.stepTitle, { color: C.blue }]}>Learn It</Text>
            <Text style={[s.stepBody, { color: C.textMid }]}>Your tutor teaches the topic from scratch — or from where you're struggling. You do practice questions together until you can answer 9 out of 10 correctly without a timer. That's the first checkpoint.</Text>
          </View>
          <View style={[s.stepCard, { backgroundColor: C.lightOrange }]}>
            <Text style={[s.stepNum, { color: C.orange }]}>2</Text>
            <Text style={[s.stepTitle, { color: C.orange }]}>Build Speed</Text>
            <Text style={[s.stepBody, { color: C.textMid }]}>Practice the same topic timed — mostly as homework. The bar is 90% correct on two timed sets in a row. Conventions topics (grammar/punctuation) require 95%. Speed matters because the real SAT has a clock.</Text>
          </View>
          <View style={[s.stepCard, { backgroundColor: C.lightGreen }]}>
            <Text style={[s.stepNum, { color: C.green }]}>3</Text>
            <Text style={[s.stepTitle, { color: C.green }]}>Prove It Sticks</Text>
            <Text style={[s.stepBody, { color: C.textMid }]}>21 days after you finish a topic, your tutor runs a quick re-check. You need 85%+ to confirm the topic actually stuck. If it didn't, it goes back into your practice rotation. This is the check that shows up on test day.</Text>
          </View>
        </View>
      </Page>

      <Page size="LETTER" style={s.page}>
        <Footer studentName={studentName} />

        {/* Homework */}
        <Text style={s.sectionHeading}>What to Do Each Day</Text>
        <Text style={[s.body, { marginBottom: 8 }]}>
          30–40 minutes every non-session day. Not optional — the homework is where the topic actually gets locked in.
        </Text>

        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row' }}>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: '25%' }}>Day</Text>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: '75%' }}>What to do</Text>
          </View>
          {[
            ['Day after session', 'Practice the topic just taught — 10–15 questions from the Question Bank, untimed.'],
            ['Day 2', 'Same topic again, but timed this time. Set a timer and go.'],
            ['Day 3', 'Spaced review — go back to a topic from 7 days ago and do 5–8 questions.'],
            ['Day 4', 'Spaced review — go back to a topic from 3 weeks ago and do 5–8 questions.'],
            ['Day 5 (if applicable)', 'One full timed module. Count how many you finish and note how much time you had left.'],
          ].map(([day, task], i) => (
            <View key={i} style={[s.dayRow, i % 2 === 1 && { backgroundColor: C.offWhite }]}>
              <Text style={[s.dayCell, { width: '25%', fontFamily: 'Helvetica-Bold', color: C.navy }]}>{day}</Text>
              <Text style={[s.dayCell, { width: '75%', color: C.textMid }]}>{task}</Text>
            </View>
          ))}
        </View>

        {/* Checkpoints explained */}
        <Text style={s.sectionHeading}>The Three Checkpoints</Text>
        <Text style={[s.body, { marginBottom: 8 }]}>
          Every topic has three checkpoints before it counts as truly learned. Your tutor tracks these in your Mastery Tracker.
        </Text>

        {[
          {
            num: '1',
            title: 'Checkpoint 1 — Learned',
            desc: '9 out of 10 correct, no timer. Happens at the end of your first session on a topic. If you miss this, you repeat the session — not a big deal.',
            color: C.blue, bg: C.lightBlue,
          },
          {
            num: '2',
            title: 'Checkpoint 2 — Fast Enough',
            desc: '90% correct on two back-to-back timed sets (95% for grammar topics). Mostly done through homework. Your tutor checks your results at the start of the next session.',
            color: C.orange, bg: C.lightOrange,
          },
          {
            num: '3',
            title: 'Checkpoint 3 — Still There (21 Days Later)',
            desc: "A short re-check 21 days after you finish the topic. 85%+ means it stuck. This is the one that matters most — it's the proof that what you learned will still be there on test day.",
            color: C.green, bg: C.lightGreen,
          },
        ].map((cp, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 7, borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: 'hidden' }} wrap={false}>
            <View style={{ backgroundColor: cp.color, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', minWidth: 36 }}>
              <Text style={{ color: C.white, fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{cp.num}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: cp.bg, padding: 9 }}>
              <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.textDark, marginBottom: 3 }}>{cp.title}</Text>
              <Text style={{ fontSize: 8, color: C.textMid, lineHeight: 1.45 }}>{cp.desc}</Text>
            </View>
          </View>
        ))}

        {/* What success looks like */}
        <View style={[s.callout, { backgroundColor: C.navy, borderLeftColor: C.navy, marginTop: 6 }]}>
          <Text style={[s.calloutLabel, { color: '#7FB3D8' }]}>WHAT SUCCESS LOOKS LIKE</Text>
          <Text style={[s.calloutBody, { color: C.white, fontFamily: 'Helvetica-Bold' }]}>
            {firstName} hits {targetScore} on test day by converting diagnostic misses into reliable correct answers — not by trying harder, but by closing specific, identified gaps in the right order.
            {programSummary.feasibility === 'reachable'
              ? ' The data says this target is fully achievable. Follow the program.'
              : programSummary.feasibility === 'tight'
              ? ' This target is achievable but requires consistent work every week. No sessions or homework days can be skipped.'
              : ' This is an ambitious target. Plan for at least two test sittings and stay consistent throughout.'}
          </Text>
        </View>
      </Page>

      {/* Session Schedule Page */}
      {renderItems.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <Footer studentName={studentName} />

          <View style={s.header}>
            <Text style={s.headerEyebrow}>S T U D Y C O R E  ·  S E S S I O N  S C H E D U L E</Text>
            <Text style={s.headerName}>{firstName}'s Session-by-Session Plan</Text>
            <Text style={s.headerSub}>
              {programSummary.totalSessionsNeeded} sessions
              {programSummary.weeksUntilTest
                ? ` over ${programSummary.weeksUntilTest} weeks until test date`
                : ` · ${programSummary.weeksNeeded} weeks`}
              {' · '}{freqLabel}
              {programSummary.isConstrained ? ' (plan fit to test date)' : ''}
            </Text>
          </View>

          {/* Column headers */}
          <View style={{ flexDirection: 'row', backgroundColor: C.blue, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 3, marginBottom: 4 }}>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: 44 }}>Session</Text>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: 82 }}>Focus</Text>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', flex: 1 }}>Topic</Text>
            <Text style={{ color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', flex: 1.3, paddingLeft: 6 }}>Before-Session Homework</Text>
          </View>

          {renderItems.map((item, idx) => {
            if (item.type === 'phaseStart') {
              const phaseNames = { 1: 'Build', 2: 'Refine', 3: 'Consolidate', 4: 'Finalise' };
              const phaseName = phaseNames[item.phaseNum] || 'Extend';
              const topicLabel = item.topicCount > 0 ? ` · ${item.topicCount} topic${item.topicCount > 1 ? 's' : ''}` : '';
              const weekPart   = item.weekLabel ? `  (${item.weekLabel})` : '';
              const subtitles  = {
                1: 'Learn each topic · 9/10 untimed gate · speed drill',
                2: 'New topics + spaced reviews of Phase 1 · close gaps flagged in Practice Test 1',
                3: 'Remaining topics + high-difficulty mixed sets · lock in retention',
                4: 'Weak point elimination · timed section practice · final benchmark test',
              };
              return (
                <View key={idx} style={s.phaseHeader}>
                  <View>
                    <Text style={s.phaseHeaderLabel}>PHASE {item.phaseNum} — {phaseName.toUpperCase()}{topicLabel}{weekPart}</Text>
                    <Text style={[s.phaseHeaderSub, { marginTop: 3 }]}>{subtitles[item.phaseNum] || ''}</Text>
                  </View>
                </View>
              );
            }
            if (item.type === 'week') {
              return (
                <View key={idx} style={[s.scheduleWeekHeader, { marginTop: 4 }]}>
                  <Text style={s.scheduleWeekLabel}>WEEK {item.week}</Text>
                </View>
              );
            }
            if (item.type === 'phaseEnd') {
              const sess = item.sess;
              const isFinal = sess.isFinalPracticeTest;
              return (
                <View key={idx} style={[s.phaseEndBanner, isFinal && s.phaseEndBannerFinal]} wrap={false}>
                  <Text style={[s.phaseEndLabel, isFinal && s.phaseEndLabelFinal]}>
                    {isFinal ? '★  FINAL PRACTICE TEST — BEFORE SESSION ' + sess.session : '▶  END OF PHASE ' + (sess.programPhase || '') + ' — FULL-LENGTH PRACTICE TEST REQUIRED'}
                  </Text>
                  <Text style={s.phaseEndTitle}>
                    {isFinal
                      ? 'This is your last full-length benchmark before the real SAT.'
                      : `Before Session ${sess.session}: sit a complete, timed SAT practice test on your own.`}
                  </Text>
                  <Text style={s.phaseEndBody}>
                    {isFinal
                      ? 'Sit a complete SAT under real test conditions — no interruptions, full timing. Bring your score report to Session ' + sess.session + '. Your tutor will compare it against your baseline, scope the final 2-week push, and rank any remaining weak points by impact.'
                      : 'Use Khan Academy, College Board, or your test-prep platform. No pausing, no notes, full timing. Bring your score report to Session ' + sess.session + ' so your tutor can map every error to a taught topic, log your conversion rate, and decide whether any topics need re-teaching before the next phase begins.'}
                  </Text>
                </View>
              );
            }
            // session row
            const { sess, rowIdx } = item;
            const pi = phaseInfo(sess);
            return (
              <View key={idx} style={[s.scheduleRow, rowIdx % 2 === 1 && s.scheduleRowAlt]}>
                <Text style={s.scheduleColSession}>Session {sess.session}</Text>
                <Text style={[s.scheduleColPhase, { color: pi.color }]}>{pi.label}</Text>
                <View style={s.scheduleColTopic}>
                  <Text style={s.scheduleColTopicName}>{sess.topic}</Text>
                  {sess.sessionBlurb ? (
                    <Text style={s.scheduleColTopicBlurb}>{sess.sessionBlurb}</Text>
                  ) : null}
                </View>
                <Text style={s.scheduleColHomework}>{sess.homework || ''}</Text>
              </View>
            );
          })}
        </Page>
      )}
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
    topicSequence:    routingResult.topicSequence,
    programSummary:   routingResult.programSummary,
    weeklyPlan:       routingResult.weeklyPlan || [],
  };
}

export async function buildStudentPlanPdf(studentData, routingResult) {
  const data = buildDocumentData(studentData, routingResult);
  return await renderToBuffer(<StudentDocument data={data} />);
}
