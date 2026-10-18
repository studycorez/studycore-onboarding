import { PLATFORM_TOPICS, CURRICULUM_TOPICS, lookupDeliveryCost } from './topic-data.js';

// Points per correct question gained (from sheets)
const POINTS_PER_CORRECT = 10;
// Sessions per curriculum topic (Phase 1 + Phase 2)
const SESSIONS_PER_TOPIC = 2;
// Shared-phase overhead (Phases 3-5: mixed sets, test sims, etc.)
const SHARED_PHASE_OVERHEAD = 0.43;
// Conversion rate: share of misses in taught topics the student actually converts
const CONVERSION_RATE = 0.5;
// R&W topics taught before inserting Wrong Answer Elimination session
const WAE_AFTER_RW_TOPICS = 5;
// Average seconds per SAT question above which a topic is flagged as speed-limited
// (SAT averages ~70s/question; >85s = student is losing time on this topic)
const SLOW_THRESHOLD_SECS = 85;

/**
 * computeProgram
 *
 * @param {Array} diagnosticEntries  — [{ platformName, qs, mastery }]
 *   qs: number of questions on the diagnostic for this topic
 *   mastery: mastery % (0-100)
 * @param {Object} studentInfo       — { baselineScore, targetScore, sessionFrequency, blanks,
 *                                       targetTestDate, programStartDate }
 *   sessionFrequency: '1x' | '2x' | '3x'
 *   blanks: number of questions left blank on diagnostic
 *   targetTestDate: 'YYYY-MM-DD' — when provided, constrains the plan to available sessions
 *   programStartDate: 'YYYY-MM-DD' — defaults to today if not set
 *
 * @returns {Object} { topicSequence, programSummary, weeklyPlan }
 */
export function computeProgram(diagnosticEntries, studentInfo) {
  const { baselineScore, targetScore, sessionFrequency = '2x', blanks = 0,
          targetTestDate, programStartDate, weeklySchedule, weeksOverride } = studentInfo;
  const targetGain = targetScore - baselineScore;

  // ── Compute weeks/sessions until test date ───────────────────────────────
  const sessionsPerWeek = sessionFrequency === '3x' ? 3 : sessionFrequency === '2x' ? 2 : 1;
  let weeksUntilTest = null;
  let availableSessions = null;
  // Manual override takes precedence over date-based calculation
  if (weeksOverride && parseInt(weeksOverride) > 0) {
    weeksUntilTest = parseInt(weeksOverride);
    availableSessions = weeksUntilTest * sessionsPerWeek;
  } else if (targetTestDate) {
    const start = programStartDate
      ? new Date(programStartDate + 'T00:00:00')
      : new Date();
    const test = new Date(targetTestDate + 'T00:00:00');
    weeksUntilTest = Math.max(0, Math.round((test - start) / (7 * 24 * 60 * 60 * 1000)));
    availableSessions = weeksUntilTest * sessionsPerWeek;
  }

  // ── Custom weekly schedule overrides session/slot count ───────────────────
  // Each session contributes floor(sessions × hoursPerSession) lesson slots per week.
  // A 1h session = 1 slot, 1.5h = 1 slot (single session), 2h = 2 slots.
  // Two 1.5h sessions = floor(3.0) = 3 slots (bonus over two 1h sessions).
  let totalScheduledSlots = null;
  let totalScheduledHours = null;
  if (weeklySchedule && weeklySchedule.length > 0) {
    totalScheduledSlots = weeklySchedule.reduce((sum, w) => sum + w.sessions, 0); // appointments = plan entries
    totalScheduledHours = weeklySchedule.reduce((sum, w) => sum + w.sessions * w.hoursPerSession, 0);
    if (weeksUntilTest === null) weeksUntilTest = weeklySchedule.length;
    availableSessions = totalScheduledSlots; // 1 appointment = 1 session in the plan
  }

  // ── Step 1: Aggregate misses and mastery by curriculum topic ─────────────
  const missMap = {};     // curriculumTopic → total misses
  const masteryMap = {};  // curriculumTopic → { totalQs, totalCorrect }
  const timeMap = {};     // curriculumTopic → { totalWeightedSecs, totalQs } for weighted avg
  for (const entry of diagnosticEntries) {
    if (!entry.qs || entry.qs === 0) continue;
    const platform = PLATFORM_TOPICS.find(p => p.platformName === entry.platformName);
    if (!platform) continue;
    const correct = entry.qs * ((entry.mastery || 0) / 100);
    const misses  = entry.qs - correct;
    missMap[platform.curriculumTopic] = (missMap[platform.curriculumTopic] || 0) + misses;
    if (!masteryMap[platform.curriculumTopic]) masteryMap[platform.curriculumTopic] = { totalQs: 0, totalCorrect: 0 };
    masteryMap[platform.curriculumTopic].totalQs      += entry.qs;
    masteryMap[platform.curriculumTopic].totalCorrect += correct;
    // Track average time per question (weighted by question count)
    if (entry.avgTimeSecs != null && entry.avgTimeSecs > 0) {
      if (!timeMap[platform.curriculumTopic]) timeMap[platform.curriculumTopic] = { totalWeightedSecs: 0, totalQs: 0 };
      timeMap[platform.curriculumTopic].totalWeightedSecs += entry.avgTimeSecs * entry.qs;
      timeMap[platform.curriculumTopic].totalQs           += entry.qs;
    }
  }

  function getAvgTimeSecs(curriculumTopicName) {
    const t = timeMap[curriculumTopicName];
    if (!t || t.totalQs === 0) return null;
    return Math.round(t.totalWeightedSecs / t.totalQs);
  }

  function getStartTier(curriculumTopicName) {
    const m = masteryMap[curriculumTopicName];
    if (!m || m.totalQs === 0) return 'Foundational';
    const pct = m.totalCorrect / m.totalQs * 100;
    if (pct >= 90) return 'Optimization';
    if (pct >= 55) return 'Developing';
    return 'Foundational';
  }

  // ── Step 2: Cross-reference with curriculum topic data ────────────────────
  const scorableCurriculumTopics = CURRICULUM_TOPICS.filter(t => t.tier > 0); // exclude pacing/WAE
  const topicsWithMisses = scorableCurriculumTopics.map(ct => ({
    ...ct,
    misses: +(missMap[ct.topic] || 0).toFixed(2),
  }));

  // ── Step 3: Sort within each section by misses desc, break ties by tier ──
  topicsWithMisses.sort((a, b) => {
    if (b.misses !== a.misses) return b.misses - a.misses;
    return a.tier - b.tier;
  });

  // Split into per-section ranked lists for balanced selection
  const rwRanked   = topicsWithMisses.filter(t => t.section === 'R&W' && t.misses > 0);
  const mathRanked = topicsWithMisses.filter(t => t.section === 'Math' && t.misses > 0);
  const rwTotalMisses   = rwRanked.reduce((s, t) => s + t.misses, 0);
  const mathTotalMisses = mathRanked.reduce((s, t) => s + t.misses, 0);
  const sectionTotal    = rwTotalMisses + mathTotalMisses;

  // ── Step 4: How many points do we need to gain? ───────────────────────────
  const correctAnswersNeeded = Math.ceil(targetGain / POINTS_PER_CORRECT);
  // Account for blank questions (pacing issue, only partly fixable through content teaching)
  const missesFromBlanks = blanks * 0.5;
  const missesToConvert = correctAnswersNeeded - missesFromBlanks;

  // ── Step 5: Proportional interleaved selection across R&W and Math ────────
  // Always picks the highest-miss topic from whichever section is currently
  // underrepresented relative to its share of total misses. This prevents a
  // Math-heavy diagnostic from producing an all-Math gameplan.
  //
  // Minimum topics floor: prevents a single-topic plan when one topic happens
  // to have enough raw misses to satisfy the gain math. A +130pt student still
  // needs ~9 topics even if one topic had 30 misses — the diagnostic miss count
  // from limited practice doesn't reflect all the real gaps.
  const minTopics = Math.min(20, Math.max(3, Math.ceil(targetGain / 15)));

  let cumulativeMisses = 0;
  const selectedTopics = [];
  let rwIdx = 0, mathIdx = 0;

  while (selectedTopics.length < 20) {
    const rwDone   = rwIdx   >= rwRanked.length;
    const mathDone = mathIdx >= mathRanked.length;
    if (rwDone && mathDone) break;

    // Compute each section's current share of selected misses
    const selRwMisses   = selectedTopics.filter(t => t.section === 'R&W').reduce((s, t) => s + t.misses, 0);
    const selMathMisses = selectedTopics.filter(t => t.section === 'Math').reduce((s, t) => s + t.misses, 0);
    const selTotal      = selRwMisses + selMathMisses;

    // Pick from the section most behind its target share; fall back if one is exhausted
    let pickRW;
    if (rwDone)   { pickRW = false; }
    else if (mathDone) { pickRW = true; }
    else {
      const rwTargetShare = sectionTotal > 0 ? rwTotalMisses / sectionTotal : 0.5;
      const rwActualShare = selTotal > 0 ? selRwMisses / selTotal : 0;
      pickRW = rwActualShare <= rwTargetShare;
    }

    const topic = pickRW ? rwRanked[rwIdx++] : mathRanked[mathIdx++];
    selectedTopics.push(topic);
    cumulativeMisses += topic.misses;
    // Only break early on miss coverage if we've already hit the minimum topic count
    if (cumulativeMisses * CONVERSION_RATE >= missesToConvert && selectedTopics.length >= minTopics) break;
  }

  // Feasibility assessment
  const totalDiagnosticMisses = Object.values(missMap).reduce((s, v) => s + v, 0);
  const maxConvertiblePoints = totalDiagnosticMisses * CONVERSION_RATE * POINTS_PER_CORRECT + missesFromBlanks * POINTS_PER_CORRECT;
  const feasibility =
    maxConvertiblePoints >= targetGain * 0.95 ? 'reachable' :
    maxConvertiblePoints >= targetGain * 0.70 ? 'tight' : 'unlikely';

  // ── Step 6: Build topic sequence with session numbers ─────────────────────
  const needsPacing = blanks > 5;
  let sessionCounter = 0;
  const topicSequence = [];

  const pacingCt = CURRICULUM_TOPICS.find(t => t.topic === 'Pacing, Triage & Test Execution');
  const waeCt    = CURRICULUM_TOPICS.find(t => t.topic === 'Wrong Answer Elimination');

  if (needsPacing) {
    sessionCounter += 1;
    topicSequence.push({
      rank: 1,
      topic: 'Pacing, Triage & Test Execution',
      section: 'Cross',
      domain: 'Cross-Section',
      tier: 0,
      tierLabel: 'Pacing',
      startTier: null,
      misses: 0,
      ptsPerSession: 0,
      phase1Session: sessionCounter,
      phase2Session: null,
      gate3Week: null,
      notionUrl: pacingCt?.notionPageId ? `https://www.notion.so/${pacingCt.notionPageId}` : null,
      isPacing: true,
    });
  }

  let rwTopicCount = 0;
  let waeInserted = false;

  for (let i = 0; i < selectedTopics.length; i++) {
    const ct = selectedTopics[i];
    sessionCounter += 1;
    const phase1Session = sessionCounter;
    sessionCounter += 1;
    const phase2Session = sessionCounter;

    // Gate 3 check: ~3 weeks after Phase 2 (21 days)
    const gate3Session = phase2Session + Math.ceil(3 * (sessionFrequency === '3x' ? 3 : sessionFrequency === '2x' ? 2 : 1));

    const avgTimeSecs = getAvgTimeSecs(ct.topic);
    const startTier   = getStartTier(ct.topic);
    // Flag topics where student is accurate but too slow — needs speed emphasis from session 1
    const needsSpeedFocus = avgTimeSecs != null
      && avgTimeSecs > SLOW_THRESHOLD_SECS
      && startTier !== 'Foundational'; // foundational topics need content first, not speed

    topicSequence.push({
      rank: topicSequence.length + 1,
      topic: ct.topic,
      section: ct.section,
      domain: ct.domain,
      tier: ct.tier,
      tierLabel: ct.tierLabel,
      startTier,
      misses: ct.misses,
      avgTimeSecs,
      ptsPerSession: ct.ptsPerSession,
      phase1Session,
      phase2Session,
      gate3Session,
      notionUrl: ct.notionPageId ? `https://www.notion.so/${ct.notionPageId}` : null,
      isPacing: false,
      needsSpeedFocus,
    });

    if (ct.section === 'R&W') rwTopicCount++;

    // Insert Wrong Answer Elimination after WAE_AFTER_RW_TOPICS R&W topics
    if (!waeInserted && rwTopicCount >= WAE_AFTER_RW_TOPICS) {
      sessionCounter += 1;
      topicSequence.push({
        rank: topicSequence.length + 1,
        topic: 'Wrong Answer Elimination',
        section: 'R&W',
        domain: 'Cross-Domain Strategy',
        tier: 0,
        tierLabel: 'Cross-Cutting',
        startTier: null,
        misses: 0,
        ptsPerSession: 0,
        phase1Session: sessionCounter,
        phase2Session: null,
        gate3Session: null,
        notionUrl: waeCt?.notionPageId ? `https://www.notion.so/${waeCt.notionPageId}` : null,
        isWAE: true,
      });
      waeInserted = true;
    }
  }

  // ── Step 7: Build explicit week-by-week plan ─────────────────────────────
  const coreSessionsNeeded = sessionCounter;
  const {
    plan: rawWeeklyPlan,
    totalSessions: rawTotalSessions,
    phase1TopicCount, phase2TopicCount, phase3TopicCount,
    phaseWeeks,
  } = buildWeeklyPlan(
    topicSequence, sessionsPerWeek, weeklySchedule,
    { baselineScore, targetGain, planTopicsCount: selectedTopics.length, weeksUntilTest }
  );

  // Constrain plan to available session/slot budget
  const isConstrained = availableSessions !== null && rawWeeklyPlan.length > availableSessions;
  const weeklyPlan = isConstrained ? rawWeeklyPlan.slice(0, availableSessions) : rawWeeklyPlan;
  const totalSessionsNeeded = weeklyPlan.length;

  // Recount topics actually completed in the (possibly-sliced) plan
  let topicsToTeach;
  if (isConstrained) {
    const seenLearnIt = new Set();
    const coveredTopics = new Set();
    for (const s of weeklyPlan) {
      if (s.phase === 'Phase 1' && s.gate !== 'WAE') seenLearnIt.add(s.topic);
      if (s.phase === 'Phase 2') {
        const base = s.topic.replace(' — Speed Review', '');
        if (seenLearnIt.has(base)) coveredTopics.add(base);
      }
    }
    topicsToTeach = coveredTopics.size;
  } else {
    topicsToTeach = phase1TopicCount + phase2TopicCount + phase3TopicCount;
  }
  const weeksNeeded = weeksUntilTest ?? Math.ceil(totalSessionsNeeded / sessionsPerWeek);

  const deliveryCost = lookupDeliveryCost(baselineScore, targetScore);

  // ── Step 8: Program summary ───────────────────────────────────────────────
  const programSummary = {
    topicsToTeach,
    phase1TopicCount, phase2TopicCount, phase3TopicCount,
    phaseWeeks,
    coreSessionsNeeded,
    totalSessionsNeeded,
    sessionsPerWeek,
    weeksNeeded,
    weeksUntilTest,
    availableSessions,
    isConstrained,
    feasibility,
    targetGain,
    correctAnswersNeeded,
    totalDiagnosticMisses: +totalDiagnosticMisses.toFixed(1),
    missesToConvert: +missesToConvert.toFixed(1),
    blanks,
    needsPacing,
    // Custom schedule totals
    totalScheduledHours: totalScheduledHours != null ? +totalScheduledHours.toFixed(1) : null,
    // From delivery cost table
    paidSessions: deliveryCost?.paid || null,
    medianFreeSessions: deliveryCost?.medianFree ?? null,
    p90FreeSessions: deliveryCost?.p90Free ?? null,
    priceFor: deliveryCost?.priceFor || null,
    contractCap: deliveryCost?.cap || null,
    guaranteeStatus: deliveryCost
      ? (deliveryCost.attempts <= 1 && deliveryCost.medianFree === 0 ? 'Yes — guarantee' : 'Conditional')
      : 'Unknown',
  };

  return { topicSequence, programSummary, weeklyPlan };
}

function buildWeeklyPlan(topicSequence, sessionsPerWeek, weeklySchedule, projectionParams) {
  const { baselineScore = null, targetGain = 0, planTopicsCount = 1, weeksUntilTest = null } = projectionParams || {};

  // ─── Phase week allocations (40 / 25 / 20 / 15 split of available weeks) ──
  const hasSchedule = weeksUntilTest != null && weeksUntilTest >= 4;
  let p1W, p2W, p3W, p4W;
  if (hasSchedule) {
    p4W = Math.max(2, Math.round(weeksUntilTest * 0.15));
    const rem = weeksUntilTest - p4W;
    p1W = Math.max(1, Math.round(rem * 0.50));
    p2W = Math.max(1, Math.round(rem * 0.31));
    p3W = Math.max(1, rem - p1W - p2W);
  }

  // Average slots per week (accounts for variable-length sessions from custom schedule)
  const avgSlotsPerWeek = (weeklySchedule && weeklySchedule.length > 0)
    ? weeklySchedule.reduce((s, w) => s + w.sessions, 0) / weeklySchedule.length
    : sessionsPerWeek;

  const p1Slots = hasSchedule ? Math.round(p1W * avgSlotsPerWeek) : null;
  const p2Slots = hasSchedule ? Math.round(p2W * avgSlotsPerWeek) : null;
  const p3Slots = hasSchedule ? Math.round(p3W * avgSlotsPerWeek) : null;
  const p4Slots = hasSchedule ? Math.round(p4W * avgSlotsPerWeek) : null;

  // ─── Separate pacing / WAE / content topics ────────────────────────────────
  const pacingEntry = topicSequence.find(t => t.isPacing);
  const waeEntry    = topicSequence.find(t => t.isWAE);
  const contentOnly = topicSequence.filter(t => !t.isPacing && !t.isWAE);

  // ─── Topic capacity per phase budget ──────────────────────────────────────
  // Each topic needs 2 sessions (Learn It + Speed Review)
  // plus 1 Error Analysis every 3 topics (~0.33/topic)
  // plus 1 Practice Test session reserved at the end of the phase
  function topicsCapacity(slots) {
    if (!slots) return Infinity;
    let avail = Math.max(0, slots - 1); // reserve 1 slot for phase-end practice test
    let n = 0, errBuf = 0;
    while (avail >= 2) {
      avail -= 2; n++; errBuf++;
      if (errBuf >= 3) { avail -= 1; errBuf = 0; }
    }
    return n;
  }

  const waeSlot = waeEntry ? 1 : 0; // WAE uses 1 slot in Phase 1
  const n1 = hasSchedule ? topicsCapacity((p1Slots ?? 0) - waeSlot) : Math.ceil(contentOnly.length / 3);
  const n2 = hasSchedule ? topicsCapacity(p2Slots ?? 0)             : Math.floor((contentOnly.length - n1) / 2);
  const n3 = hasSchedule ? topicsCapacity(p3Slots ?? 0)             : contentOnly.length - n1 - n2;

  const p1Topics = contentOnly.slice(0, n1);
  const p2Topics = contentOnly.slice(n1, n1 + n2);
  const p3Topics = contentOnly.slice(n1 + n2, n1 + n2 + n3);

  // ─── Session builder helpers ───────────────────────────────────────────────
  let contentTopicsCompleted = 0;
  let practiceTestNum = 0;

  function makeContentSessions(topics, phaseNum) {
    const out = [];
    let errBuf = 0;
    for (const t of topics) {
      const speedNote = t.needsSpeedFocus
        ? ` · ⚡ Speed-flagged (avg ${t.avgTimeSecs}s/q) — prioritise pace from session 1` : '';
      const ph1Homework = t.needsSpeedFocus
        ? `10 TIMED questions on ${t.topic} from the Question Bank · target 9/10 correct under time (pace matters here from day 1)`
        : `10 untimed Quiz/Practice questions on ${t.topic} · use the Question Bank`;
      const ph1Blurb = t.needsSpeedFocus
        ? `Tutor introduces the ${t.topic} concept with a think-aloud and models 3–4 examples — but with a clock running from question 1. Tutor tracks your average time per question and coaches your pacing throughout. Session ends with a 10-question timed check.`
        : `Tutor introduces the ${t.topic} concept with a think-aloud, models 3–4 examples, then works through 5–6 guided questions with you. Session ends with a 10-question untimed check (9/10 to pass).`;

      out.push({
        topic: t.topic, phase: 'Phase 1',
        gate: 'Gate 1', gateTarget: `9/10 untimed · Start: ${t.startTier}${speedNote}`,
        section: t.section, startTier: t.startTier, notionUrl: t.notionUrl, isSharedPhase: false,
        homework: ph1Homework, sessionBlurb: ph1Blurb,
        needsSpeedFocus: !!t.needsSpeedFocus, isCheckpoint: false, programPhase: phaseNum,
      });

      const ph2Homework = t.needsSpeedFocus
        ? `3 timed sets on ${t.topic} · target 90%+ in <75 sec/question · assign a 5-question spaced review from the Question Bank in 3 weeks`
        : `2 timed practice sets on ${t.topic} · target 90%+ accuracy · assign a 5-question untimed spaced review from the Question Bank in 3 weeks`;
      const ph2Blurb = t.needsSpeedFocus
        ? `Three back-to-back 10-question timed sets on ${t.topic}. Tutor reviews every miss immediately after each set and reinforces the pace cue. Goal: 90%+ in under 75 sec/question.`
        : `Two back-to-back 10-question timed sets on ${t.topic}. Tutor reviews every miss immediately after each set — focus is accuracy at speed. Goal: 90%+ on both sets.`;

      out.push({
        topic: `${t.topic} — Speed Review`, phase: 'Phase 2',
        gate: 'Gate 2', gateTarget: '90%+ timed ×2 (95% for Conventions)',
        section: t.section, startTier: null, notionUrl: t.notionUrl, isSharedPhase: false,
        homework: ph2Homework, sessionBlurb: ph2Blurb,
        isCheckpoint: false, programPhase: phaseNum,
      });

      contentTopicsCompleted++;
      errBuf++;
      if (errBuf >= 3) {
        const proj = (baselineScore != null && planTopicsCount > 0)
          ? Math.round(baselineScore + (contentTopicsCompleted / planTopicsCount) * targetGain) : null;
        out.push({
          topic: proj != null ? `Error Pattern Analysis · Est. ~${proj}` : 'Error Pattern Analysis',
          phase: 'Phase 3', gate: 'Phase 3',
          gateTarget: 'Tag each error: Conceptual Gap · Rushing/Careless · Reading Misunderstanding · Trap Answer',
          section: 'Mixed', startTier: null, notionUrl: null, isSharedPhase: true,
          homework: 'Before session: label each missed question from the past 3 topics as: Conceptual Gap / Rushing / Reading / Trap Answer · bring your categorised list',
          sessionBlurb: 'Tutor reviews your labelled error list across the last 3 topics, maps your dominant error type, and sets a specific correction focus for the next phase.',
          projectedScore: proj, isCheckpoint: false, programPhase: phaseNum,
        });
        errBuf = 0;
      }
    }
    // Trailing error analysis for any leftover topics within this phase
    if (errBuf > 0 && topics.length > 0) {
      const proj = (baselineScore != null && planTopicsCount > 0)
        ? Math.round(baselineScore + (contentTopicsCompleted / planTopicsCount) * targetGain) : null;
      out.push({
        topic: proj != null ? `Error Pattern Analysis · Est. ~${proj}` : 'Error Pattern Analysis',
        phase: 'Phase 3', gate: 'Phase 3',
        gateTarget: 'Tag each error: Conceptual Gap · Rushing/Careless · Reading Misunderstanding · Trap Answer',
        section: 'Mixed', startTier: null, notionUrl: null, isSharedPhase: true,
        homework: 'Before session: label each missed question from the past 3 topics as: Conceptual Gap / Rushing / Reading / Trap Answer · bring your categorised list',
        sessionBlurb: 'Tutor reviews your labelled error list across the last 3 topics, maps your dominant error type, and sets a specific correction focus for the next phase.',
        projectedScore: proj, isCheckpoint: false, programPhase: phaseNum,
      });
    }
    return out;
  }

  function makePracticeTest(phaseNum, isFinal = false) {
    practiceTestNum++;
    return {
      topic: isFinal ? 'Final Practice Test' : `Practice Test Review #${practiceTestNum}`,
      phase: 'Phase 4', gate: 'Phase 4',
      gateTarget: isFinal
        ? 'FINAL ASSESSMENT — Confirm score trajectory · identify weak points for the last 2-week push'
        : 'Conversion rate logged · Topics re-ranked · error patterns revisited',
      section: 'Full Test', startTier: null, notionUrl: null, isSharedPhase: true,
      homework: isFinal
        ? 'Take a Full-Length Practice Test under real test conditions · bring score report — this is your benchmark before the real SAT'
        : 'Take a Full-Length Practice Test before this session · bring your score report',
      sessionBlurb: isFinal
        ? 'Benchmark review session — score compared against your baseline, final 2-week push is scoped, and remaining weak points are ranked by impact.'
        : 'Full score-report review — tutor maps every error back to a taught topic, logs your conversion rate, and flags any topics needing additional work in the next phase.',
      isCheckpoint: true, isFinalPracticeTest: isFinal, programPhase: phaseNum,
    };
  }

  // ─── Assemble all sessions across 4 program phases ────────────────────────
  const sessions = [];

  // Pacing session (if student left 5+ blanks on diagnostic)
  if (pacingEntry) {
    sessions.push({
      topic: pacingEntry.topic, phase: 'Pacing',
      gate: 'Pre-req', gateTarget: 'Timing strategy + triage system',
      section: 'Cross', startTier: null, notionUrl: pacingEntry.notionUrl, isSharedPhase: false,
      homework: 'Review SAT timing rules · bring your diagnostic to next session',
      sessionBlurb: 'Tutor reviews your diagnostic for timing patterns, introduces the triage system (skip · flag · guess), and you practise calling your moves on a live module.',
      isCheckpoint: false, programPhase: 1,
    });
  }

  // ── Program Phase 1 — Build (40% of weeks) ─────────────────────────────
  for (const s of makeContentSessions(p1Topics, 1)) sessions.push(s);
  // WAE goes at the end of Phase 1 content (after R&W topics have been taught)
  if (waeEntry) {
    sessions.push({
      topic: waeEntry.topic, phase: 'Phase 1',
      gate: 'WAE', gateTarget: 'Distractor recognition · Pattern chart',
      section: 'R&W', startTier: null, notionUrl: waeEntry.notionUrl, isSharedPhase: false,
      homework: 'Complete the Wrong Answer Elimination worksheet from this session',
      sessionBlurb: 'Tutor walks through the 4 wrong-answer trap types and you label 20 real SAT choices together, building your personal Distractor Chart.',
      isCheckpoint: false, programPhase: 1,
    });
  }
  sessions.push(makePracticeTest(1));

  // ── Program Phase 2 — Refine (25% of weeks) ────────────────────────────
  const p2Content = makeContentSessions(p2Topics, 2);
  for (const s of p2Content) sessions.push(s);
  // Fill leftover Phase 2 budget with spaced reviews of Phase 1 topics
  if (p2Slots !== null) {
    const p2Used = p2Content.length + 1; // +1 for practice test
    const p2Fill = Math.max(0, p2Slots - p2Used);
    for (let i = 0; i < Math.min(p2Fill, p1Topics.length); i++) {
      const t = p1Topics[i];
      sessions.push({
        topic: `Spaced Review — ${t.topic}`, phase: 'Spaced Review',
        gate: 'Retention', gateTarget: '85%+ on 8–10 questions · confirm 21-day retention',
        section: t.section, startTier: null, notionUrl: t.notionUrl, isSharedPhase: false,
        homework: `8–10 spaced practice questions on ${t.topic} before this session — no notes`,
        sessionBlurb: `Quick retention check: student attempts 8–10 questions on ${t.topic} independently. Tutor reviews every miss and confirms the concept is locked before the next phase.`,
        isCheckpoint: false, programPhase: 2,
      });
    }
  }
  sessions.push(makePracticeTest(2));

  // ── Program Phase 3 — Consolidate (20% of weeks) ───────────────────────
  const p3Content = makeContentSessions(p3Topics, 3);
  for (const s of p3Content) sessions.push(s);
  // Fill leftover Phase 3 budget with high-difficulty mixed practice sets
  if (p3Slots !== null) {
    const p3Used = p3Content.length + 1;
    const p3Fill = Math.max(0, p3Slots - p3Used);
    for (let i = 0; i < p3Fill; i++) {
      sessions.push({
        topic: 'High-Difficulty Mixed Practice', phase: 'Mixed Practice',
        gate: 'Mixed', gateTarget: '80%+ across all taught topics at hard difficulty',
        section: 'Mixed', startTier: null, notionUrl: null, isSharedPhase: true,
        homework: 'Complete a 22-question mixed practice set from the Question Bank before this session',
        sessionBlurb: 'Tutor pulls a hard mixed set spanning all taught topics. Student works through it independently, then reviews every miss together — focus on which error patterns are still appearing.',
        isCheckpoint: false, programPhase: 3,
      });
    }
  }
  sessions.push(makePracticeTest(3));

  // ── Program Phase 4 — Finalise (15% of weeks, min 2 weeks) ────────────
  // Fixed template: Weak Point session → Timed R&W → Timed Math → Final Test
  // Any extra Phase 4 budget adds Final Retention Sweep sessions before the template
  const p4FixedCount = 4; // 3 template + 1 final practice test
  const p4Extra = p4Slots !== null ? Math.max(0, p4Slots - p4FixedCount) : 0;
  for (let i = 0; i < p4Extra; i++) {
    sessions.push({
      topic: 'Final Retention Sweep', phase: 'Spaced Review',
      gate: 'Retention', gateTarget: '90%+ across all taught topics',
      section: 'Mixed', startTier: null, notionUrl: null, isSharedPhase: true,
      homework: '5 spaced review questions each on your 3 weakest topics from the full program',
      sessionBlurb: 'Retention sweep across all taught topics. Student works a mixed set; tutor confirms which topics are locked and which need the final focused session.',
      isCheckpoint: false, programPhase: 4,
    });
  }
  sessions.push({
    topic: 'Weak Point Elimination', phase: 'Phase 5',
    gate: 'Phase 5', gateTarget: 'Target the #1 error pattern from Phase 3 test · reach 85%+',
    section: 'Varies', startTier: null, notionUrl: null, isSharedPhase: true,
    homework: 'Review your Phase 3 practice test — identify the topic with the most misses and bring 5 example questions',
    sessionBlurb: 'Tutor focuses entirely on the biggest remaining gap from the Phase 3 test. Brings 15–20 targeted questions. Session ends when the pattern is broken or time runs out.',
    isCheckpoint: false, programPhase: 4,
  });
  sessions.push({
    topic: 'Timed Section Practice — Reading & Writing', phase: 'Timed Practice',
    gate: 'Timed', gateTarget: 'Full 54-question R&W section under time · log pace and accuracy by question type',
    section: 'R&W', startTier: null, notionUrl: null, isSharedPhase: true,
    homework: 'Review your last R&W score report — note which question types took the most time',
    sessionBlurb: 'Student completes a full 54-question R&W section under real time conditions. Tutor reviews every miss with a focus on pace management and which question types are still costing time.',
    isCheckpoint: false, programPhase: 4,
  });
  sessions.push({
    topic: 'Timed Section Practice — Math', phase: 'Timed Practice',
    gate: 'Timed', gateTarget: 'Full 44-question Math section under time · log pace and accuracy by topic',
    section: 'Math', startTier: null, notionUrl: null, isSharedPhase: true,
    homework: 'Review your last Math score report — note which topics cost the most time',
    sessionBlurb: 'Student completes a full 44-question Math section under real time conditions. Tutor reviews every miss focusing on which taught topics still have accuracy or speed gaps.',
    isCheckpoint: false, programPhase: 4,
  });
  sessions.push(makePracticeTest(4, true)); // FINAL practice test (Phase 4 ends)

  // ─── Number sessions and assign to weeks ──────────────────────────────────
  let slotToWeek = null;
  if (weeklySchedule && weeklySchedule.length > 0) {
    slotToWeek = [];
    for (const wk of weeklySchedule) {
      for (let s = 0; s < wk.sessions; s++) slotToWeek.push(wk.week);
    }
  }

  const plan = [];
  let week = 1, sessionInWeek = 0, lastMappedWeek = 1;
  for (let i = 0; i < sessions.length; i++) {
    let assignedWeek;
    if (slotToWeek) {
      assignedWeek = i < slotToWeek.length ? slotToWeek[i] : lastMappedWeek;
      lastMappedWeek = assignedWeek;
    } else {
      sessionInWeek++;
      if (sessionInWeek > sessionsPerWeek) { week++; sessionInWeek = 1; }
      assignedWeek = week;
    }
    plan.push({ ...sessions[i], week: assignedWeek, session: i + 1 });
  }

  return {
    plan,
    totalSessions: sessions.length,
    phase1TopicCount: p1Topics.length,
    phase2TopicCount: p2Topics.length,
    phase3TopicCount: p3Topics.length,
    phaseWeeks: hasSchedule ? { p1: p1W, p2: p2W, p3: p3W, p4: p4W } : null,
  };
}

/**
 * computeGroupPlan
 * For students on group/office-hours sessions — self-paced through the StudyCore platform course content.
 * Produces a week-by-week assignment schedule (which topics to complete + when) instead of a
 * tutor session plan.
 */
export function computeGroupPlan(diagnosticEntries, studentInfo) {
  const { baselineScore, targetScore, targetTestDate, programStartDate } = studentInfo;
  const targetGain = targetScore - baselineScore;

  // ── Weeks until test ────────────────────────────────────────────────────
  let weeksUntilTest = null;
  if (targetTestDate) {
    const start = programStartDate ? new Date(programStartDate + 'T00:00:00') : new Date();
    const test  = new Date(targetTestDate + 'T00:00:00');
    weeksUntilTest = Math.max(1, Math.round((test - start) / (7 * 24 * 60 * 60 * 1000)));
  }

  // ── Aggregate misses by curriculum topic (same as computeProgram) ───────
  const missMap = {};
  for (const entry of diagnosticEntries) {
    if (!entry.qs || entry.qs === 0) continue;
    const platform = PLATFORM_TOPICS.find(p => p.platformName === entry.platformName);
    if (!platform) continue;
    const misses = entry.qs * (1 - (entry.mastery || 0) / 100);
    missMap[platform.curriculumTopic] = (missMap[platform.curriculumTopic] || 0) + misses;
  }

  const scorableTopics = CURRICULUM_TOPICS.filter(t => t.tier > 0);
  const topicsWithMisses = scorableTopics.map(ct => ({
    ...ct, misses: +(missMap[ct.topic] || 0).toFixed(2),
  })).sort((a, b) => b.misses !== a.misses ? b.misses - a.misses : a.tier - b.tier);

  const rwRanked   = topicsWithMisses.filter(t => t.section === 'R&W' && t.misses > 0);
  const mathRanked = topicsWithMisses.filter(t => t.section === 'Math' && t.misses > 0);
  const rwTotal    = rwRanked.reduce((s, t) => s + t.misses, 0);
  const mathTotal  = mathRanked.reduce((s, t) => s + t.misses, 0);
  const secTotal   = rwTotal + mathTotal;

  const correctAnswersNeeded = Math.ceil(targetGain / POINTS_PER_CORRECT);
  const missesToConvert      = correctAnswersNeeded;
  const totalDiagnosticMisses = Object.values(missMap).reduce((s, v) => s + v, 0);
  const maxConvertiblePoints  = totalDiagnosticMisses * CONVERSION_RATE * POINTS_PER_CORRECT;
  const feasibility = maxConvertiblePoints >= targetGain * 0.95 ? 'reachable'
                    : maxConvertiblePoints >= targetGain * 0.70 ? 'tight' : 'unlikely';

  // ── Proportional topic selection — group plans select ALL topics with misses (no early break)
  const selectedTopics = [];
  let rwIdx = 0, mathIdx = 0;
  while (selectedTopics.length < 20) {
    const rwDone = rwIdx >= rwRanked.length, mathDone = mathIdx >= mathRanked.length;
    if (rwDone && mathDone) break;
    const selRw   = selectedTopics.filter(t => t.section === 'R&W').reduce((s, t) => s + t.misses, 0);
    const selMath = selectedTopics.filter(t => t.section === 'Math').reduce((s, t) => s + t.misses, 0);
    const selTot  = selRw + selMath;
    let pickRW;
    if (rwDone) pickRW = false;
    else if (mathDone) pickRW = true;
    else { const rwShare = secTotal > 0 ? rwTotal / secTotal : 0.5; pickRW = (selTot > 0 ? selRw / selTot : 0) <= rwShare; }
    selectedTopics.push(pickRW ? rwRanked[rwIdx++] : mathRanked[mathIdx++]);
  }

  const topicSequence = selectedTopics.map((t, i) => ({
    rank: i + 1,
    topic: t.topic,
    section: t.section,
    domain: t.domain,
    tier: t.tier,
    tierLabel: t.tierLabel,
    misses: t.misses,
    notionUrl: t.notionPageId ? `https://www.notion.so/${t.notionPageId}` : null,
  }));

  // ── Build week-by-week assignment schedule ───────────────────────────────
  const effectiveWeeks = weeksUntilTest || 8;

  // Practice test checkpoints at 25/50/75/100% of program (deduplicated)
  const ptWeekSet = new Set(
    [0.25, 0.5, 0.75, 1.0]
      .map(f => Math.max(1, Math.ceil(effectiveWeeks * f)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4)
  );

  // Content weeks = all weeks that are NOT practice test weeks
  const contentWeeks = [];
  for (let w = 1; w <= effectiveWeeks; w++) {
    if (!ptWeekSet.has(w)) contentWeeks.push(w);
  }
  const topicsPerWeek = contentWeeks.length > 0
    ? Math.min(3, Math.ceil(topicSequence.length / contentWeeks.length))
    : 3;

  let topicIdx = 0, ptNum = 0;
  const weeklyAssignments = [];
  for (let w = 1; w <= effectiveWeeks; w++) {
    const isCheckpoint = ptWeekSet.has(w);
    const assignments  = [];
    if (!isCheckpoint) {
      const topicsThisWeek = [];
      for (let i = 0; i < topicsPerWeek && topicIdx < topicSequence.length; i++, topicIdx++) {
        topicsThisWeek.push(topicSequence[topicIdx]);
      }
      for (const t of topicsThisWeek) {
        assignments.push(
          { type: 'study',    topic: t.topic, section: t.section, notionUrl: t.notionUrl,
            label: 'Study',    desc: `Complete the ${t.topic} lesson on the StudyCore platform — watch the video and read all examples`, estMins: 30 },
          { type: 'practice', topic: t.topic, section: t.section, notionUrl: t.notionUrl,
            label: 'Practice', desc: `Complete all ${t.topic} practice questions on the StudyCore platform`, estMins: 25 },
          { type: 'review',   topic: t.topic, section: t.section, notionUrl: t.notionUrl,
            label: 'Review',   desc: `For every wrong answer label it: Concept Gap / Careless / Trap Answer — bring your list to office hours`, estMins: 15 }
        );
      }
      if (topicsThisWeek.length > 0) {
        const topicNames = topicsThisWeek.map(t => t.topic).join(' + ');
        assignments.push({
          type: 'drill',
          label: 'Q-Bank Drill',
          desc: `10–15 mixed questions from the StudyCore Question Bank covering ${topicNames} — no notes, timed`,
          estMins: 20,
        });
      }
    } else {
      ptNum++;
      const isFinal = w === effectiveWeeks;
      assignments.push({
        type: 'practice_test',
        topic: isFinal ? 'Final Full-Length Practice Test' : `Practice Test #${ptNum}`,
        description: isFinal
          ? 'Take a full-length SAT under real test conditions. Review every miss against your assignment list.'
          : 'Take a full-length SAT practice test under timed conditions. Note your weakest areas and bring your score report to the next office hours session.',
        estMins: 210,
        isFinal,
      });
      if (!isFinal) {
        assignments.push({
          type: 'score_review',
          label: 'Score Review',
          desc: 'After taking the practice test: categorise every miss as Concept Gap, Careless, or Trap Answer. Bring your categorised error log to office hours.',
          estMins: 30,
        });
      }
    }
    if (assignments.length > 0) weeklyAssignments.push({ week: w, isCheckpoint, assignments });
  }

  return {
    topicSequence,
    weeklyAssignments,
    programSummary: {
      topicsToTeach: topicSequence.length,
      weeksUntilTest: effectiveWeeks,
      targetGain,
      correctAnswersNeeded,
      totalDiagnosticMisses: +totalDiagnosticMisses.toFixed(1),
      feasibility,
      practiceTestCount: ptNum,
    },
  };
}
