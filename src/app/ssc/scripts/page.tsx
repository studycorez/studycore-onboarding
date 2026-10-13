'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const AUTH_KEY = 'sc_auth';
const PASSWORD = 'StudyCore25';

type Tab = 'onboarding' | 'post-session-1' | 'weekly-checkin' | 'phase-checkin' | 'flags' | 'faqs';

function Stage({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 italic mt-1 mb-2">{children}</p>;
}
function Script({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border-l-2 border-blue-300 px-4 py-2.5 rounded-r-lg my-2 text-sm text-gray-800 leading-relaxed">
      {children}
    </div>
  );
}
function SectionHead({ num, title, time }: { num: string; title: string; time?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6 first:mt-0">
      <span className="bg-[#1e2090] text-white text-xs font-bold px-2 py-1 rounded">{num}</span>
      <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      {time && <span className="text-xs text-gray-400 ml-auto">{time}</span>}
    </div>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 my-2">
      {children}
    </div>
  );
}
function RedFlag({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800 my-1.5">
      {children}
    </div>
  );
}

// ─── TAB CONTENT ──────────────────────────────────────────────────────────────

function OnboardingScript() {
  return (
    <div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-xs">
        <p className="font-semibold text-gray-700 mb-2">Pre-call checklist — fill in before you dial</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
          <div>□ Hours purchased → sessions/week</div>
          <div>□ Test date (from GHL or intake form)</div>
          <div>□ Diagnostic scores (domain breakdown)</div>
          <div>□ Availability from intake form</div>
          <div>□ Tutor name + score (if matched)</div>
          <div>□ Logged in as student on platform</div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200 text-gray-600">
          <span className="font-medium text-gray-700">Sessions/week formula:</span>{' '}
          hours purchased ÷ weeks until test ÷ 1.5 (round down). Use this number in Part 4 — never default to "2/week."
        </div>
      </div>

      {/* Part 1 */}
      <SectionHead num="1" title="Open" time="2 min" />
      <Stage>Both student and parent should be on the call. If only one is on, ask to wait for the other before starting.</Stage>
      <Script>
        "Hey [student first name], [parent first name] — this is [your name] from StudyCore. How's everyone doing today?"
      </Script>
      <Stage>Let them respond briefly. Don't rush past this.</Stage>
      <Script>
        "Perfect. So we've got about 30 minutes together today and I want to make the most of it. By the end of this call, you're going to know exactly what [student]'s plan looks like, how the platform works, when sessions are, and what's expected from everyone. Zero open questions by the time we hang up — that's the goal."
      </Script>
      <Script>
        "Before we dive in — can I ask both of you to put everything else down? No other tabs, no other conversations. This is the most important call in the whole program. Everything that goes well from here starts with this conversation."
      </Script>
      <Stage>Pause. Wait for them to confirm.</Stage>
      <Script>"Great. Let's get into it."</Script>

      {/* Part 2 */}
      <SectionHead num="2" title="Diagnostic Review" time="3–4 min" />
      <Stage>Share your screen — you should be logged into the student's platform account.</Stage>
      <Script>
        "Okay I'm sharing my screen now — you should see [student]'s dashboard. Can you both see this?"
      </Script>
      <Stage>Wait for confirmation.</Stage>
      <Script>
        "So the first thing I want to walk you through is the diagnostic. This is what tells us exactly where [student] stands right now and where we're focusing the program. The composite score came in at [score]."
      </Script>
      <Script>
        "Now let me break that down because the composite alone doesn't tell you much. Here's what it looks like by section —"
      </Script>
      <Stage>Walk through Math domains: Algebra, Advanced Math, Problem Solving and Data, Geometry. Then R&W: Craft and Structure, Information and Ideas, Standard English Conventions, Expression of Ideas.</Stage>
      <Script>
        "So looking at this, [student]'s biggest opportunity right now is [weakest domain]. That's where there's the most points to gain. The [stronger domain] is already solid — we're going to build on that, not ignore it, but the biggest lever is [weak area]."
      </Script>
      <Script>
        "And to be straight with you — going from [current score] to [target score] is a [X]-point gain. That is very doable. Students hit that range and beyond all the time through this program. But I want to be honest that it requires real work, not just showing up to sessions. We'll get to that in a minute."
      </Script>
      <Script>
        "[Student], your tutor is going to go through every single question on this diagnostic with you in your first session. Not just the answers — the reasoning behind each one. That's how you start turning wrong answers into right answers."
      </Script>
      <Script>"Any questions on the diagnostic before we move on?"</Script>
      <Stage>Answer any questions. Keep it brief.</Stage>

      {/* Part 3 */}
      <SectionHead num="3" title="Platform Walkthrough" time="5–7 min" />
      <Stage>Stay on screen share, logged in as the student. Ask the student to open the platform on their own screen and follow along.</Stage>
      <Script>
        "Alright, [student] — go ahead and open the platform on your end too so you can follow along. studycore.net — do you have it?"
      </Script>
      <Stage>Wait for them to load it.</Stage>
      <div className="space-y-1.5 my-2">
        {[
          ['Dashboard', 'Your home base. Overall progress, assigned assessments, quick start button. You\'ll land here every time you log in.'],
          ['Assessments tab', 'This is the most important tab for your day-to-day. Every piece of homework your tutor assigns shows up here. Check this every single day.'],
          ['My Questions tab', 'Critical. This is your error log. Every question you got wrong anywhere in the program gets logged here. Come back to this regularly.'],
          ['Courses tab', 'Mainly for beginners. One course you\'re going to complete is the Desmos Mastery Course. Desmos is the calculator built into the SAT — most students don\'t know how to use it. Every student in this program completes that course.'],
          ['Calendar tab', 'All your Zoom session links live here, plus homework due dates. You don\'t need to dig through emails.'],
          ['Collaboration tab', 'Direct line to your tutor between sessions. Stuck on homework? Message them here, don\'t wait for the next session.'],
          ['Support tab', 'Third option for reaching us. First option is always texting me directly.'],
        ].map(([tab, desc]) => (
          <div key={tab} className="flex gap-3 text-sm">
            <span className="font-semibold text-[#1e2090] shrink-0 min-w-[140px]">{tab}:</span>
            <span className="text-gray-700">{desc}</span>
          </div>
        ))}
      </div>
      <Note>
        <strong>Revenge Test</strong> — in My Questions, student selects wrong questions → Create Revenge Test → retakes just those questions until they get them right. Walk them through this live.
      </Note>
      <Script>
        "Okay — [student], do you know where to find your homework?"
      </Script>
      <Stage>Wait. → "Where's the error log?" → Wait. → "And where do you find the Zoom link for your session?" → Wait. If they hesitate on any of these, walk back through it.</Stage>
      <Script>"Perfect. Any other questions on the platform?"</Script>

      {/* Part 4 */}
      <SectionHead num="4" title="Schedule Confirmation" time="3–4 min" />
      <Note>
        Come in with a specific proposal. Never ask "what works for you?" open-ended. Know sessions/week from hours purchased before you dial.
      </Note>
      <Script>
        "Alright — let's lock in the schedule. I've got your intake form in front of me. It looks like [student] is available [days/times from intake] — is that still accurate for both of you?"
      </Script>
      <Stage>Let them confirm or adjust. Update mentally, then propose.</Stage>
      <Script>
        "Got it. Based on your program, we're targeting [X sessions per week] — [framing: e.g., 'you've got 16 hours over about 4 weeks, so we'll do two a week to hit that']. What if we did [proposed day] at [proposed time] and [proposed day] at [proposed time]? Does that work for both of you?"
      </Script>
      <Stage>Pause. Wait for both student AND parent to confirm. Don't move on with just one yes.</Stage>
      <Stage>If the proposed times don't work: "No problem — let me give you two other options. [Option A] or [Option B]. Which works better?" Keep proposing until locked.</Stage>
      <Script>
        "Perfect. First session is [confirmed day] at [confirmed time] with [tutor name]. Zoom link will be in your email and in the Calendar tab on the platform."
      </Script>

      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variant: Tutor not matched yet</p>
        <Script>
          "We're finalizing the tutor match now based on the schedule we just confirmed. You'll get a confirmation from me today with the tutor's name and their SAT score. They'll have your diagnostic already so they walk into session one ready to go."
        </Script>
        <Stage>After the call: immediately flag to Harshil / QCM to complete the match. Same-day confirmation to the family.</Stage>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3">Variant: Tight timeline (test within 4 weeks)</p>
        <Script>
          "Given how close your test date is, we need to move fast. Can you give me your full availability — every day this week and next that could work, even one-offs?"
        </Script>
        <Stage>Get a list of available days/times. Pack in as many sessions as possible. Override standard cadence.</Stage>
      </div>

      {/* Part 5 */}
      <SectionHead num="5" title="Tutor Introduction" time="1 min" />
      <Script>
        "Your tutor is [first name]. [He/She] scored a [tutor score] on the SAT and has been trained through our system. We matched [tutor first name] to [student] specifically based on the diagnostic — the domains [student] needs to work on are areas [he/she] is strong in."
      </Script>
      <Script>
        "You're going to meet [tutor first name] in your first session on [date]. I'll reach out right after that session ends to see how it went."
      </Script>

      {/* Part 6 */}
      <SectionHead num="6" title="Post-Session 1 Call" time="1 min" />
      <Stage>Say this with intention, not as a footnote. You're creating an accountability loop.</Stage>
      <Script>
        "One more thing — I'm going to call you right after your first session, [student]. So if the session ends at [time], expect my call around [time + 10]. It's a quick five minutes — I just want to hear from you directly while it's fresh. How the session felt, how [tutor name] was, whether you know what you need to do before the next one."
      </Script>
      <Script>
        "I do this for every student after session one. It's one of the most useful calls we have."
      </Script>
      <Script>"So be available right after that session — don't run off."</Script>

      {/* Part 7 */}
      <SectionHead num="7" title="Expectations" time="5–6 min" />
      <Note>Most important part of the call. Do not rush. You are not reading a list — you are getting real verbal commitments.</Note>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-1">To the student:</p>
      <Script>
        "Okay — I want to spend a few minutes on what this actually takes. Because I've seen students get the exact same program and have completely different results. The difference is always the same thing."
      </Script>
      <Script>
        "[Student], here's what I need from you. Thirty to forty-five minutes of independent practice every single day. Not every other day — every day. That's homework your tutor assigns, error log review, revenge tests. The sessions are where you learn. The daily practice is where it gets locked in. You can't skip it and expect the sessions alone to move your score."
      </Script>
      <Script>
        "Show up to every session. If something comes up and you need to reschedule, give us 24 hours notice. A no-show wastes your tutor's time and one of your paid sessions."
      </Script>
      <Script>
        "And this one is important: if anything feels off at any point — if sessions feel too easy, if homework is unclear, if you don't feel like you're clicking with your tutor — text me directly. Same day. Don't wait for the weekly check-in. I can't fix something I don't know about."
      </Script>
      <Script>"Can I get your commitment on all of that right now?"</Script>
      <Stage>Wait for a real yes. Not just "yeah" — make sure it lands.</Stage>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-1">To the parent:</p>
      <Script>
        "[Parent name] — here's what I need from you. On the days when [student] doesn't feel like doing the homework, when motivation dips, when school gets busy and SAT prep feels like the easiest thing to push off — that's when your accountability matters most."
      </Script>
      <Script>
        "Our team monitors homework completion weekly. If I see [student] is falling behind, I will call you. And I need to know you'll back that up at home."
      </Script>
      <Script>
        "One missed session per week is 25% of your tutoring time gone. That math catches up fast."
      </Script>
      <Script>"Can I count on you for that?"</Script>
      <Stage>Wait for a yes.</Stage>
      <Script>"I appreciate that. Both of you showing up fully is what makes this work."</Script>

      {/* Part 8 */}
      <SectionHead num="8" title="Communication Expectations" time="2 min" />
      <Script>
        "Day-to-day questions — schedule, homework, anything — text me directly. I get back within 12 hours, same day for anything urgent."
      </Script>
      <Script>
        "I also do a weekly check-in call with both of you separately. It's five to ten minutes, just a quick pulse check — how sessions are going, how the homework's feeling, anything to address."
      </Script>
      <Script>
        "[Student] — what time works for you on [day] for a quick call? Give me a time that's reliable every week."
      </Script>
      <Stage>Lock in a specific time. Write it down.</Stage>
      <Script>
        "[Parent name] — same question, what time works for you? I'll call [student] first, then you."
      </Script>
      <Stage>Lock in a specific time. Write it down.</Stage>
      <Script>
        "Perfect. I'm blocking those in right now. The other check-in is after every practice test — that's a Zoom call, 20 to 30 minutes, you'll both be on it together. That's where we go over the full score breakdown and what we're focusing on next."
      </Script>

      {/* Part 9 */}
      <SectionHead num="9" title="Commitment Close" time="2 min" />
      <Script>
        "Okay — let me just bring this all together. [X] sessions per week. Thirty to forty-five minutes of independent practice every day. Practice tests at the end of every phase. Weekly check-in with me. That's the formula."
      </Script>
      <Script>
        "We don't measure success by how good sessions feel. We measure it by score movement. Some sessions are going to be hard. [Student] is going to hit walls. That's not a sign that something's wrong — that's actually the sign it's working."
      </Script>
      <Script>"[Student] — are you ready to get started?"</Script>
      <Stage>Wait for a yes.</Stage>
      <Script>"[Parent name] — do you feel good about the plan?"</Script>
      <Stage>Wait for a yes.</Stage>
      <Script>"Good. I'm looking forward to this."</Script>

      {/* Part 10 */}
      <SectionHead num="10" title="Close" time="1 min" />
      <Script>
        "Alright — a couple last things. First session is [day] at [time] with [tutor name]. The Zoom link will be in your email and also in the Calendar tab on the platform."
      </Script>
      <Script>
        "I'll call you, [student], right after that session. And then our weekly check-ins start [next week], [student] at [time] and [parent] at [time]."
      </Script>
      <Script>"Any questions at all before we hang up?"</Script>
      <Stage>Give real space here. Don't rush to end.</Stage>
      <Script>"Perfect. I'll talk to you soon. Go check out that Desmos course in the meantime."</Script>
    </div>
  );
}

function PostSession1Script() {
  return (
    <div>
      <Note>
        <strong>Purpose:</strong> Rapid feedback loop. Not a full check-in. Goal: confirm the tutor relationship started well, catch any friction before it sets in, reinforce commitment in the first 24 hours.
      </Note>
      <Stage>Call right after session ends — if session ends at 6pm, call at 6:10. You set this up on the onboarding call so they're expecting it.</Stage>

      <SectionHead num="1" title="Open" time="1 min" />
      <Script>"Hey [name], how did it go?"</Script>
      <Stage>Keep it warm and low-pressure. This is a "how was your day" call, not a formal review.</Stage>

      <SectionHead num="2" title="Core Questions" time="3–4 min" />
      <div className="space-y-1.5 my-2">
        {[
          '"What did you work on?"',
          '"How did you feel about [tutor name]? Did it click?"',
          '"Did they assign homework? Do you know what you need to do before the next session?"',
          '"Anything feel off — too fast, too slow, confusing?"',
        ].map((q, i) => (
          <div key={i} className="bg-blue-50 border-l-2 border-blue-300 px-4 py-2 rounded-r-lg text-sm text-gray-800">{q}</div>
        ))}
      </div>

      <SectionHead num="3" title="Reinforce" time="1–2 min" />
      <Script>"That's exactly what the first session should feel like. Do the homework before [next session day] and you're off to a great start."</Script>
      <Stage>If it was just okay:</Stage>
      <Script>"First sessions are always a bit of an adjustment. Give it one more before you decide anything — that's completely normal."</Script>
      <Script>"You've got [tutor] again on [day] at [time], right?"</Script>

      <SectionHead num="4" title="Close" />
      <Script>"I'll be checking in with you on [weekly check-in day]. Anything before then, just text me."</Script>

      <div className="mt-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Red Flags — Act Same Day</p>
        <div className="space-y-1.5">
          {[
            ['"The tutor didn\'t show"', 'See Tutor No-Show SOP immediately. Call Harshil.'],
            ['"I didn\'t really connect with them"', 'Log it. Monitor through session 2. If session 2 is the same, raise to Tanuj.'],
            ['"It was way too easy"', 'Log it. Brief QCM to relay to the tutor — pacing needs to go up.'],
            ['"I didn\'t understand anything"', 'Log it. Brief QCM — tutor needs to adjust pace.'],
            ['"I don\'t have any homework"', 'Flag to QCM — tutor should always assign homework after session 1.'],
            ['Student doesn\'t pick up', 'Call once more, then text. No response in 2 hours → text the parent.'],
          ].map(([flag, action]) => (
            <RedFlag key={flag}>
              <strong>{flag}</strong> — {action}
            </RedFlag>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
        <strong>After the call:</strong> Log in GHL (call completed, key takeaway, any flags). Fill out SSC check-in form — check-in type: Other. Status: Green unless flagged. If flagged: act same day.
      </div>
    </div>
  );
}

function WeeklyCheckinScript() {
  return (
    <div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700">Before the call:</p>
        <p>□ Pull up student on Operations Dashboard — note pipeline stage and sessions completed</p>
        <p>□ Check TQC dashboard for any recent session flags</p>
        <p>□ Check Slack for any recent alerts on this student</p>
        <p>□ Know: how many sessions? Any flags? Homework completion rate?</p>
        <p>□ Have SSC check-in form open and ready</p>
      </div>

      <SectionHead num="A" title="Student Call" time="5–10 min" />
      <Stage>Be warm and conversational, not scripted. Goal: know how the student is actually doing — not just the official version.</Stage>
      <Script>"Hey [name], it's [your name] from StudyCore. How's everything going?"</Script>
      <div className="space-y-1.5 my-2">
        {[
          '"How are you feeling about the sessions so far?"',
          '"Are you keeping up with the homework? Any parts that felt unclear or too hard?"',
          '"How\'s the vibe with [tutor name]? Clicking well?"',
          '"Anything that felt off this week — sessions, homework, anything?"',
          '"Are you using the error log and revenge tests after sessions?"',
        ].map((q, i) => (
          <div key={i} className="bg-blue-50 border-l-2 border-blue-300 px-4 py-2 rounded-r-lg text-sm text-gray-800">{q}</div>
        ))}
      </div>
      <Script>"You've got [tutor] on [day] at [time], right?"</Script>
      <Script>"Anything you need from me before then?"</Script>
      <Script>"Okay, I'll be calling [parent] right after this. Talk soon."</Script>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-semibold text-gray-500">Red flags to listen for:</p>
        {[
          ['"Sessions feel easy"', '→ tutor may not be pushing hard enough'],
          ['"I haven\'t been doing the homework"', '→ flag, escalate to action'],
          ['"I don\'t understand what the tutor is teaching"', '→ potential tutor mismatch'],
          ['Low energy, vague, short responses', '→ dig one level deeper before ending'],
        ].map(([flag, action]) => (
          <div key={flag} className="flex gap-2 text-xs text-gray-600">
            <span className="text-red-500 font-medium shrink-0">{flag}</span>
            <span>{action}</span>
          </div>
        ))}
      </div>

      <SectionHead num="B" title="Parent Call" time="5–10 min" />
      <Stage>Parents want reassurance and data. Give them both.</Stage>
      <Script>"Hi [parent name], it's [your name] from StudyCore. Just following up after my call with [student] — do you have a few minutes?"</Script>
      <div className="space-y-1.5 my-2">
        {[
          '"How do you feel [student] is settling into the program?"',
          '"Are they doing their homework consistently from what you can see?"',
          '"Any concerns from your side — about the schedule, the tutor, progress so far?"',
          '"Are they talking about the sessions at home? Positive or negative?"',
        ].map((q, i) => (
          <div key={i} className="bg-blue-50 border-l-2 border-blue-300 px-4 py-2 rounded-r-lg text-sm text-gray-800">{q}</div>
        ))}
      </div>
      <Script>"From our session data, [student] has completed [X] sessions and [status on progress]."</Script>
      <Script>"If anything comes up before next [check-in day], text me directly and I'll get back to you within 12 hours."</Script>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-semibold text-gray-500">Red flags to listen for:</p>
        {[
          ['"He hasn\'t been doing homework"', '→ immediate action, not just logging'],
          ['"We\'re not sure the tutor is a good fit"', '→ do not dismiss, escalate to Tanuj'],
          ['"We\'re thinking of pausing"', '→ do not try to save it yourself, escalate to Tanuj immediately'],
        ].map(([flag, action]) => (
          <div key={flag} className="flex gap-2 text-xs text-gray-600">
            <span className="text-red-500 font-medium shrink-0">{flag}</span>
            <span>{action}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700">After both calls:</p>
        <p>□ Fill out SSC check-in form for each student separately (one form per student)</p>
        <p>□ Log a note in GHL on the parent contact</p>
        <p>□ If any flags raised — act same day, don't let them sit</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Escalation Rules</p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <p className="font-semibold text-green-800 mb-1">Handle yourself</p>
            <p className="text-green-700">Homework issues (first offense) · Motivation dips · Scheduling questions · Student coaching</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            <p className="font-semibold text-yellow-800 mb-1">Escalate to Tanuj</p>
            <p className="text-yellow-700">Parent unhappy · 2+ missed sessions · Tutor mismatch · Score not moving after phase 1</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="font-semibold text-red-800 mb-1">Escalate to Harshil</p>
            <p className="text-red-700">Platform/access issues · Contract/billing questions · Founder-level decisions</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseCheckinScript() {
  return (
    <div>
      <Note>
        This is a 20–30 minute Zoom call with student AND parent together after each full-length practice test. Not a quick phone call — it's a structured review. The student books it themselves via booking link when the practice test is done.
      </Note>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700">Before the call:</p>
        <p>□ Pull practice test scores from platform (composite, Math, R&W)</p>
        <p>□ Compare to previous practice test and diagnostic — calculate point gain</p>
        <p>□ Note which domains improved and which are still lagging</p>
        <p>□ Get verbal update from tutor if possible: "How did the phase go? What are you focusing on next?"</p>
        <p>□ Have current score and target score visible</p>
      </div>

      <SectionHead num="1" title="Open" time="1–2 min" />
      <Script>"This is our phase check-in. We're going to go over the practice test results, what's working, what we're focusing on next, and make sure we're still on track for [target score] by [test date]."</Script>

      <SectionHead num="2" title="Score Review" time="5–7 min" />
      <Stage>Share your screen with the score breakdown.</Stage>
      <Script>"[Student] scored [X] on this practice test, up [Y] points from [last test / diagnostic]."</Script>
      <Stage>Walk through Math by domain, then R&W by domain. Celebrate improvements explicitly. Name remaining gaps honestly.</Stage>
      <Script>"Math Algebra is still at X% — that stays our focus going into phase [X+1]."</Script>

      <SectionHead num="3" title="Trajectory" time="3–4 min" />
      <Script>"We're right where we need to be. Here's what phase [X+1] looks like."</Script>
      <Stage>If trending short — be direct:</Stage>
      <Script>"At this pace, we're looking at [projected score] by [date]. To close that gap, here's what needs to change: [specific action]."</Script>
      <Note>Never lie about trajectory to make a parent feel better short-term.</Note>

      <SectionHead num="4" title="Tutor Feedback" time="2–3 min" />
      <Script>"Your tutor has said [X]. He's going to focus on [Y] in the next phase."</Script>

      <SectionHead num="5" title="Plan for Next Phase" time="3–4 min" />
      <Script>"Here's what the next phase looks like — [topics], [sessions planned], [what to do independently between sessions]. Any changes to the schedule we need to make?"</Script>

      <SectionHead num="6" title="Commitment Renewal" time="1–2 min" />
      <Script>"We've done [X] phases. You've put in the work and it shows. [Target score] by [date] is still the plan. We're going to get there."</Script>
      <Script>"Any changes in availability or anything we should know going into the next phase?"</Script>

      <SectionHead num="7" title="Close" />
      <Script>"Next session is [day] at [time]. Next phase check-in will be after the next practice test — booking link comes automatically. If anything comes up before then, text me directly."</Script>

      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700">After the call:</p>
        <p>□ Fill out SSC check-in form — type: Post-Practice Test / Phase Check-in</p>
        <p>□ Log score data in GHL contact note</p>
        <p>□ If trajectory is off — flag to Tanuj same day</p>
        <p>□ Update student pipeline stage in GHL if appropriate</p>
      </div>
    </div>
  );
}

function FlagsScript() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <p className="font-semibold text-yellow-800 text-sm mb-1">Yellow Flag</p>
          <p className="text-xs text-yellow-700">Reach out to student within <strong>24 hours</strong></p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="font-semibold text-red-800 text-sm mb-1">Red Flag</p>
          <p className="text-xs text-red-700">Reach out to student + notify Tanuj within <strong>2 hours</strong></p>
        </div>
      </div>

      <Note>Flags come from Slack #tqc-flags (tutor session reports) and your own check-in calls. Do not let flags sit. A flag you don't act on today becomes a cancellation next week.</Note>

      <SectionHead num="A" title="Yellow Flag Response" />
      <div className="space-y-1 text-sm text-gray-700 my-2">
        <p>1. Check #tqc-flags alert. Read tutor's notes carefully.</p>
        <p>2. Pull student up on Operations Dashboard. Any prior flags?</p>
        <p>3. Call or text student (not parent first): <span className="italic text-gray-500">"Hey [name], just checking in — I saw you had a session today. How did it go?"</span></p>
        <p>4. Listen for what's actually wrong. Don't lead with the flag.</p>
      </div>
      <div className="space-y-1.5 my-2">
        {[
          ['"Session felt hard"', '"That\'s actually a good sign — it means you hit something you haven\'t mastered yet. Stick with it."'],
          ['"Homework not done"', 'Set a specific deadline. "Can you get it done by [day]? I\'ll check in with you then."'],
          ['Student seems disengaged', 'Dig into why — motivation issue? Tutor mismatch? Life stress?'],
        ].map(([cause, response]) => (
          <div key={cause} className="flex gap-3 text-xs bg-gray-50 rounded-lg p-2 border border-gray-200">
            <span className="font-medium text-gray-700 shrink-0 min-w-[140px]">{cause}</span>
            <span className="text-gray-600">{response}</span>
          </div>
        ))}
      </div>

      <SectionHead num="B" title="Red Flag Response" />
      <div className="space-y-1 text-sm text-gray-700 my-2">
        <p>1. See alert in #tqc-flags. Act immediately.</p>
        <p>2. Call the student (not text). If no answer, call the parent.</p>
        <p>3. If no answer from either — text both and notify Tanuj the same hour.</p>
        <p>4. Tutor quality issue → notify Tanuj + QCM immediately.</p>
        <p>5. Student-side issue → handle the student call yourself, then brief Tanuj.</p>
        <p>6. Document everything in GHL and SSC check-in form before end of day.</p>
      </div>

      <SectionHead num="C" title="Homework Non-Completion" />
      <div className="space-y-2 text-xs text-gray-600 my-2">
        <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
          <p className="font-semibold text-gray-700">First offense:</p>
          <p>Call/text student: "Hey [name], I noticed homework wasn't submitted this week. What happened?" Set specific deadline. Log as resolved if they follow through.</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-2 border border-yellow-200">
          <p className="font-semibold text-yellow-800">Second offense (within 2 weeks):</p>
          <p className="text-yellow-700">Call the parent: "I want to loop you in — [student] has missed homework two weeks in a row. I need your help with this." Set joint accountability plan. Flag to Tanuj.</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 border border-red-200">
          <p className="font-semibold text-red-800">Third offense / pattern:</p>
          <p className="text-red-700">Escalate to Tanuj. This is a retention risk.</p>
        </div>
      </div>

      <SectionHead num="D" title="Escalation Message Format" />
      <div className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 font-mono mt-2">
        <p>Student: [name]</p>
        <p>Parent: [name]</p>
        <p>Stage: [current pipeline stage]</p>
        <p>Issue: [one sentence]</p>
        <p>What I've done so far: [steps taken]</p>
        <p>What I need: [specific decision or action]</p>
      </div>
    </div>
  );
}

function FAQScript() {
  const faqs = [
    [
      "Does she need any books?",
      "The platform has everything she needs. Khan Academy is great for video explanations if something doesn't click. Princeton Review is fine for extra practice — but always prioritize what the tutor assigns first. Don't add more material, just do the assigned work well.",
    ],
    [
      "Can she take the November SAT?",
      "We never close that door. After phase one we'll have real data — a practice test score to look at. If she's tracking toward the target, November absolutely becomes an option. If we need more time, December is the plan. We'll make that call together after phase one, not now.",
    ],
    [
      "How often does she take practice tests?",
      "One full-length practice test at the end of each phase — that's roughly every three to four weeks. Between phases, section tests (just math or just R&W) every week and a half or so. And after each topic is covered in a session, a short module test on just that topic. It builds up gradually.",
    ],
    [
      "What does the homework look like?",
      "It's targeted drills assigned specifically by the tutor based on what was covered in the session. It's not a full-length test every night — it's broken into focused 45-minute blocks spread across the days between sessions. Designed to be sustainable, not overwhelming.",
    ],
    [
      "What if she misses a session?",
      "We ask for 24 hours notice so we can reschedule. Tutors have other students and last-minute gaps are hard to fill. If something urgent comes up, text me directly and I'll coordinate. We always find a makeup time — the key is communicating ahead of time, not after.",
    ],
    [
      "Is it the same SAT for every school? Does the score transfer?",
      "Yes — it's one standardized test and every US college accepts the same score. You take it once and send it to as many schools as you want. There's no school-specific version. The only thing that varies is each school's score expectations.",
    ],
    [
      "Can she take it more than once?",
      "Yes, absolutely. Most students take it two or three times. A lot of colleges use superscoring — they take your highest Math score from one sitting and your highest R&W from another and combine them. So retaking almost always helps, never hurts. That's part of why we plan for two test dates from the start.",
    ],
    [
      "What if she has test anxiety?",
      "That's something the program addresses directly. Part of what the tutor builds in sessions is timed practice under realistic conditions — by test day, the format is completely familiar. Most students find anxiety drops a lot once they've done enough full-length practice under pressure. If it's severe, we'll flag it and work with you separately.",
    ],
    [
      "What if we need to switch tutors?",
      "That's something we can do. If after two or three sessions something doesn't feel right — the teaching style isn't clicking, the pacing is off — text me directly and I'll escalate it. We'd rather switch early than have sessions feel unproductive. You'd keep your hours and we'd rematch as quickly as possible.",
    ],
    [
      "What if we need to pause the program?",
      "That's something I'd want to get on a call with you about right away before any decision is made — there's usually a way to work through whatever's coming up. Text or call me directly and I'll get you connected with someone who can help figure out the best path.",
    ],
    [
      "When should she start preparing for the SAT?",
      "She's already started — the program begins from session one. The diagnostic we just looked at is the first piece of data. By phase one's practice test, we'll have a much clearer picture of where she's tracking.",
    ],
  ];

  return (
    <div>
      <div className="space-y-3 mb-8">
        {faqs.map(([q, a]) => (
          <div key={q} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800">{q}</div>
            <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed">{a}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Product Names — Know These Cold</p>
        <div className="space-y-2">
          {[
            ['Desmos', 'The graphing calculator built into the digital SAT. "Desmos Mastery Course" is the platform course every student completes. NOT "Decimate," "Demos," or "Desmas."'],
            ['Revenge Test', 'The feature in My Questions tab where the student retakes questions from their error log. Students select wrong questions → Create Revenge Test.'],
            ['Assessments tab', 'Where homework is assigned and submitted. Not "homework tab" or "assignments tab."'],
            ['My Questions tab', 'Where the error log lives. Tracks every wrong answer automatically.'],
            ['Collaboration tab', 'Where students message the tutor between sessions. Not "messages" or "chat."'],
            ['Phase', 'One block of the program, ending in a full-length practice test. Students move through phases sequentially.'],
          ].map(([name, desc]) => (
            <div key={name} className="flex gap-3 text-sm bg-blue-50 rounded-lg p-3 border border-blue-100">
              <span className="font-semibold text-[#1e2090] shrink-0 min-w-[140px]">{name}</span>
              <span className="text-gray-700">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function SscScriptsPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('onboarding');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthed(!!localStorage.getItem(AUTH_KEY));
    }
  }, []);

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password === PASSWORD || password === 'Founders25') {
      localStorage.setItem(AUTH_KEY, '1');
      setAuthed(true);
    } else {
      setAuthError('Wrong password');
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleAuth} className="bg-white rounded-2xl shadow p-8 w-80 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">SSC Dashboard</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2090]"
          />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button type="submit" className="w-full bg-[#1e2090] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#171a7a] transition">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'onboarding',     label: 'Onboarding Call' },
    { id: 'post-session-1', label: 'Post-Session 1' },
    { id: 'weekly-checkin', label: 'Weekly Check-in' },
    { id: 'phase-checkin',  label: 'Phase Check-in' },
    { id: 'flags',          label: 'Flags' },
    { id: 'faqs',           label: 'FAQs & Names' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e2090] text-white px-6 py-4">
        <h1 className="text-xl font-bold">SSC Scripts & SOPs</h1>
        <p className="text-blue-200 text-sm mt-0.5">Call scripts, checklists, and escalation rules</p>
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex gap-1 flex-wrap">
        <Link href="/match-queue" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Operations</Link>
        <Link href="/tqc"         className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">TQC</Link>
        <Link href="/check-ins"   className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Check-ins</Link>
        <Link href="/ssc"          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">SSC</Link>
        <Link href="/ssc/calendar" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Calendar</Link>
        <Link href="/ssc/scripts"  className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e2090] text-white">Scripts</Link>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              tab === t.id
                ? 'border-[#1e2090] text-[#1e2090]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {tab === 'onboarding'     && <OnboardingScript />}
        {tab === 'post-session-1' && <PostSession1Script />}
        {tab === 'weekly-checkin' && <WeeklyCheckinScript />}
        {tab === 'phase-checkin'  && <PhaseCheckinScript />}
        {tab === 'flags'          && <FlagsScript />}
        {tab === 'faqs'           && <FAQScript />}
      </div>
    </div>
  );
}
