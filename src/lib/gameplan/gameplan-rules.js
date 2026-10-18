// Rule-based narrative generator — fully deterministic, no AI call needed

export function generateGameplanNarratives(studentData, routingResult) {
  const { programSummary, topicSequence } = routingResult;
  const contentTopics = topicSequence.filter(t => !t.isPacing && !t.isWAE);
  const top3 = contentTopics.slice(0, 3);
  const slowTopics = contentTopics.filter(t => t.avgTimeSecs && t.avgTimeSecs > 90);
  const hasPacing = programSummary.needsPacing;
  const feasibility = programSummary.feasibility;
  const gain = programSummary.targetGain;
  const name = studentData.studentName?.split(' ')[0] || 'The student';

  // ── Executive Summary ────────────────────────────────────────────────────
  const topicList = top3.map(t => `${t.topic} (${t.misses.toFixed(1)} misses)`).join(', ');
  const executiveSummary =
    `${name} scored ${studentData.baselineScore} on the diagnostic (R&W: ${studentData.rwScore || '—'} · Math: ${studentData.mathScore || '—'}) and needs +${gain} points to reach ${studentData.targetScore}. ` +
    `The routing engine identified ${programSummary.topicsToTeach} topics driving the score gap. Top priorities: ${topicList}. ` +
    `This program runs ${programSummary.totalSessionsNeeded} sessions over ${programSummary.weeksNeeded} weeks at ${programSummary.sessionsPerWeek}×/week. Feasibility: ${feasibility}.`;

  // ── Risk Assessment ──────────────────────────────────────────────────────
  const risks = [];
  if (feasibility === 'tight') risks.push('Score gap is tight — full conversion of all diagnostic misses is required to hit target. No sessions can be skipped.');
  if (feasibility === 'unlikely') risks.push('Score gap exceeds what the diagnostic misses alone can cover. Reassess target score or plan for 2 attempts.');
  if (hasPacing) risks.push(`${name} left ${programSummary.blanks} questions blank. Pacing module is Session 1 — time strategy must be resolved before content topics begin.`);
  if (slowTopics.length > 0) {
    const names = slowTopics.slice(0, 2).map(t => `${t.topic} (${Math.round(t.avgTimeSecs)}s/q)`).join(', ');
    risks.push(`Slow pacing detected on: ${names}. Phase 2 speed drills are non-negotiable for these topics — Gate 2 bar is 90%+ timed.`);
  }
  const foundationalTopics = contentTopics.filter(t => t.startTier === 'Foundational');
  if (foundationalTopics.length > 2) risks.push(`${foundationalTopics.length} topics start at Foundational tier — expect Phase 1 sessions to be full 60-minute builds, not reviews.`);
  if (risks.length === 0) risks.push('No major risks flagged. Program is well within achievable range given the diagnostic data.');
  const riskAssessment = risks.join('\n\n');

  // ── Tutor Session Guidance ───────────────────────────────────────────────
  const tierCounts = { Foundational: 0, Developing: 0, Optimization: 0 };
  contentTopics.forEach(t => { if (t.startTier) tierCounts[t.startTier]++; });

  let tutorSessionGuidance = `Follow the topic order exactly — it is built from ${name}'s actual diagnostic misses, ranked by point value. Do not reorder, even if a different topic feels more urgent.\n\n`;

  if (tierCounts.Foundational > 0) tutorSessionGuidance += `${tierCounts.Foundational} topic(s) start at Foundational tier. These require full I Do / We Do / You Do sessions — plan for the complete Phase 1 script. Gate 1 bar is 9/10 untimed; do not advance until the student hits it.\n\n`;
  if (tierCounts.Developing > 0) tutorSessionGuidance += `${tierCounts.Developing} topic(s) start at Developing tier. The student has the concept but misses Hard questions. Phase 1 focus: hard-question traps and edge cases.\n\n`;
  if (tierCounts.Optimization > 0) tutorSessionGuidance += `${tierCounts.Optimization} topic(s) start at Optimization tier. Phase 1 may be brief — verify with 5 hard questions. If the student scores 5/5, move directly to Phase 2 drills.\n\n`;
  if (slowTopics.length > 0) {
    const names = slowTopics.map(t => t.topic).join(', ');
    tutorSessionGuidance += `Slow-pacing topics (${names}): Phase 2 speed drills are mandatory. Be silent during timed sets — you are collecting data, not coaching. Log the timed accuracy before the next session.`;
  }

  // ── Parent Support Guide ─────────────────────────────────────────────────
  const parentSupportGuide =
    `${name} needs 30–40 minutes of homework on every non-session day. The day after each session: practice the topic just taught. The following day: a timed set on the same topic. Third and fourth days: spaced review of topics from 7 and 21 days ago.\n\n` +
    `Gate 3 re-checks at 21 days are the most important thing in the program. The tutor will log these automatically in the Mastery Tracker. If a topic fails its Gate 3 check, it returns to the homework rotation — this is normal and expected.\n\n` +
    `Contact StudyCore if: a session is cancelled and not rescheduled within 7 days, the student reports not doing homework for more than 3 consecutive days, or a Gate 1 check has been repeated more than twice for the same topic.`;

  // ── Phase Narratives ─────────────────────────────────────────────────────
  const phase1Topics = contentTopics.slice(0, Math.ceil(contentTopics.length / 3));
  const phase2Topics = contentTopics.slice(Math.ceil(contentTopics.length / 3), Math.ceil(2 * contentTopics.length / 3));
  const phase3Topics = contentTopics.slice(Math.ceil(2 * contentTopics.length / 3));

  const phaseNarratives = [];

  phaseNarratives.push({
    phaseLabel: `Phase 1 — Foundation (Sessions 1–${Math.ceil(phase1Topics.length * 2)})`,
    description: `Focus: ${phase1Topics.map(t => t.topic).join(', ')}. These are the highest-impact topics from the diagnostic — fixing them produces the largest point gain per session. Each topic runs a full Phase 1 (content mastery) and Phase 2 (speed drills) cycle.`,
    tutorFocus: `Run the full lesson plan script for each topic. Gate 1 (9/10 untimed) must be hit before moving to Phase 2. After every 3 topics, run a Phase 3 error-pattern session — build the student's Top 3 Mistakes chart live, with them.`,
    parentCheckpoint: `After ${Math.ceil(phase1Topics.length * 2)} sessions, ${name} should be able to complete questions on these topics accurately untimed. Ask the tutor for the Gate 1 scores before the next session.`,
  });

  if (phase2Topics.length > 0) {
    phaseNarratives.push({
      phaseLabel: `Phase 2 — Speed & Accuracy (Sessions ${Math.ceil(phase1Topics.length * 2) + 1}–${Math.ceil((phase1Topics.length + phase2Topics.length) * 2)})`,
      description: `Focus: ${phase2Topics.map(t => t.topic).join(', ')}. This phase builds on the foundation — topics from Phase 1 enter their Gate 2 timed drill cycle while new topics begin Phase 1.`,
      tutorFocus: `Phase 2 drills are mostly homework — in session, review the error patterns from their timed results. A practice test is due around session ${Math.ceil((phase1Topics.length + phase2Topics.length) * 2) - 2}: use Phase 4 protocol to log conversion rate and re-rank any remaining topics.`,
      parentCheckpoint: `${name} should be completing timed question sets without assistance by this point. If they are still asking for help during timed drills, flag it immediately.`,
    });
  }

  if (phase3Topics.length > 0) {
    phaseNarratives.push({
      phaseLabel: `Phase 3 — Close the Gap (Sessions ${Math.ceil((phase1Topics.length + phase2Topics.length) * 2) + 1}+)`,
      description: `Focus: ${phase3Topics.map(t => t.topic).join(', ')}. Final content topics, plus Gate 3 re-checks on all topics taught in Phase 1. Any topic that fails its 21-day re-check returns to the homework rotation.`,
      tutorFocus: `Run Gate 3 re-checks on schedule — the Mastery Tracker will flag them amber when due. A final practice test 2–3 weeks before test day uses Phase 4 protocol to confirm all targets are locked.`,
      parentCheckpoint: `${name} should be scoring at or above target on full timed modules. Any topic still showing red in the Mastery Tracker 3 weeks before test day needs an emergency Phase 5 session — contact StudyCore immediately.`,
    });
  }

  // ── Checkpoint Triggers ──────────────────────────────────────────────────
  const checkpointTriggers = [];

  checkpointTriggers.push(`Gate 1 missed twice on any topic: student scores below 9/10 untimed after two Phase 1 attempts, contact StudyCore — the tier may need to drop or the lesson plan needs a different approach.`);
  checkpointTriggers.push(`Gate 2 missed: student cannot hit 90%+ on two consecutive timed sets after Phase 2 drills, contact StudyCore — pacing intervention needed.`);
  checkpointTriggers.push(`Gate 3 re-check fails: topic score drops below 85% at the 21-day mark, contact StudyCore — the topic returns to homework rotation and may need Phase 5.`);

  if (hasPacing) checkpointTriggers.push(`Pacing module complete (Session 1): if student still cannot finish the section in time by Session 3, contact StudyCore — deeper test execution work is needed before content topics.`);
  if (slowTopics.length > 0) checkpointTriggers.push(`Speed drill results on ${slowTopics[0].topic}: if timed accuracy is below 70% after two Phase 2 homework sets, contact StudyCore before the next session.`);

  checkpointTriggers.push(`Practice test score does not improve after 6+ sessions: if ${name}'s score on a full-length test is flat or declining, contact StudyCore — program may need to be re-routed from the new diagnostic.`);
  checkpointTriggers.push(`Student misses 2+ sessions in any 2-week window, contact StudyCore — program timeline will need to be rebuilt.`);

  // ── Bottom Line ──────────────────────────────────────────────────────────
  const bottomLine = feasibility === 'reachable'
    ? `${name}'s target of ${studentData.targetScore} is fully within reach. The diagnostic misses account for the entire score gap — this is a content and execution problem, not a ceiling problem. Follow the program in order, hit every gate, and the score follows.`
    : feasibility === 'tight'
    ? `${name}'s target of ${studentData.targetScore} is achievable but requires near-perfect execution — every session, every gate, every homework set. Zero sessions can be skipped. If progress stalls after 8 sessions, contact StudyCore to reassess the target.`
    : `${name}'s target of ${studentData.targetScore} is aggressive relative to the diagnostic data. A +${gain} gain at this score range requires multiple attempts and sustained work. The program is built for the best-case outcome — plan for at least 2 test sittings.`;

  return {
    executiveSummary,
    riskAssessment,
    tutorSessionGuidance,
    parentSupportGuide,
    phaseNarratives,
    checkpointTriggers,
    bottomLine,
  };
}
