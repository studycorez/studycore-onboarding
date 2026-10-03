export type CallTypeId =
  | 'onboarding'
  | 'post-session-1'
  | 'weekly-student'
  | 'weekly-parent'
  | 'phase-checkin'
  | 'sat-day'
  | 'flag-response'
  | 'refund-save'
  | 'renewal'
  | 'parent-update';

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

[If diagnostic is NOT yet complete:]
"{{studentFirstName}} — you have a diagnostic scheduled. It's the foundation of your whole program — every session, every focus area, every homework assignment starts from it. It needs to be done before your first tutoring session. Can we confirm right now: when are you going to sit down and complete it?"
[Get a specific date and time from the student. Log it. Move on — do NOT skip this confirmation.]

[If diagnostic IS complete:]
"I'm sharing my screen now — can you both see this?"

[Wait for yes.]

"So the first thing I want to walk you through is the diagnostic. This tells us exactly where {{studentFirstName}} stands right now and where we're going to focus the program. The composite came in at {{currentScore}}."

[Scroll to domain breakdown — R&W first, then Math]

"In reading and writing, we can see Craft and Structure, Information and Ideas, Standard English Conventions, and Expression of Ideas. In math, we've got Algebra, Advanced Math, Problem Solving, and Geometry."

"The biggest opportunity right now is in [lowest domain]. That's where the most points are — and that's where your tutor is going to focus first."

"To be straight with you — going from {{currentScore}} to {{targetScore}} is a real gain. Absolutely doable, but it requires work every single day. We'll cover that."

"Your tutor will go through every question on this diagnostic in the first session — not just what was wrong, but why."

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

[If tutor IS assigned:]
"Your tutor is {{tutorName}}. {{tutorName}} scored {{tutorScore}} on the SAT and has been trained through our system. We matched {{tutorName}} to {{studentFirstName}} specifically based on the diagnostic — the areas {{studentFirstName}} needs to work on are {{tutorName}}'s strengths."

[If tutor is NOT yet assigned:]
"We're finalizing your tutor match right now. The match is made specifically based on {{studentFirstName}}'s diagnostic results — we want to get it exactly right. You'll hear from me within 1–2 business days with a full introduction: your tutor's name, their SAT score, and exactly why we matched them to {{studentFirstName}}. The schedule you just confirmed stays in place — the only thing changing is confirming who the tutor is."
[Do not end the call without giving a specific date by which they'll hear back. Log the pending match in GHL.]

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

[If tutor is assigned:]
"First session is {{session1Day}} at {{session1Time}} with {{tutorName}}. Zoom link will be in your email and in the Calendar tab on the platform."
"I'll call you right after the session, {{studentFirstName}}. Weekly check-ins start next week — {{studentFirstName}} at {{weeklyCheckinStudent}}, {{parentFirstName}} at {{weeklyCheckinParent}}."

[If tutor is NOT yet assigned:]
"I'll be in touch within 1–2 business days with your tutor confirmation. The schedule is locked — {{session1Day}} at {{session1Time}} is your first session slot. I'll send everything over as soon as the match is confirmed."

"Any questions before we hang up?"

[Give real space. Don't rush the end.]

"Talk to you soon. Don't forget the Desmos Mastery Course in the meantime."

---

### COMMON PARENT QUESTIONS — Onboarding Call

[Q: "How do we know if he's making progress?"]
"We measure progress two ways: daily homework completion in the platform — which I monitor every week — and practice test scores after each phase. Every 4–6 weeks you'll be on a Zoom with me going over the full score breakdown. You'll never be left guessing."

[Q: "What if {{studentFirstName}} doesn't click with the tutor?"]
"Tell me within the first two sessions and I'll make a switch. We've done it before and it's not a problem. The match matters more than saving face — if it's not clicking, we fix it fast."

[Q: "How does the guarantee work?"]
"The guarantee is in your contract with the details specific to your enrollment. I'm not the right person to walk through those specifics on this call — that's a conversation for Harshil, our founder. What I can tell you is: our job is to make sure you never need to use it, and that's what this whole program is built around."
[Do NOT elaborate on guarantee terms. Escalate to Harshil if pressed.]

[Q: "What if we need to reschedule a session?"]
"24 hours notice minimum — text me directly and I'll coordinate with the tutor. Same-day cancellations are treated as a late cancel and count against the attendance record. We try to reschedule within the same week so there's no gap."

[Q: "Can we add more sessions per week?"]
"That's a great sign that you're serious about this. Let me check tutor availability and the package — I'll have an answer for you within 24 hours."

[Q: "How long until we see score improvement?"]
"Meaningful score movement typically shows up after the first practice test — around 4–6 weeks in. The first phase is foundational: locking in concepts, building the error log, establishing a homework rhythm. Don't judge the first few weeks by scores — judge them by whether the work is getting done."

[Q: "What if the diagnostic isn't done yet?"]
"We cannot start tutoring sessions until the diagnostic is complete — it's the foundation the entire program is built on. I need {{studentFirstName}} to complete it by [specific date]. Sessions can't begin without it."`,
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

[If the session hasn't happened yet — student is still awaiting tutor match:]
"Hey {{studentFirstName}} — checking in while we finalize your tutor match. How are you feeling about getting started? Any questions before your first session?"
[Answer any questions, confirm the schedule is in place, and close. Do not promise a specific tutor name unless it's confirmed.]

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

[If the student didn't connect with the tutor:]
"Got it — that's really helpful for me to know. Tell me more: was it the pace, the personality, the way things were explained?"
[Listen carefully. Do NOT dismiss it.]
"I'm going to keep a close eye on session 2. If session 2 feels the same, I'll bring it to our team and we'll get you into the right match. You don't have to just push through something that isn't working."
[Log it. If session 2 raises the same concern → escalate to Tanuj immediately.]

"You've got {{tutorName}} again on {{nextSessionDay}} at {{nextSessionTime}}, right?"

---

### Close (30 sec)

"I'll be checking in with you on {{weeklyCheckinDay}}. Anything before then, just text me."

---

### COMMON QUESTIONS — Post-Session 1

[Q: "Is it normal to feel confused after the first session?"]
"Completely normal. The first session is diagnostic review plus getting comfortable with the tutor and the platform. Confusion in session 1 almost always clears up by session 3. Do the homework, use the error log, and let it settle."

[Q: "Should we be seeing improvement already?"]
"Not yet — and that's expected. Score movement comes after a phase of consistent work, not after one session. What matters right now is: was the homework assigned, and is {{studentFirstName}} going to do it?"

[Q: "The tutor moved too fast / too slow — is that normal?"]
"Good feedback. Pacing adjusts after the first session once the tutor gets a feel for your level. Tell me specifically what felt off and I'll pass it to the tutor before session 2."`,
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
[If they say "I haven't been doing the homework"] → flag immediately. Set a specific deadline before ending the call: "Can you get it done by [day]? I'll check in with you then."
[If they say "I don't really understand what the tutor is teaching"] → potential tutor mismatch. Log and monitor. If it's session 3+, escalate to Tanuj.
[If they give short, vague answers] → dig one level deeper: "Is everything okay outside of school stuff too?"
[If they mention stress, anxiety, or feeling overwhelmed] → validate first, then: "Let's make sure the program isn't adding to that pressure — what would help?"

---

### Close (1 min)

"You've got {{tutorName}} on {{nextSessionDay}} at {{nextSessionTime}}, right? Make sure the homework is done before then."

"Anything you need from me before the session?"

"Okay, I'll be calling your parent right after this. Talk soon."

---

### COMMON QUESTIONS — Weekly Student Check-in

[Q: "I've been really busy with school — can we reduce sessions?"]
"Let's not reduce sessions yet — that's the last lever I want to pull because momentum matters. What's the busiest week? I can temporarily adjust around a specific crunch and get back to normal after."
[Do NOT agree to a permanent reduction without escalating to Tanuj.]

[Q: "I feel like I'm not getting better."]
"That feeling is really common 3–6 weeks in. It doesn't mean you're not improving — it means the harder material has surfaced. Tell me specifically what feels stuck and I'll relay it to {{tutorName}}."

[Q: "I don't like the homework assignments — they feel random."]
"Good feedback. The assignments should connect directly to your error log — if they feel random, tell {{tutorName}} on the next session and also message them in the Collaboration tab. I'll follow up."

[Q: "Can I switch tutors?"]
"Tell me what's not working and I'll look into it. We don't rush tutor switches after one session — but if there's a real mismatch I'll escalate it to Tanuj and we'll get it sorted."`,
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

[If parent says "he hasn't been sitting down to do homework"] → flag immediately. Set an accountability plan: specific check-in day, parent confirms nightly.
[If parent says "we're not sure the tutor is a good fit"] → do not dismiss. Escalate to Tanuj.
[If parent says "we're thinking of pausing"] → do NOT try to fix it on this call. Say: "I hear you — let me loop in my team and get back to you within 24 hours with a plan." Then escalate to Tanuj immediately.
[If parent asks about the guarantee] → "The guarantee terms are in your contract. I'll connect you with Harshil who can walk through the specifics — I want to make sure you get the right answer, not a rushed one."

---

### Close (30 sec)

"Next session with {{tutorName}} is on {{nextSessionDay}} at {{nextSessionTime}}. I'll be checking in with {{studentFirstName}} again next week."

"If anything comes up before then, text me directly and I'll get back to you within 12 hours."

---

### COMMON PARENT QUESTIONS — Weekly Check-in

[Q: "Why isn't the score going up faster?"]
"SAT score improvement follows a curve — the first 4–6 weeks are foundation building. Students who show strong upward movement at phase check-ins almost always had consistent homework completion in these early weeks. The question I'd ask is: is {{studentFirstName}} doing the daily practice? That's the single biggest predictor."

[Q: "How do I know if the sessions are actually helping?"]
"Three things to watch: Is the homework getting done? Is {{studentFirstName}} using the error log? Are they talking about what they worked on? If all three are yes, the program is working — the score will follow. If any are no, that's what we need to fix first."

[Q: "Can we see the session recordings?"]
"Session recordings are in the Collaboration tab under the relevant session — {{studentFirstName}} can access them anytime. I'd actually encourage you to watch one with them — it's great context for what they're working on."

[Q: "We're thinking of adding more sessions."]
"Great instinct. Let me check tutor availability and package options and get back to you within 24 hours with specifics."

[Q: "What if my kid doesn't do the homework?"]
"That's the most important variable in the whole program — more important than sessions. If it's not happening at home, I need to know. Here's what I want to try: you confirm homework is done before dinner, and I'll check completion in the platform every Monday. If I see a gap, I'll call you the same day."

[Q: "Can we switch tutors?"]
"If there's a genuine mismatch, we fix it — that's better than a bad fit dragging on. Tell me what specifically isn't working and I'll escalate it to our team today."
[Do NOT promise a switch without Tanuj's approval. But acknowledge it fully and don't dismiss.]

[Q: "How does the refund or cancellation process work?"]
"That's a conversation for Harshil — I want to make sure you get accurate information, not a guess from me. Can I have him reach out to you directly?"
[Do NOT discuss refund amounts or policy on this call. Escalate immediately.]`,
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

"Any questions before we wrap up?"

---

### COMMON PARENT QUESTIONS — Phase Check-in

[Q: "This score isn't what we expected. Are we falling behind?"]
[If on track:] "You're actually right where the trajectory puts you. SAT scores don't move linearly — the biggest jumps usually come in the final phase once all the foundational work is locked in."
[If behind:] "I want to be honest with you — we are behind the pace we need for {{targetScore}} by {{testDate}}. Here's exactly what changes in phase {{nextPhaseTopics}}. I'm monitoring this closely and if we don't see the right movement by the next test, I'll bring in Tanuj to review the plan."

[Q: "How many more sessions do we need to hit the target?"]
"Based on where {{studentFirstName}} is right now, I'd estimate [X] more sessions through {{testDate}}. That's roughly [Y] hours. If you're close to the end of the package, let's make sure we plan that out now so there's no gap."

[Q: "Should we switch tutors before the next phase?"]
"That's worth discussing seriously. Tell me what specifically isn't working and I'll bring it to Tanuj. Mid-program tutor switches can work well if done quickly — dragging it out is the thing to avoid."

[Q: "Is {{studentFirstName}} actually doing the work between sessions?"]
"I can check homework completion right now — [pull up platform]. Here's what I'm seeing. [Share data.] If the completion rate is low, that's our focus before anything else — more sessions don't help if the in-between work isn't happening."`,
    sopPoints: [
      'Pull practice test scores from platform before the call. Calculate point gain from diagnostic.',
      'Get a verbal update from the tutor before the call: "How did the phase go? What are you focusing on next?"',
      'Share screen with score breakdown. Celebrate improvements explicitly — don\'t just rush to the gaps.',
      'If trajectory is off: be direct. Never lie about where they stand.',
      'If behind pace: escalate to Tanuj the same day after the call.',
      'If parent asks about guarantee: do NOT discuss details. Say "Harshil will be in touch with specifics."',
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

[Escalate to Tanuj and Harshil immediately after the call with: student name, score, target, what was observed.]

---

### COMMON QUESTIONS — SAT Day / Results

[Q: "What if the score comes back lower than the last practice test?"]
"That happens — official SAT conditions are different from practice: time pressure, real stakes, different testing environment. It doesn't erase the prep. Let me see the full breakdown before we draw any conclusions, and I'll get back to you within 24 hours with a clear picture."

[Q: "Can they retake it?"]
"Yes. The next available date and registration timeline is something to map out now. I'll pull up the College Board calendar and send you the options. Taking it again after this program means they're going in with all the same preparation — the outcome is usually better the second time."
[Do NOT promise improved scores. Escalate to Tanuj for continued program decisions.]

[Q: "What happens with the guarantee now?"]
"That's a conversation for Harshil — he'll be in touch within 24 hours with specifics on next steps. I don't want to give you incomplete information on something that important."
[Do NOT discuss guarantee specifics. Escalate to Harshil immediately.]

[Q: "Should we do more sessions before the retake?"]
"Let me get you a recommendation from the team based on the score breakdown. I'll have that for you within 24 hours."
[Escalate to Tanuj for retake program decisions.]`,
    sopPoints: [
      'Pre-SAT: reach out 3–5 days before the test date. Keep it short — logistics + pep talk + "text me after."',
      'Results call: pull full score report, calculate point gain from diagnostic, get tutor brief before the call.',
      'If hit target: celebrate first, then handle program close-out — never skip the emotional moment.',
      'If missed target: do NOT commit to anything on this call. Escalate to Tanuj + Harshil same day.',
      'Do not move to Completed or Guarantee Case without founder confirmation.',
      'If parent asks about guarantee on results call: "Harshil will be in touch within 24 hours with next steps."',
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
      'Common stated reasons and what they usually mean: "Too expensive" = not seeing progress. "Too busy" = schedule not working or motivation dropped. "Sessions aren\'t helping" = tutor fit issue or homework not done. "Want to pause" = unsure, not committed to cancelling.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. RENEWAL CONVERSATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'renewal',
    title: 'Renewal Conversation',
    duration: '10–15 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'studentFirstName', label: 'Student First Name', autoFillKey: 'studentFirstName' },
      { key: 'parentFirstName',  label: 'Parent First Name',  autoFillKey: 'parentFirstName'  },
      { key: 'hoursRemaining',   label: 'Hours Remaining',    autoFillKey: 'hoursRemaining'   },
      { key: 'currentScore',     label: 'Current Score',      autoFillKey: 'currentScore'     },
      { key: 'targetScore',      label: 'Target Score',       autoFillKey: 'targetScore'      },
      { key: 'testDate',         label: 'SAT Test Date',      autoFillKey: 'startDate', placeholder: 'e.g. December 5th' },
      { key: 'sessionsRemaining', label: 'Sessions Remaining', placeholder: 'e.g. 3' },
      { key: 'renewalPackage',   label: 'Renewal Package',    placeholder: 'e.g. 20h / 30h'  },
    ],
    script: `### Open (1–2 min)

"Hey {{studentFirstName}}, quick check-in — I was looking at your account and noticed you're getting close to the end of your current package."

[Keep it warm, not alarming. This is a proactive conversation, not a hard sell.]

---

### Bridge to Results (2–3 min)

"You've made real progress — you're at {{currentScore}} and the target is {{targetScore}}. We still have work to do and I want to make sure there's no gap in momentum."

"You have about {{hoursRemaining}} hours left — roughly {{sessionsRemaining}} sessions. That's not a lot of runway."

[Acknowledge the progress explicitly. Then connect the urgency to the score gap, not just the hours.]

---

### Present Renewal (2–3 min)

"We typically recommend students renew before they hit zero so there's no gap in sessions. A break in momentum — even a week or two — can set back a lot of the work we've put in."

"The package I'd recommend for where {{studentFirstName}} is right now is {{renewalPackage}}. That gets us through to {{testDate}} with enough sessions to hit the target and complete the final practice test review."

[If the student or parent asks about cost:]
"I completely understand. Here's what I want you to think about — the score gap right now is [targetScore - currentScore] points. If we stop here, that gap stays. The cost of the package is a fraction of what another test cycle, retake prep, or a missed college deadline would cost."

---

### Handle Objections (2–3 min)

[If cost concern:]
"I hear you on the cost. Let me be direct — stopping now with {{hoursRemaining}} hours left is actually the worst place to stop. {{studentFirstName}} has built real momentum. Walking away at this point means starting over if they come back."

[If test is coming up soon:]
"That's exactly why I'm calling now. The test is {{testDate}}. If we wait until the hours run out before renewing, there's a scheduling delay. We need continuity all the way to test day."

[If 'we need to think about it':]
"Of course — I don't want you to rush. But I do want to be upfront: once the hours hit zero, sessions stop. I'd rather us have this conversation now so there's no interruption. Can we lock in a decision by [day]?"

---

### Close (1 min)

"Can I get a yes from you today so I can make sure the schedule stays uninterrupted for {{studentFirstName}}?"

[If yes → confirm next steps: payment link, continuation of schedule.]
[If unsure → set a specific follow-up date. Do not leave it open-ended.]

---

### COMMON OBJECTIONS — Renewal

[Q: "We want to wait until after the next test to decide."]
"I understand the instinct — but here's the problem: if we wait until after the test, there's a gap between the result call and the next prep cycle. That gap costs momentum. If the score is good, great — we stop. If it's not, we're already behind. Can we put a tentative renewal in place now with the option to cancel after the test if everything goes perfectly?"

[Q: "We're going to try self-studying for a bit."]
"Self-study works for some students — usually the ones who are already consistent on homework and have a clear study plan. Is {{studentFirstName}} in that category right now? If the homework compliance has been inconsistent, self-study usually leads to less progress, not more."

[Q: "Can we just buy a smaller package to get through the test?"]
"Absolutely — let me figure out what makes sense based on how many sessions {{studentFirstName}} needs to reach {{targetScore}} by {{testDate}}. I'd rather right-size it than oversell. Give me 24 hours to come back with the right number."
[Do NOT quote a price. Coordinate with Harshil.]

[Q: "Does the guarantee extend if we renew?"]
"That's a question for Harshil — he handles the contract side. I don't want to give you wrong information. I'll have him reach out today."`,
    sopPoints: [
      'Initiate this call when hours remaining hits 5 or below — do not wait for GHL to move the student to Low Hours.',
      'Know the numbers before the call: hours remaining, sessions remaining, current vs. target score.',
      'Lead with progress and momentum — not the expiration. The goal is continuity, not a transaction.',
      'Never quote a specific price on the first call — say "the package I\'d recommend" and let Harshil handle the actual payment.',
      'If they want to think about it: set a specific follow-up date, not "whenever you\'re ready."',
      'Log outcome in GHL immediately: renewed / considering / declined.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. WEEKLY PARENT UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'parent-update',
    title: 'Weekly Parent Update',
    duration: '5 min',
    tallyUrl: 'https://tally.so/r/BzvYE1',
    prepCardFields: [
      { key: 'parentFirstName',   label: 'Parent First Name',   autoFillKey: 'parentFirstName'  },
      { key: 'studentFirstName',  label: 'Student First Name',  autoFillKey: 'studentFirstName' },
      { key: 'sessionsCompleted', label: 'Sessions This Week',  placeholder: 'e.g. 2'           },
      { key: 'tutorName',         label: 'Tutor Name',          autoFillKey: 'tutorAssigned', placeholder: 'e.g. Arjun' },
      { key: 'nextSessionDay',    label: 'Next Session Day',    placeholder: 'e.g. Wednesday'  },
      { key: 'nextSessionTime',   label: 'Next Session Time',   placeholder: 'e.g. 5:00 PM'    },
      { key: 'statusSummary',     label: 'Status (On Track / Slight Concern / Red Flag)', placeholder: 'On Track', wide: true },
      { key: 'actionItem',        label: 'One Action Item / Thing to Watch', placeholder: 'e.g. Review error log before Wednesday', wide: true },
    ],
    script: `### Open (30 sec)

"Hi {{parentFirstName}}, quick weekly update on {{studentFirstName}}."

---

### Session Recap (1 min)

"This week, {{studentFirstName}} completed {{sessionsCompleted}} session(s) with {{tutorName}}."

[If a session was missed:]
"One session was missed this week — I'm following up on that."

[If attendance was perfect:]
"Attendance was perfect this week — that's exactly what we need."

---

### Progress Pulse (1–2 min)

[If On Track:]
"Overall {{studentFirstName}} is on track. The work is getting done and the sessions are productive."

[If Slight Concern:]
"There's a small concern I want to flag — {{statusSummary}}. It's not a red flag yet, but I'm keeping a close eye on it and will have an update next week."

[If Red Flag:]
"I want to be upfront with you — {{statusSummary}}. I'm going to be checking in with {{studentFirstName}} directly this week and will loop you in on what I find."

---

### One Action Item (30 sec)

"One thing to watch for this week: {{actionItem}}."

---

### Confirm Next Session (15 sec)

"Next session with {{tutorName}} is on {{nextSessionDay}} at {{nextSessionTime}}."

---

### Close (15 sec)

"We're on top of it — any questions from your end?"

[If they have questions → answer or log and follow up within 24h.]
[If no questions → close cleanly.]

"Talk soon."`,
    sopPoints: [
      'Keep it under 5 minutes. Parents want a quick signal, not a full briefing.',
      'Lead with sessions completed this week — it anchors the call in data.',
      'Match the tone to the status: calm if On Track, measured if Slight Concern, direct if Red Flag.',
      'One action item max — more than one creates confusion, not accountability.',
      'If parent raises a concern you can\'t resolve on the call: "I\'ll look into that and get back to you by [day]."',
      'If parent mentions pausing, cancelling, or a refund: do NOT address it here. Say "Let me get the right person involved and have them reach out within 24 hours." Then escalate to Tanuj.',
      'Log parent update in GHL immediately after. Mark parent update done in SSC dashboard.',
    ],
  },
];
