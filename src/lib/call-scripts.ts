export type CallTypeId =
  | 'onboarding'
  | 'post-session-1'
  | 'weekly-student'
  | 'weekly-parent'
  | 'phase-checkin'
  | 'sat-day'
  | 'flag-response'
  | 'refund-save';

export interface PrepCardField {
  key: string;
  label: string;
  placeholder?: string;
  autoFillKey?: string; // key in SscStudent that pre-populates this field
  wide?: boolean;
}

export interface CallType {
  id: CallTypeId;
  title: string;
  duration: string;
  tallyUrl: string;
  prepCardFields: PrepCardField[];
  /** If true, inject dynamic per-day session rows derived from the student's schedule */
  hasSessionSchedule?: boolean;
  script: string;
  sopPoints: string[];
}

export const CALL_TYPES: CallType[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. ONBOARDING CALL
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'onboarding',
    title: 'Onboarding Call',
    duration: '25–35 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name',        autoFillKey: 'studentFirstName' },
      { key: 'parentFirstName',  label: 'Parent First Name',         autoFillKey: 'parentFirstName'  },
      { key: 'studentName',      label: 'Student Full Name',         autoFillKey: 'studentName'      },
      { key: 'parentName',       label: 'Parent Full Name',          autoFillKey: 'parentName'       },
      { key: 'currentScore',     label: 'Diagnostic / Current Score',autoFillKey: 'currentScore'     },
      { key: 'targetScore',      label: 'Target Score',              autoFillKey: 'targetScore'      },
      { key: 'testDate',         label: 'SAT Test Date',             autoFillKey: 'startDate', placeholder: 'e.g. December 5th' },
      { key: 'tutorName',        label: 'Tutor Name',                autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'tutorScore',       label: "Tutor's SAT Score",         placeholder: 'e.g. 1550'       },
      { key: 'sessionEndTime',   label: 'Session 1 End Time',        placeholder: 'e.g. 6:00 PM'    },
      { key: 'postCallTime',     label: 'Post-Session Call Time',    placeholder: 'e.g. 6:10 PM'    },
      { key: 'weeklyCheckinStudent', label: 'Weekly Check-in: Student', autoFillKey: 'weeklyCheckinTime', placeholder: 'e.g. Sundays at 5:00 PM' },
      { key: 'weeklyCheckinParent',  label: 'Weekly Check-in: Parent',  placeholder: 'e.g. Sundays at 5:30 PM' },
    ],
    hasSessionSchedule: true,
    script: `### STEP 1: Open (2 min)

"Hey {{studentFirstName}}, {{parentFirstName}} — this is Jonas from StudyCore. How's everyone doing today?"

[Let them respond briefly.]

"Perfect. We've got about 30 minutes together. By the end of this call, {{studentFirstName}} will know exactly what the plan looks like, how the platform works, when sessions are, and what success requires. Zero open questions by the time we hang up — that's the goal."

"Before we dive in — can I ask both of you to put everything else down? No other tabs, no other conversations. This is the most important call in the whole program."

[Wait for confirmation, then:]

"Great. Let's get into it."

---

### STEP 2: Diagnostic Review (3–4 min)

[SCREEN ACTION: Admin panel → Students → Search → click {{studentName}} → click their name → scroll to SAT Adaptive Test → click the test title directly (NOT View All). Must switch Program to "SAT" at the top if results don't load.]

"I'm sharing my screen now — can you both see this?"

[Wait for yes.]

"So the first thing I want to walk you through is the diagnostic. This tells us exactly where {{studentFirstName}} stands right now and where we're going to focus the program. The composite came in at {{currentScore}}."

[Scroll to domain breakdown — R&W first, then Math]

"In reading and writing, we can see Craft and Structure, Information and Ideas, Standard English Conventions, and Expression of Ideas. In math, we've got Algebra, Advanced Math, Problem Solving, and Geometry."

"The biggest opportunity right now is in [lowest domain]. That's where the most points are — and that's where {{tutorName}} is going to focus first."

"To be straight with you — going from {{currentScore}} to {{targetScore}} is a real gain. Absolutely doable, but it requires work every single day. We'll cover that."

"{{tutorName}} will go through every question on this diagnostic in the first session — not just what was wrong, but why."

---

### STEP 3: Platform Walkthrough (5–7 min)

[SCREEN ACTION: Top right profile icon → Login As → Search → {{studentName}} → select their account. To exit: click "Exit" in top right corner.]

"Now I'm going to show you your platform. {{studentFirstName}}, open studycore.net on your end and follow along."

[Wait for student to open it.]

"Dashboard: Your home base. Progress, assigned assessments, quick start checklist. This is where you land every time you log in."

"Assessments tab: Most important tab day to day. Every homework assignment from your tutor shows up here. Check this every single day."

"My Questions tab: This is your error log. Every wrong answer from any assignment gets logged here automatically. The key feature is Revenge Test — select questions, create a revenge test, keep taking it until you get them right. Do this after every session."

"Courses tab: Mainly for beginners. The one course I need you to do is the Desmos Mastery Course — it's the graphing calculator built into the SAT. Every student completes this."

"Calendar tab: Your Zoom session links are here. Homework due dates are here. Check this before every session."

"Collaboration tab: Direct message with your tutor between sessions. Stuck on a homework problem? Go here first."

"Support tab: If you can't reach me — email or call from here. But always text me first."

"{{studentFirstName}} — where do you find your homework?"
[Wait for answer.]
"Where's the error log?"
[Wait.]
"Where's the Zoom link for your session?"
[Wait. Walk back through anything they hesitate on.]

"Any questions on the platform before we move on?"

---

### STEP 4: Schedule Confirmation (3–4 min)

[SCREEN ACTION: Stop sharing. Open onboarding form in a separate tab to reference availability — do NOT share this screen.]

"Alright, let's lock in the schedule. From your intake form, {{studentFirstName}} is available [days from form]. Is that still accurate?"

[Let them confirm or adjust.]

"We're going to do two sessions per week — one weekday and one weekend when possible, with enough time between them to actually do the homework. Sessions back to back don't work as well because the practice in between is where the learning gets locked in."

"Based on what you've told me — what if we did {{session1Day}} at {{session1Time}} and {{session2Day}} at {{session2Time}}? Does that work for both of you?"

[Wait for yes from both.]

"Perfect. Your first session is {{session1Day}} at {{session1Time}}."

---

### STEP 5: Tutor Introduction (1 min)

"Your tutor is {{tutorName}}. {{tutorName}} scored {{tutorScore}} on the SAT and has been trained through our system. We matched {{tutorName}} to {{studentFirstName}} specifically based on the diagnostic — the areas {{studentFirstName}} needs to work on are {{tutorName}}'s strengths."

---

### STEP 6: Post-Session 1 Setup (30 sec)

"Right after the first session ends, I'm going to call you, {{studentFirstName}}. So if the session ends at {{sessionEndTime}}, expect my call around {{postCallTime}}. Just five minutes — I want to hear how it went while it's fresh."

[Get a yes from the student.]

---

### STEP 7: Student Expectations (3 min)

"I want to spend a few minutes on what this actually takes — because I've seen students get the exact same program with completely different results. The difference is always the same thing."

"{{studentFirstName}}, here's what I need from you:"

"Thirty to forty-five minutes of independent practice every single day. Not every other day — every day. Homework your tutor assigns, error log review, revenge tests. The sessions are where you learn. The daily practice is where it gets locked in."

"Show up to every session. If something comes up, give us 24 hours notice. Never no-show."

"Take notes in every session and read them back that same night."

"If anything feels off — sessions feel too easy, homework is unclear, you're not clicking with your tutor — text me that same day. I can't fix something I don't know about."

"Can I get your commitment on all of that right now?"

[Wait for a real yes. Don't move on until you have it.]

---

### STEP 8: Parent Expectations (2 min)

"{{parentFirstName}}, here's what I need from you. On the days when {{studentFirstName}} doesn't feel like doing the homework — when motivation dips, when school gets busy — that's when your accountability matters most."

"Our team monitors homework completion weekly. If I see {{studentFirstName}} falling behind, I will call you. I need to know you'll back that up at home."

"One missed session per week is 25% of tutoring time gone. That math catches up fast."

"Can I count on you for that?"

[Wait for yes.]

"I appreciate that. Both of you showing up fully is what makes this work."

---

### STEP 9: Communication & Check-ins (2 min)

"Day-to-day questions — text me directly. I get back within 12 hours, same day for anything urgent."

"I do a weekly check-in call with both of you separately — five to ten minutes, just a quick pulse check."

"{{studentFirstName}}, I'll call you {{weeklyCheckinStudent}}."

"{{parentFirstName}}, I'll call you {{weeklyCheckinParent}}."

"And after every practice test, we do a Zoom call together — about 20 to 30 minutes — to go over the full score breakdown and what we're focusing on next."

---

### STEP 10: Commitment Close (2 min)

"Two sessions per week. Thirty to forty-five minutes of practice every day. Practice tests at the end of every phase. Weekly check-ins with me. That's the formula."

"We don't measure success by how good sessions feel. We measure it by score movement. Some sessions will be hard — that's a good sign. It means {{studentFirstName}} found something they haven't mastered yet."

"{{studentFirstName}} — are you ready to get started?"
[Wait for yes.]

"{{parentFirstName}} — do you feel confident in the plan?"
[Wait for yes.]

"I'm looking forward to this."

---

### STEP 11: Close (1 min)

"First session is {{session1Day}} at {{session1Time}} with {{tutorName}}. Zoom link will be in your email and in the Calendar tab on the platform."

"I'll call you right after the session, {{studentFirstName}}. Weekly check-ins start next week — {{studentFirstName}} at {{weeklyCheckinStudent}}, {{parentFirstName}} at {{weeklyCheckinParent}}."

"Any questions before we hang up?"

[Give real space. Don't rush the end.]

"Talk to you soon. Don't forget the Desmos Mastery Course in the meantime."`,
    sopPoints: [
      'Block 35 min minimum. Have GHL, platform (diagnostic loaded), and script open before joining the call.',
      'Diagnostic: Admin → Students → Search → click student name → click test title directly. Switch Program to SAT if results don\'t load.',
      'Platform walkthrough: Login As from top right. Exit via the "Exit" button in the top right corner.',
      'Get a real verbal YES from both student and parent on expectations — don\'t move on until you have it.',
      'Lock in weekly check-in times before hanging up. Add to your calendar before the call ends.',
      'Log in GHL and fill Tally form (check-in type: Onboarding Call) immediately after.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. POST-SESSION 1
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'post-session-1',
    title: 'Post-Session 1',
    duration: '5–10 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'tutorName',        label: 'Tutor Name',         autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'nextSessionDay',   label: 'Next Session Day',   placeholder: 'e.g. Saturday'  },
      { key: 'nextSessionTime',  label: 'Next Session Time',  placeholder: 'e.g. 11:00 AM'  },
      { key: 'weeklyCheckinDay', label: 'Weekly Check-in Day/Time', autoFillKey: 'weeklyCheckinTime', placeholder: 'e.g. Sunday at 5 PM' },
    ],
    script: `### Open (1 min)

"Hey {{studentFirstName}} — how'd it go?"

[Keep it warm and low-pressure. This is a quick check-in, not a formal review.]

---

### Core Questions (3–4 min)

"What did you work on in the session?"

"How did you feel about {{tutorName}}? Did it click?"

"Did {{tutorName}} assign homework? Do you know what you need to do before the next session?"

"Anything feel off — too fast, too slow, confusing?"

---

### Reinforce (1–2 min)

[If it went well:]
"That's exactly what the first session should feel like. Get the homework done before {{nextSessionDay}} and you're off to a strong start."

[If it was just okay:]
"First sessions always have a bit of an adjustment — that's completely normal. Give it one more and you'll find your rhythm."

"You've got {{tutorName}} again on {{nextSessionDay}} at {{nextSessionTime}}, right?"

---

### Close (30 sec)

"I'll be checking in with you on {{weeklyCheckinDay}}. Anything before then, just text me."`,
    sopPoints: [
      'Call within 10 min of session end. If no answer, call once more then text.',
      'Do not lead with the flag — just ask how it went and listen.',
      'If student didn\'t connect with tutor: log it, monitor session 2, raise to Tanuj if session 2 is the same.',
      'If no homework was assigned: flag to QCM — tutors must assign homework after session 1.',
      'Fill Tally form immediately after (check-in type: Other, status: Green unless flag raised).',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. WEEKLY CHECK-IN — STUDENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'weekly-student',
    title: 'Weekly Check-in (Student)',
    duration: '5–10 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'tutorName',        label: 'Tutor Name',         autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'nextSessionDay',   label: 'Next Session Day',   placeholder: 'e.g. Wednesday' },
      { key: 'nextSessionTime',  label: 'Next Session Time',  placeholder: 'e.g. 5:00 PM'   },
    ],
    script: `### Open (1 min)

"Hey {{studentFirstName}}, it's Jonas from StudyCore. How's everything going?"

[Be warm and conversational — not scripted. The goal is to know how they're actually doing, not the official version.]

---

### Core Questions (4–5 min)

"How are you feeling about the sessions so far?"

"Are you keeping up with the homework? Any parts that felt unclear or too hard?"

"How's the vibe with {{tutorName}}? Clicking well?"

"Anything that felt off this week — sessions, homework, anything at all?"

"Are you using the error log and doing revenge tests after sessions?"

---

### Red Flags to Listen For

[If they say "sessions feel easy"] → tutor may not be pushing hard enough. Log it and brief QCM.
[If they say "I haven't been doing the homework"] → flag immediately. Set a specific deadline before ending the call.
[If they say "I don't really understand what the tutor is teaching"] → potential tutor mismatch. Log and monitor.
[If they give short, vague answers] → dig one level deeper before ending the call.

---

### Close (1 min)

"You've got {{tutorName}} on {{nextSessionDay}} at {{nextSessionTime}}, right? Make sure the homework is done before then."

"Anything you need from me before the session?"

"Okay, I'll be calling your parent right after this. Talk soon."`,
    sopPoints: [
      'Pull up the student on Operations Dashboard and check TQC for recent session reports before calling.',
      'Be conversational, not scripted. The goal is to hear what\'s actually going on.',
      'If homework isn\'t done: set a specific deadline on the call — don\'t just note it.',
      'If 2+ red flags: escalate to Tanuj the same day.',
      'Fill Tally form immediately after (check-in type: Weekly Check-in).',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. WEEKLY CHECK-IN — PARENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'weekly-parent',
    title: 'Weekly Check-in (Parent)',
    duration: '5–10 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'parentFirstName',    label: 'Parent First Name',    autoFillKey: 'parentFirstName'  },
      { key: 'studentFirstName',   label: 'Student First Name',   autoFillKey: 'studentFirstName' },
      { key: 'sessionsCompleted',  label: 'Sessions Completed',   autoFillKey: 'sessionsCompleted', placeholder: 'e.g. 8' },
      { key: 'tutorName',          label: 'Tutor Name',           autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'nextSessionDay',     label: 'Next Session Day',     placeholder: 'e.g. Wednesday' },
      { key: 'nextSessionTime',    label: 'Next Session Time',    placeholder: 'e.g. 5:00 PM'   },
    ],
    script: `### Open (1 min)

"Hi {{parentFirstName}}, it's Jonas from StudyCore. Just following up after my call with {{studentFirstName}} — do you have a few minutes?"

[Keep it professional and warm. Parents want reassurance and data — give them both.]

---

### Core Questions (4–5 min)

"How do you feel {{studentFirstName}} is settling into the program?"

"Are they doing their homework consistently from what you can see at home?"

"Any concerns on your side — about the schedule, the tutor, or progress so far?"

"Are they talking about the sessions at home? Positive or negative?"

---

### Share a Brief Update (1–2 min)

"From our records, {{studentFirstName}} has completed {{sessionsCompleted}} sessions with {{tutorName}}. [Share any relevant data or concerns from the student call.]"

[If there's a concern from the student call:]
"{{studentFirstName}} mentioned [concern] — I'm going to follow up on that and make sure it gets addressed."

---

### Red Flags to Listen For

[If parent says "he hasn't been sitting down to do homework"] → flag immediately. Set an accountability plan.
[If parent says "we're not sure the tutor is a good fit"] → do not dismiss. Escalate to Tanuj.
[If parent says "we're thinking of pausing"] → do NOT try to fix it on this call. Escalate to Tanuj immediately after.

---

### Close (30 sec)

"Next session with {{tutorName}} is on {{nextSessionDay}} at {{nextSessionTime}}. I'll be checking in with {{studentFirstName}} again next week."

"If anything comes up before then, text me directly and I'll get back to you within 12 hours."`,
    sopPoints: [
      'Call parent right after the student call, while the context is fresh.',
      'Share what you observed from the student call — not gossip, but relevant context.',
      'If parent mentions pausing or cancelling: do NOT handle it on this call. Escalate to Tanuj before doing anything.',
      'If parent mentions tutor mismatch: acknowledge, do not dismiss, escalate to Tanuj.',
      'Fill Tally form after both calls — one form per student per week.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. PHASE CHECK-IN
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'phase-checkin',
    title: 'Phase Check-in',
    duration: '20–30 min (Zoom)',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName',  label: 'Student First Name',   autoFillKey: 'studentFirstName' },
      { key: 'parentFirstName',   label: 'Parent First Name',    autoFillKey: 'parentFirstName'  },
      { key: 'parentName',        label: 'Parent Full Name',     autoFillKey: 'parentName'       },
      { key: 'targetScore',       label: 'Target Score',         autoFillKey: 'targetScore'      },
      { key: 'testDate',          label: 'SAT Test Date',        autoFillKey: 'startDate', placeholder: 'e.g. December 5th' },
      { key: 'tutorName',         label: 'Tutor Name',           autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'practiceTestScore', label: 'Practice Test Score',  placeholder: 'e.g. 1420'       },
      { key: 'prevScore',         label: 'Previous Score',       autoFillKey: 'currentScore', placeholder: 'e.g. 1380' },
      { key: 'pointGain',         label: 'Point Gain',           placeholder: 'e.g. +40'        },
      { key: 'strongDomain',      label: 'Biggest Improvement',  placeholder: 'e.g. Algebra'    },
      { key: 'weakDomain',        label: 'Remaining Gap',        placeholder: 'e.g. Geometry'   },
      { key: 'nextPhaseTopics',   label: 'Next Phase Focus',     placeholder: 'e.g. Geometry + Advanced Math', wide: true },
    ],
    script: `### STEP 1: Open (1–2 min)

"Hey {{studentFirstName}}, {{parentFirstName}} — welcome to the phase check-in. We're going to go over the practice test results, what's working, what we're focusing on next, and make sure we're still on track for {{targetScore}} by {{testDate}}."

---

### STEP 2: Score Review (5–7 min)

[SCREEN ACTION: Share screen with score breakdown — composite, then Math domains, then R&W domains]

"{{studentFirstName}} scored {{practiceTestScore}} on this practice test — that's {{pointGain}} points from the last one."

[Walk through each domain. Highlight improvements explicitly.]

"The biggest improvement was in {{strongDomain}} — that work is paying off. The remaining gap is in {{weakDomain}} — that stays our focus going into the next phase."

---

### STEP 3: Trajectory Check (3–4 min)

[If on track:]
"We're right where we need to be heading into {{testDate}}. Here's what the next phase looks like."

[If behind:]
"I'm going to be straight with you. At this pace, we're projecting around {{practiceTestScore}} by test day. To close the gap to {{targetScore}}, here's what needs to change: {{nextPhaseTopics}}. This is fixable — but it requires showing up every single day."

---

### STEP 4: Tutor Feedback (2–3 min)

"{{tutorName}} has shared that {{studentFirstName}} is [effort observation from tutor]. Going into the next phase, {{tutorName}} is going to focus on {{nextPhaseTopics}}."

---

### STEP 5: Commitment Renewal (1–2 min)

"{{studentFirstName}}, you've put in the work this phase and {{pointGain}} points of progress shows it. {{targetScore}} by {{testDate}} is still the plan. Are you ready to go into the next phase?"

[Wait for yes.]

---

### STEP 6: Close (1 min)

"The next phase check-in will be after the next practice test — you'll get a booking link automatically when it's done."

"Any questions before we wrap up?"`,
    sopPoints: [
      'Pull practice test scores from platform before the call. Calculate point gain from diagnostic.',
      'Get a verbal update from the tutor before the call: "How did the phase go? What are you focusing on next?"',
      'Share screen with score breakdown. Celebrate improvements explicitly — don\'t just rush to the gaps.',
      'If trajectory is off: be direct. Never lie about where they stand.',
      'If behind pace: escalate to Tanuj the same day after the call.',
      'Fill Tally form after (check-in type: Post-Practice Test / Phase Check-in).',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. SAT DAY / RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'sat-day',
    title: 'SAT Day / Results',
    duration: 'Pre-SAT: 5–10 min | Results: 20–30 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'parentFirstName',  label: 'Parent First Name',  autoFillKey: 'parentFirstName'  },
      { key: 'testDate',         label: 'SAT Test Date',      autoFillKey: 'startDate', placeholder: 'e.g. December 5th' },
      { key: 'targetScore',      label: 'Target Score',       autoFillKey: 'targetScore'      },
      { key: 'actualScore',      label: 'Actual Score (Results call only)', placeholder: 'e.g. 1520' },
      { key: 'pointGain',        label: 'Total Point Gain from Diagnostic', placeholder: 'e.g. +130' },
    ],
    script: `### PRE-SAT CHECK-IN (3–5 days before {{testDate}})

"Hey {{studentFirstName}} — your test is {{testDate}}. How are you feeling?"

"Quick logistics: do you have your test center confirmed and your College Board admission ticket ready?"

"The goal between now and test day is rest — not cramming new material. Maybe review your error log notes tonight. That's it."

"You've done the work. This is just showing up and executing. Trust your prep."

"Text me after you're done — I want to hear how it felt."

[GHL: Move student to SAT Day Done stage after their test date passes.]

---

### RESULTS CALL — HIT TARGET ({{targetScore}} or above)

[Pull the full score report before the call. Know: composite, Math by domain, R&W by domain, total point gain.]

"You did it. {{studentFirstName}} hit {{actualScore}}. That's the goal — you got there."

[Walk through what improved most. Celebrate it explicitly. Don't rush past this moment.]

"How do you feel about it?"

[If they want to stop:]
"I'm so proud of the work you put in. I'd love one favor — would you be willing to share what this experience was like? Even a quick text I can pass along helps other families make the decision."

[Coordinate with Harshil to confirm program close-out. Do not promise anything on this call about guarantee status.]

---

### RESULTS CALL — MISSED TARGET

"I know that's not the number you wanted. How are you doing?"

[Let them feel it. Don't immediately shift to problem-solving. Give it 30 seconds.]

[Share screen with score breakdown — walk through what worked, what still needs work. Be honest.]

"I'm going to go over this with the team and come back to you with a clear plan for what's next. You still have the program and we're not walking away from this."

[DO NOT commit to anything on this call — no continued sessions, no new test dates, no guarantee details.]

"I'll be back in touch within 24 hours once I have direction."

[Escalate to Tanuj and Harshil immediately after the call with: student name, score, target, what was observed.]`,
    sopPoints: [
      'Pre-SAT: reach out 3–5 days before the test date. Keep it short — logistics + pep talk + "text me after."',
      'Results call: pull full score report, calculate point gain from diagnostic, get tutor brief before the call.',
      'If hit target: celebrate first, then handle program close-out — never skip the emotional moment.',
      'If missed target: do NOT commit to anything on this call. Escalate to Tanuj + Harshil same day.',
      'Do not move to Completed or Guarantee Case without founder confirmation.',
      'Fill Tally form after (status: Green if hit, Yellow/Red if missed).',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. FLAG RESPONSE
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'flag-response',
    title: 'Flag Response',
    duration: 'Yellow: within 24h | Red: within 2h',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'flagLevel',        label: 'Flag Level',         placeholder: 'Yellow or Red'    },
      { key: 'sessionDate',      label: 'Session Date',       placeholder: 'e.g. Sep 28'      },
      { key: 'tutorId',          label: 'Tutor (name or ID)', placeholder: 'e.g. Arjun / #15' },
      { key: 'flagNotes',        label: 'Flag Notes from Tutor', placeholder: 'What the tutor reported', wide: true },
    ],
    script: `### Before the Call

Check #tqc-flags in Slack — read the tutor's notes carefully.
Flag level: {{flagLevel}} | Session date: {{sessionDate}} | Tutor: {{tutorId}}
Notes: {{flagNotes}}

Pull up {{studentFirstName}} on the Operations Dashboard. How many sessions? Any prior flags?

[Red flag → call immediately. Yellow flag → call or text within 24 hours.]

---

### Opening (1 min)

"Hey {{studentFirstName}}, it's Jonas from StudyCore. Just checking in after your session on {{sessionDate}}. How did it go?"

[Do NOT lead with the flag. Just ask how it went and listen.]

---

### Digging In (2–3 min)

[If the session felt hard:]
"That's actually a good sign — it means you hit something you haven't mastered yet. Stick with it."

[If homework wasn't done:]
"Got it. Can you get it done by [specific day]? I'll check in with you then."
[Set a specific deadline. Don't just acknowledge it.]

[If something seems wrong:]
"Tell me more about that. When did this start feeling that way?"

[If student seems disengaged or gives short answers:]
"I want to make sure you're actually okay. What's going on?"

---

### Close

"I'm going to follow up on this. Anything else I should know before we hang up?"

[After call:]
Fill Tally — check-in type: Weekly Check-in, status: {{flagLevel}}
Log in GHL — what the flag was, what you found out, what action you're taking
Mark Resolved on TQC dashboard only once there is a clear resolution — not just after you made contact
If unresolved after one follow-up → escalate to Tanuj`,
    sopPoints: [
      'Red flag = call within 2 hours. Yellow flag = call or text within 24 hours. Do not let flags sit.',
      'Do not lead with the flag — ask how the session went and listen for what\'s actually wrong.',
      'If a tutor quality issue: notify QCM and Tanuj immediately. Do not wait.',
      'Homework non-completion (first offense): set a specific deadline on the call. Second offense: call the parent.',
      'Mark Resolved on TQC dashboard only after there is a clear resolution.',
      'Second yellow flag from same student in one week → escalate to Tanuj.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. REFUND-SAVE
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'refund-save',
    title: 'Refund-Save',
    duration: '15–25 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'parentFirstName',  label: 'Parent First Name',  autoFillKey: 'parentFirstName'  },
      { key: 'parentName',       label: 'Parent Full Name',   autoFillKey: 'parentName'       },
      { key: 'tutorName',        label: 'Tutor Name',         autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'statedReason',     label: 'Stated Reason for Cancellation', placeholder: 'What they said', wide: true },
    ],
    script: `### Before the Call

Pull up {{studentFirstName}}'s full history in GHL: sessions completed, check-in notes, any prior flags.
Know: hours purchased, hours remaining, current score vs. target score, how many sessions completed.
Do NOT commit to any refund amount before this call. That requires Harshil's approval.

---

### STEP 1: Acknowledge and Slow Down (1–2 min)

"{{parentFirstName}}, I'm really glad you reached out. Before we talk about next steps, I want to make sure I fully understand what's going on."

[Do not react to the words "refund" or "cancel." Stay calm and curious. Let them talk.]

---

### STEP 2: Find the Real Reason (3–5 min)

"Can you walk me through what's been happening?"

"When did you start feeling this way?"

"Was there a specific session or moment that changed things?"

[The stated reason is rarely the full story:]
"Too expensive" → usually means: not seeing progress
"Too busy" → usually means: schedule isn't working or motivation dropped
"Sessions aren't helping" → usually means: tutor fit issue or homework not being done
"Want to pause" → usually means: unsure, not fully committed to cancelling

---

### STEP 3: Offer the Fix — Not the Refund (3–4 min)

[Tutor fit issue:]
"Let me match {{studentFirstName}} with a different tutor. We can have someone new in place by [date]."

[Schedule issue:]
"What if we moved sessions to a different time? We can make that happen this week."

[Progress concern:]
"I hear you. Let me pull up {{studentFirstName}}'s data and walk you through exactly where they stand and what we're going to do differently."

[Motivation or burnout:]
"What if we scaled back to one session per week for the next two weeks, just to reset?"

[Do not mention a refund as the first or second solution. It should feel like it never crossed your mind.]

---

### STEP 4: Get a Commitment or a Pause (1–2 min)

[If the fix lands:]
"Can we try this for two weeks? If things still aren't working after that, we'll figure out the right next step together."

[If they're unsure:]
"I don't want you to make a decision under stress. Let's talk again in two days — I'll have [specific thing] ready for you."

[If they're firm — do NOT commit to any number:]
"I completely understand. I want to handle this the right way for your family. Let me talk to our team and get back to you within 24 hours with all the details."

[Then escalate to Harshil and Tanuj immediately with the full escalation format.]`,
    sopPoints: [
      'Never accept a cancellation on the spot — every cancellation is a save attempt first.',
      'Pull GHL history before the call: sessions completed, hours remaining, any flags.',
      'The stated reason is rarely the real reason. Ask open questions and listen.',
      'Offer the fix before the refund — tutor switch, schedule change, reduced frequency.',
      'NEVER quote a refund amount. Say: "I\'ll get back to you within 24 hours with details." Then escalate to Harshil.',
      'If saved: flag student for extra attention over the next two weeks.',
    ],
  },
];
