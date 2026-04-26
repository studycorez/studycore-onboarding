import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Hours to ADD to local time to get UTC (April = DST active for US)
const TZ: Record<string, number> = { EST: 4, CST: 5, PST: 7, MST: 7 };

// day: 0=Mon..6=Sun
function nextOccurrence(day: number, h: number, m: number, tz: string): Date {
  const offset = TZ[tz] ?? 5;
  const now = new Date();
  const todayMon0 = (now.getUTCDay() + 6) % 7;
  let daysAhead = day - todayMon0;
  if (daysAhead <= 0) daysAhead += 7;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(h + offset, m, 0, 0);
  return d;
}

// ── TUTORS ──────────────────────────────────────────────────────────────────
const TUTORS = [
  { name: 'Oliver Zhang',               email: 'oliver.zhang0712@gmail.com',        subjects: ['SAT'] },
  { name: 'Pranesh Raghavendran',        email: 'praneshraghavendran66@gmail.com',   subjects: ['SAT'] },
  { name: 'David Salas',                 email: 'davidisaacsalas@gmail.com',         subjects: ['SAT'] },
  { name: 'Ronit Peswani',               email: 'ronitpeswani@berkeley.edu',         subjects: ['SAT'] },
  { name: 'Parth Patel',                 email: 'parthmpatel2025@gmail.com',         subjects: ['SAT', 'ACT'] },
  { name: 'Vaishnavi Kolluru',           email: 'vkolluru@usc.edu',                  subjects: ['SAT', 'AP Biology'] },
  { name: 'David Zhu',                   email: 'davidzhu314@gmail.com',             subjects: ['SAT'] },
  { name: 'Joseph Valenti',              email: 'jrv67@cornell.edu',                 subjects: ['SAT'] },
  { name: 'Rachit Surve',                email: 'rachitsurve3@gmail.com',            subjects: ['SAT'] },
  { name: 'Nikhil Sakthirajan',          email: 'nikhil.sakthirajan@gmail.com',      subjects: ['SAT'] },
  { name: 'Tanish Dongre',               email: 'tdongre100@gmail.com',              subjects: ['SAT', 'ACT'] },
  { name: 'Varun Arya',                  email: 'vak4@illinois.edu',                 subjects: ['SAT'] },
  { name: 'Mazin Sihweil',               email: 'mazin.sihweil@gmail.com',           subjects: ['SAT'] },
  { name: 'Priyam Kabra',                email: 'priyamkabra7@gmail.com',            subjects: ['SAT'] },
  { name: 'Mahir Labib',                 email: 'mmlabib1050@gmail.com',             subjects: ['SAT'] },
  { name: 'Jesse Palmer',                email: 'jessbuilt@gmail.com',               subjects: ['SAT'] },
  { name: 'Yiyi Sun',                    email: 'bluepaper1122@gmail.com',           subjects: ['SAT'] },
  { name: 'Minju Kim',                   email: 'minjugemma@gmail.com',              subjects: ['SAT'] },
  { name: 'Brohon Su',                   email: 'brosu222@yahoo.com',                subjects: ['SAT'] },
  { name: 'Samarth Bedre',               email: 'samarth.bedre@gmail.com',           subjects: ['SAT'] },
  { name: 'Daniel Ryu',                  email: 'ryudaniel10@gmail.com',             subjects: ['SAT'] },
  { name: 'Aarav G',                     email: 'aaravg0924@gmail.com',              subjects: ['SAT'] },
  { name: 'Sara Khwaja',                 email: 'saraskhwaja@gmail.com',             subjects: ['SAT', 'ACT'] },
  { name: 'Herbert Omboto',              email: 'homboto3@gmail.com',                subjects: ['SAT'] },
];

// ── AVAILABILITY ─────────────────────────────────────────────────────────────
// [tutorEmail, day(0=Mon), startHH, startMM, endHH, endMM]
type AvailSlot = [string, number, number, number, number, number];
const AVAILABILITY: AvailSlot[] = [
  // Oliver Zhang — CST Mon/Wed/Sat/Sun
  ['oliver.zhang0712@gmail.com', 0, 16, 0, 18, 0],
  ['oliver.zhang0712@gmail.com', 2, 16, 0, 20, 0],
  ['oliver.zhang0712@gmail.com', 5, 12, 0, 22, 0],
  ['oliver.zhang0712@gmail.com', 6, 12, 0, 22, 0],
  // Pranesh — EST Wed/Fri/Sat/Sun
  ['praneshraghavendran66@gmail.com', 2, 16, 0, 22, 0],
  ['praneshraghavendran66@gmail.com', 4, 16, 0, 22, 0],
  ['praneshraghavendran66@gmail.com', 5, 17, 0, 22, 0],
  ['praneshraghavendran66@gmail.com', 6, 17, 0, 22, 0],
  // David Salas — EST Mon-Fri + Sun 6-11:30PM
  ['davidisaacsalas@gmail.com', 0, 18, 0, 23, 30],
  ['davidisaacsalas@gmail.com', 1, 18, 0, 23, 30],
  ['davidisaacsalas@gmail.com', 2, 18, 0, 23, 30],
  ['davidisaacsalas@gmail.com', 3, 18, 0, 23, 30],
  ['davidisaacsalas@gmail.com', 4, 18, 0, 23, 30],
  ['davidisaacsalas@gmail.com', 6, 18, 0, 23, 30],
  // Ronit — EST Sun 1-3PM
  ['ronitpeswani@berkeley.edu', 6, 13, 0, 15, 0],
  // Parth — PST Tue-Sun
  ['parthmpatel2025@gmail.com', 1, 14, 0, 21, 0],
  ['parthmpatel2025@gmail.com', 2, 17, 0, 21, 0],
  ['parthmpatel2025@gmail.com', 3,  8, 0, 23, 59],
  ['parthmpatel2025@gmail.com', 4, 14, 0, 21, 0],
  ['parthmpatel2025@gmail.com', 5,  8, 0, 23, 59],
  ['parthmpatel2025@gmail.com', 6, 11, 0, 23, 59],
  // Vaishnavi — PST all week
  ['vkolluru@usc.edu', 0,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 1,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 2,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 3,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 4,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 5,  9, 0, 23, 0],
  ['vkolluru@usc.edu', 6,  9, 0, 23, 0],
  // David Zhu — EST Mon/Tue/Thu/Fri 6-11:30PM, Sat 6-7PM, Sun 6-11:30PM
  ['davidzhu314@gmail.com', 0, 18, 0, 23, 30],
  ['davidzhu314@gmail.com', 1, 18, 0, 23, 30],
  ['davidzhu314@gmail.com', 3, 18, 0, 23, 30],
  ['davidzhu314@gmail.com', 4, 18, 0, 23, 30],
  ['davidzhu314@gmail.com', 5,  6, 0, 19, 0],
  ['davidzhu314@gmail.com', 6, 18, 0, 23, 30],
  // Joseph Valenti — EST Mon/Tue/Wed/Fri/Sat/Sun
  ['jrv67@cornell.edu', 0, 16,  0, 23, 59],
  ['jrv67@cornell.edu', 1, 16,  0, 20,  0],
  ['jrv67@cornell.edu', 2, 19,  0, 23, 59],
  ['jrv67@cornell.edu', 4, 15,  0, 23, 59],
  ['jrv67@cornell.edu', 5, 11,  0, 17,  0],
  ['jrv67@cornell.edu', 6,  0,  0, 23, 59],
  // Rachit — PST Mon/Wed/Sat 1:30-5PM
  ['rachitsurve3@gmail.com', 0, 13, 30, 17, 0],
  ['rachitsurve3@gmail.com', 2, 13, 30, 17, 0],
  ['rachitsurve3@gmail.com', 5, 13, 30, 17, 0],
  // Nikhil — EST Mon/Tue/Wed 4-8PM, Sat/Sun 2-4PM
  ['nikhil.sakthirajan@gmail.com', 0, 16, 0, 20, 0],
  ['nikhil.sakthirajan@gmail.com', 1, 16, 0, 20, 0],
  ['nikhil.sakthirajan@gmail.com', 2, 14, 0, 20, 0],
  ['nikhil.sakthirajan@gmail.com', 5, 14, 0, 16, 0],
  ['nikhil.sakthirajan@gmail.com', 6, 14, 0, 16, 0],
  // Tanish — EST all week (Mon/Wed after 4:30, others from 3PM)
  ['tdongre100@gmail.com', 0, 16, 30, 23, 59],
  ['tdongre100@gmail.com', 1, 15,  0, 23, 59],
  ['tdongre100@gmail.com', 2, 16, 30, 23, 59],
  ['tdongre100@gmail.com', 3, 15,  0, 23, 59],
  ['tdongre100@gmail.com', 4, 15,  0, 23, 59],
  ['tdongre100@gmail.com', 5,  0,  0, 23, 59],
  ['tdongre100@gmail.com', 6,  0,  0, 23, 59],
  // Varun — CST Mon/Tue/Thu/Fri/Sun
  ['vak4@illinois.edu', 0, 17, 0, 19, 0],
  ['vak4@illinois.edu', 1, 16, 30, 19, 0],
  ['vak4@illinois.edu', 3, 16, 30, 18, 30],
  ['vak4@illinois.edu', 4, 16,  0, 18, 30],
  ['vak4@illinois.edu', 6, 17,  0, 19, 0],
  // Mazin — CST Mon/Tue/Wed/Thu/Sat 8AM-noon
  ['mazin.sihweil@gmail.com', 0,  8, 0, 12, 0],
  ['mazin.sihweil@gmail.com', 1,  8, 0, 12, 0],
  ['mazin.sihweil@gmail.com', 2,  8, 0, 12, 0],
  ['mazin.sihweil@gmail.com', 3,  8, 0, 12, 0],
  ['mazin.sihweil@gmail.com', 5,  8, 0, 12, 0],
  // Priyam — EST Mon/Tue/Wed 4-8PM, Sat/Sun 2-4PM
  ['priyamkabra7@gmail.com', 0, 16, 0, 20, 0],
  ['priyamkabra7@gmail.com', 1, 16, 0, 20, 0],
  ['priyamkabra7@gmail.com', 2, 16, 0, 20, 0],
  ['priyamkabra7@gmail.com', 5, 14, 0, 16, 0],
  ['priyamkabra7@gmail.com', 6, 14, 0, 16, 0],
  // Mahir — EST Mon/Wed/Sun 8-10PM
  ['mmlabib1050@gmail.com', 0, 20, 0, 22, 0],
  ['mmlabib1050@gmail.com', 2, 20, 0, 22, 0],
  ['mmlabib1050@gmail.com', 6, 20, 0, 22, 0],
  // Jesse — PST Mon/Fri/Sat 11AM-4PM + 7-9PM
  ['jessbuilt@gmail.com', 0, 11, 0, 21, 0],
  ['jessbuilt@gmail.com', 4, 11, 0, 21, 0],
  ['jessbuilt@gmail.com', 5, 11, 0, 21, 0],
  // Yiyi — EST Mon/Tue/Wed/Fri/Sat/Sun 8-10PM
  ['bluepaper1122@gmail.com', 0, 20, 0, 22, 0],
  ['bluepaper1122@gmail.com', 1, 20, 0, 22, 0],
  ['bluepaper1122@gmail.com', 2, 20, 0, 22, 0],
  ['bluepaper1122@gmail.com', 4, 20, 0, 22, 0],
  ['bluepaper1122@gmail.com', 5, 20, 0, 22, 0],
  ['bluepaper1122@gmail.com', 6, 20, 0, 22, 0],
  // Minju — PST Mon/Wed/Fri/Sat/Sun
  ['minjugemma@gmail.com', 0, 10, 0, 22, 0],
  ['minjugemma@gmail.com', 2, 10, 0, 22, 0],
  ['minjugemma@gmail.com', 4, 10, 0, 22, 0],
  ['minjugemma@gmail.com', 5, 10, 0, 22, 0],
  ['minjugemma@gmail.com', 6, 10, 0, 22, 0],
  // Brohon — EST all week
  ['brosu222@yahoo.com', 0,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 1,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 2,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 3,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 4,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 5,  9, 0, 23, 0],
  ['brosu222@yahoo.com', 6,  9, 0, 23, 0],
  // Samarth — PST Tue-Sun
  ['samarth.bedre@gmail.com', 1, 14, 0, 21, 0],
  ['samarth.bedre@gmail.com', 2, 17, 0, 21, 0],
  ['samarth.bedre@gmail.com', 3,  8, 0, 23, 59],
  ['samarth.bedre@gmail.com', 4,  8, 0, 23, 59],
  ['samarth.bedre@gmail.com', 5,  8, 0, 23, 59],
  ['samarth.bedre@gmail.com', 6,  8, 0, 23, 59],
  // Daniel Ryu — MST Mon/Tue/Thu/Fri/Sat/Sun 7:30-10PM
  ['ryudaniel10@gmail.com', 0, 19, 30, 22, 0],
  ['ryudaniel10@gmail.com', 1, 19, 30, 22, 0],
  ['ryudaniel10@gmail.com', 3, 19, 30, 22, 0],
  ['ryudaniel10@gmail.com', 4, 19, 30, 22, 0],
  ['ryudaniel10@gmail.com', 5, 19, 30, 22, 0],
  ['ryudaniel10@gmail.com', 6, 19, 30, 22, 0],
  // Aarav G — CST Mon-Fri (split blocks)
  ['aaravg0924@gmail.com', 0,  9,  0, 11, 0],
  ['aaravg0924@gmail.com', 1, 12,  0, 20, 0],
  ['aaravg0924@gmail.com', 2,  9,  0, 11, 0],
  ['aaravg0924@gmail.com', 3, 13, 30, 20, 0],
  ['aaravg0924@gmail.com', 4,  9,  0, 11, 0],
  // Sara Khwaja — CST Mon-Sun
  ['saraskhwaja@gmail.com', 0, 16, 0, 23, 0],
  ['saraskhwaja@gmail.com', 1, 16, 0, 23, 0],
  ['saraskhwaja@gmail.com', 2, 16, 0, 23, 0],
  ['saraskhwaja@gmail.com', 3, 16, 0, 23, 0],
  ['saraskhwaja@gmail.com', 4, 16, 0, 23, 0],
  ['saraskhwaja@gmail.com', 5, 13, 0, 23, 0],
  ['saraskhwaja@gmail.com', 6, 20, 0, 23, 0],
  // Herbert — EST weekdays 4:30-6PM, weekends all day
  ['homboto3@gmail.com', 0, 16, 30, 18, 0],
  ['homboto3@gmail.com', 1, 16, 30, 18, 0],
  ['homboto3@gmail.com', 2, 16, 30, 18, 0],
  ['homboto3@gmail.com', 3, 16, 30, 18, 0],
  ['homboto3@gmail.com', 4, 16, 30, 18, 0],
  ['homboto3@gmail.com', 5,  0,  0, 23, 59],
  ['homboto3@gmail.com', 6,  0,  0, 23, 59],
];

// ── SESSIONS ─────────────────────────────────────────────────────────────────
// studentName must match (case-insensitive) a name in the students table.
// Multiple studentNames = group session (one DB row per student, same time).
interface SessionDef {
  tutorEmail: string;
  studentNames: string[];
  day: number; // 0=Mon..6=Sun
  h: number;   // local hour
  m: number;   // local minute
  tz: string;
  dur: number; // duration_minutes
  notes?: string;
}

const SESSIONS: SessionDef[] = [
  // ── David Salas ──
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Shaan Patel'],   day: 0, h: 19, m:  0, tz: 'EST', dur:  90 }, // Mon 7PM
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Shaan Patel'],   day: 3, h: 18, m:  0, tz: 'EST', dur:  90 }, // Thu 6PM
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Savannah'],      day: 1, h: 16, m: 30, tz: 'EST', dur:  90 }, // Tue 4:30PM
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Savannah'],      day: 3, h: 19, m: 30, tz: 'EST', dur:  90 }, // Thu 7:30PM
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Olivia Park'],   day: 5, h: 14, m:  0, tz: 'CST', dur:  90, notes: 'CDT timezone; recurring status unconfirmed' }, // Sat 2PM CDT
  { tutorEmail: 'davidisaacsalas@gmail.com', studentNames: ['Olivia Park'],   day: 6, h: 13, m:  0, tz: 'CST', dur:  90, notes: 'CDT timezone; recurring status unconfirmed' }, // Sun 1PM CDT

  // ── David Zhu ──
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Medha Anantuni'],    day: 1, h: 19, m:  0, tz: 'EST', dur:  90 }, // Tue 7PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Medha Anantuni'],    day: 3, h: 19, m:  0, tz: 'EST', dur:  90 }, // Thu 7PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Medha Anantuni'],    day: 6, h: 19, m:  0, tz: 'EST', dur:  90 }, // Sun 7PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Somesh Bhatt'],      day: 3, h: 10, m:  0, tz: 'EST', dur: 120 }, // Thu 10AM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Somesh Bhatt'],      day: 5, h: 10, m:  0, tz: 'EST', dur: 120 }, // Sat 10AM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Colby Burton'],      day: 5, h: 15, m: 30, tz: 'EST', dur: 120 }, // Sat 3:30PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Pierre DeFelice'],   day: 0, h: 20, m:  0, tz: 'EST', dur:  60 }, // Mon 8PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Pierre DeFelice'],   day: 5, h: 12, m:  0, tz: 'EST', dur:  60 }, // Sat 12PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Chaitan Praveen'],   day: 0, h: 19, m:  0, tz: 'EST', dur:  60 }, // Mon 7PM
  { tutorEmail: 'davidzhu314@gmail.com', studentNames: ['Chaitan Praveen'],   day: 4, h: 19, m:  0, tz: 'EST', dur:  60 }, // Fri 7PM

  // ── Jesse Palmer ──
  { tutorEmail: 'jessbuilt@gmail.com', studentNames: ['Adam Hamid'],          day: 2, h: 15, m: 30, tz: 'EST', dur:  90, notes: 'Biweekly' }, // Wed 3:30PM EST
  { tutorEmail: 'jessbuilt@gmail.com', studentNames: ['Adam Hamid'],          day: 5, h: 12, m: 30, tz: 'EST', dur:  90, notes: 'Biweekly' }, // Sat 12:30PM EST
  { tutorEmail: 'jessbuilt@gmail.com', studentNames: ['Chaitan Praveen'],     day: 3, h: 19, m:  0, tz: 'EST', dur:  60 }, // Thu 7PM EST

  // ── Joseph Valenti ──
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Arnav Mishra'],          day: 0, h: 16, m: 30, tz: 'EST', dur: 120 }, // Mon 4:30PM
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Arnav Mishra'],          day: 4, h: 15, m:  0, tz: 'EST', dur: 120 }, // Fri 3PM
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Harshith'],              day: 1, h: 18, m:  0, tz: 'EST', dur:  90 }, // Tue 6PM
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Harshith'],              day: 3, h: 18, m:  0, tz: 'EST', dur:  90 }, // Thu 6PM
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Abisola Abdul'],         day: 2, h: 20, m:  0, tz: 'EST', dur:  90 }, // Wed 8PM
  { tutorEmail: 'jrv67@cornell.edu', studentNames: ['Abisola Abdul'],         day: 5, h:  9, m: 30, tz: 'EST', dur:  90 }, // Sat 9:30AM

  // ── Mahir Labib ──
  { tutorEmail: 'mmlabib1050@gmail.com', studentNames: ['Arham Usman'],       day: 3, h: 21, m:  0, tz: 'EST', dur: 120 }, // Thu 9PM
  { tutorEmail: 'mmlabib1050@gmail.com', studentNames: ['Snch'],              day: 6, h: 20, m:  0, tz: 'EST', dur: 120, notes: 'Snehansh in PDF → matched to Snch in DB' }, // Sun 8PM

  // ── Mazin Sihweil ──
  { tutorEmail: 'mazin.sihweil@gmail.com', studentNames: ['Emerie Smith'],    day: 1, h: 16, m:  0, tz: 'CST', dur:  90 }, // Tue 4PM CST
  { tutorEmail: 'mazin.sihweil@gmail.com', studentNames: ['Emerie Smith'],    day: 5, h: 16, m:  0, tz: 'CST', dur:  90 }, // Sat 4PM CST
  { tutorEmail: 'mazin.sihweil@gmail.com', studentNames: ['Isha Ganatra', 'Adhya Ganatra'], day: 3, h: 17, m: 0, tz: 'PST', dur: 120 }, // Thu 5PM PST (group)
  { tutorEmail: 'mazin.sihweil@gmail.com', studentNames: ['Maaz', 'Rauha'],   day: 1, h: 21, m:  0, tz: 'EST', dur: 120, notes: 'Rauha = "Roja" in PDF' }, // Tue 9PM EST (group)

  // ── Minju Kim ──
  { tutorEmail: 'minjugemma@gmail.com', studentNames: ['Mrinal Agarwal'],     day: 6, h: 19, m:  0, tz: 'PST', dur:  60 }, // Sun 7PM PST
  { tutorEmail: 'minjugemma@gmail.com', studentNames: ['Susannah Rockers'],   day: 6, h: 13, m:  0, tz: 'EST', dur:  60 }, // Sun 1PM EST
  { tutorEmail: 'minjugemma@gmail.com', studentNames: ['Susannah Rockers'],   day: 3, h: 17, m: 30, tz: 'EST', dur:  60 }, // Thu 5:30PM EST
  { tutorEmail: 'minjugemma@gmail.com', studentNames: ['Saanvi Sunil'],       day: 2, h: 18, m: 30, tz: 'PST', dur:  90, notes: 'New schedule (moved from David Zhu)' }, // Wed 6:30PM PST
  { tutorEmail: 'minjugemma@gmail.com', studentNames: ['Saanvi Sunil'],       day: 5, h: 11, m: 30, tz: 'PST', dur:  90, notes: 'New schedule (moved from David Zhu)' }, // Sat 11:30AM PST

  // ── Nikhil Sakthirajan ──
  { tutorEmail: 'nikhil.sakthirajan@gmail.com', studentNames: ['abbie pongpat'], day: 0, h: 13, m: 30, tz: 'PST', dur: 120 }, // Mon 1:30PM PST
  { tutorEmail: 'nikhil.sakthirajan@gmail.com', studentNames: ['abbie pongpat'], day: 2, h: 13, m: 30, tz: 'PST', dur: 120 }, // Wed 1:30PM PST
  { tutorEmail: 'nikhil.sakthirajan@gmail.com', studentNames: ['Tanishi Pathak'], day: 5, h: 14, m: 0, tz: 'PST', dur: 120 }, // Sat 2PM PST (SAT)
  { tutorEmail: 'nikhil.sakthirajan@gmail.com', studentNames: ['Tanishi Pathak'], day: 2, h: 15, m: 30, tz: 'PST', dur:  90, notes: 'AP Bio session' }, // Wed 3:30PM PST (AP Bio)

  // ── Oliver Zhang ──
  { tutorEmail: 'oliver.zhang0712@gmail.com', studentNames: ['Avleen Gahunia'], day: 4, h: 17, m: 0, tz: 'CST', dur: 60 }, // Fri 5PM CST
  { tutorEmail: 'oliver.zhang0712@gmail.com', studentNames: ['Avleen Gahunia'], day: 5, h: 17, m: 0, tz: 'CST', dur: 60 }, // Sat 5PM CST
  { tutorEmail: 'oliver.zhang0712@gmail.com', studentNames: ['Avleen Gahunia'], day: 6, h: 17, m: 0, tz: 'CST', dur: 60 }, // Sun 5PM CST
  { tutorEmail: 'oliver.zhang0712@gmail.com', studentNames: ['Justin Shah'],    day: 6, h: 12, m: 0, tz: 'CST', dur: 120 }, // Sun 12PM CST

  // ── Parth Patel ──
  { tutorEmail: 'parthmpatel2025@gmail.com', studentNames: ['Monica'],         day: 1, h: 16, m:  0, tz: 'PST', dur: 120 }, // Tue 4PM PST
  { tutorEmail: 'parthmpatel2025@gmail.com', studentNames: ['Javet Wongkaren'], day: 4, h: 17, m: 0, tz: 'EST', dur:  90 }, // Fri 5PM EST (=2PM PST)
  { tutorEmail: 'parthmpatel2025@gmail.com', studentNames: ['Javet Wongkaren'], day: 6, h: 14, m: 0, tz: 'EST', dur:  90 }, // Sun 2PM EST (=11AM PST)
  { tutorEmail: 'parthmpatel2025@gmail.com', studentNames: ['Muhammad Haider'], day: 3, h: 19, m: 30, tz: 'EST', dur:  90 }, // Thu 7:30PM EST
  { tutorEmail: 'parthmpatel2025@gmail.com', studentNames: ['Muhammad Haider'], day: 6, h: 11, m: 30, tz: 'EST', dur:  90 }, // Sun 11:30AM EST

  // ── Pranesh Raghavendran ──
  { tutorEmail: 'praneshraghavendran66@gmail.com', studentNames: ['Sanjana Mehta'], day: 2, h: 19, m: 0, tz: 'EST', dur: 60 }, // Wed 7PM EST
  { tutorEmail: 'praneshraghavendran66@gmail.com', studentNames: ['Sanjana Mehta'], day: 5, h: 12, m: 0, tz: 'EST', dur: 60 }, // Sat 12PM EST
  { tutorEmail: 'praneshraghavendran66@gmail.com', studentNames: ['radhae muthukumaraswamy'], day: 5, h: 18, m: 0, tz: 'EST', dur: 90 }, // Sat 6PM EST
  { tutorEmail: 'praneshraghavendran66@gmail.com', studentNames: ['radhae muthukumaraswamy'], day: 6, h: 18, m: 0, tz: 'EST', dur: 90 }, // Sun 6PM EST

  // ── Priyam Kabra ──
  { tutorEmail: 'priyamkabra7@gmail.com', studentNames: ['ved r'],             day: 0, h: 17, m: 30, tz: 'EST', dur:  90 }, // Mon 5:30PM EST
  { tutorEmail: 'priyamkabra7@gmail.com', studentNames: ['ved r'],             day: 4, h: 16, m: 30, tz: 'EST', dur:  90 }, // Fri 4:30PM EST
  { tutorEmail: 'priyamkabra7@gmail.com', studentNames: ['Om Vyas'],           day: 1, h: 20, m:  0, tz: 'EST', dur:  90 }, // Tue 8PM EST
  { tutorEmail: 'priyamkabra7@gmail.com', studentNames: ['Om Vyas'],           day: 5, h: 11, m: 30, tz: 'EST', dur:  90 }, // Sat 11:30AM EST

  // ── Rachit Surve ──
  { tutorEmail: 'rachitsurve3@gmail.com', studentNames: ['David Bogart'],      day: 6, h: 21, m:  0, tz: 'EST', dur: 120 }, // Sun 9PM EST
  { tutorEmail: 'rachitsurve3@gmail.com', studentNames: ['Nicolai Defreest'],  day: 0, h: 16, m:  0, tz: 'PST', dur:  60 }, // Mon 4PM PST
  { tutorEmail: 'rachitsurve3@gmail.com', studentNames: ['Nicolai Defreest'],  day: 2, h: 16, m:  0, tz: 'PST', dur:  60 }, // Wed 4PM PST

  // ── Ronit Peswani ──
  { tutorEmail: 'ronitpeswani@berkeley.edu', studentNames: ['Elijah Zittel'],  day: 6, h: 13, m:  0, tz: 'EST', dur: 120 }, // Sun 1PM EST

  // ── Tanish Dongre ──
  { tutorEmail: 'tdongre100@gmail.com', studentNames: ['Aarav Vasudevan'],     day: 0, h: 17, m:  0, tz: 'CST', dur:  90, notes: 'Session time unspecified in PDF; defaulted to 5PM CST' },
  { tutorEmail: 'tdongre100@gmail.com', studentNames: ['Aarav Vasudevan'],     day: 3, h: 17, m:  0, tz: 'CST', dur:  90, notes: 'Session time unspecified in PDF; defaulted to 5PM CST' },
  { tutorEmail: 'tdongre100@gmail.com', studentNames: ['Aarav Vasudevan'],     day: 5, h: 17, m:  0, tz: 'CST', dur:  90, notes: 'Session time unspecified in PDF; defaulted to 5PM CST' },
  { tutorEmail: 'tdongre100@gmail.com', studentNames: ['Sara Abdelrahman'],    day: 2, h: 16, m:  0, tz: 'EST', dur:  90 }, // Wed 4PM EST
  { tutorEmail: 'tdongre100@gmail.com', studentNames: ['Sara Abdelrahman'],    day: 6, h: 16, m:  0, tz: 'EST', dur:  90 }, // Sun 4PM EST

  // ── Varun Arya (3/22/2026 updated schedule) ──
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Enakshi'],               day: 1, h: 17, m: 30, tz: 'MST', dur:  90, notes: 'Updated schedule 3/22/2026' }, // Tue 5:30PM MST
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Enakshi'],               day: 5, h: 10, m:  0, tz: 'MST', dur:  90, notes: 'Updated schedule 3/22/2026' }, // Sat 10AM MST
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Muzammil'],              day: 6, h: 11, m: 30, tz: 'CST', dur: 120, notes: 'Updated schedule 3/22/2026; was Sun 5-7PM CST' },
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Moin Khan'],             day: 1, h: 17, m:  0, tz: 'MST', dur:  60, notes: 'New assignment 3/22/2026; conflict: also assigned to Yiyi Sun' },
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Moin Khan'],             day: 3, h: 17, m:  0, tz: 'MST', dur:  60, notes: 'New assignment 3/22/2026' },
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Moin Khan'],             day: 5, h: 17, m:  0, tz: 'MST', dur:  60, notes: 'New assignment 3/22/2026' },
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Saisaran Vigneshkumar'], day: 1, h: 19, m:  0, tz: 'MST', dur:  60, notes: 'New assignment 3/22/2026; conflict: also assigned to Yiyi Sun' },
  { tutorEmail: 'vak4@illinois.edu', studentNames: ['Saisaran Vigneshkumar'], day: 3, h: 19, m:  0, tz: 'MST', dur:  60, notes: 'New assignment 3/22/2026' },

  // ── Yiyi Sun ──
  { tutorEmail: 'bluepaper1122@gmail.com', studentNames: ['Moin Khan'],        day: 1, h: 17, m: 30, tz: 'MST', dur:  60, notes: 'Conflict: Moin also assigned to Varun (3/22 update)' },
  { tutorEmail: 'bluepaper1122@gmail.com', studentNames: ['Moin Khan'],        day: 5, h: 17, m: 30, tz: 'MST', dur:  60, notes: 'Conflict: Moin also assigned to Varun (3/22 update)' },
  { tutorEmail: 'bluepaper1122@gmail.com', studentNames: ['Saisaran Vigneshkumar'], day: 0, h:  9, m: 0, tz: 'CST', dur: 60 }, // Mon 9AM CST
  { tutorEmail: 'bluepaper1122@gmail.com', studentNames: ['Saisaran Vigneshkumar'], day: 1, h:  9, m: 0, tz: 'CST', dur: 60 }, // Tue 9AM CST
  { tutorEmail: 'bluepaper1122@gmail.com', studentNames: ['Saisaran Vigneshkumar'], day: 3, h:  9, m: 0, tz: 'CST', dur: 60 }, // Thu 9AM CST

  // ── Aarav G (new) ──
  { tutorEmail: 'aaravg0924@gmail.com', studentNames: ['Santiago Perez'],      day: 4, h: 17, m: 30, tz: 'CST', dur: 120 }, // Fri 5:30PM CST
  { tutorEmail: 'aaravg0924@gmail.com', studentNames: ['Santiago Perez'],      day: 1, h: 19, m:  0, tz: 'CST', dur: 120 }, // Tue 7PM CST

  // ── Brohon Su (new) ──
  { tutorEmail: 'brosu222@yahoo.com', studentNames: ['Miracle Brown'],         day: 1, h: 19, m:  0, tz: 'EST', dur: 120 }, // Tue 7PM EST
  { tutorEmail: 'brosu222@yahoo.com', studentNames: ['Miracle Brown'],         day: 3, h: 19, m:  0, tz: 'EST', dur: 120 }, // Thu 7PM EST

  // ── Herbert (new) ──
  { tutorEmail: 'homboto3@gmail.com', studentNames: ['Emily Dietzenbach'],     day: 1, h: 17, m:  0, tz: 'EST', dur:  60 }, // Tue 5PM EST
  { tutorEmail: 'homboto3@gmail.com', studentNames: ['Emily Dietzenbach'],     day: 3, h: 17, m:  0, tz: 'EST', dur:  60 }, // Thu 5PM EST
];

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const report: string[] = [
    '# StudyCore Tutor Import Report',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  // 1. Clear existing data (FK order)
  console.log('🗑️  Clearing existing tutor data...');
  for (const table of ['sessions', 'tutor_availability', 'tutors'] as const) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { console.error(`Failed to clear ${table}:`, error.message); process.exit(1); }
    console.log(`  ✅ Cleared ${table}`);
  }

  // 2. Insert tutors
  console.log('\n💾  Inserting tutors...');
  const tutorRows = TUTORS.map(t => ({ name: t.name, email: t.email, subjects: t.subjects }));
  const { data: insertedTutors, error: tutorErr } = await supabase
    .from('tutors').insert(tutorRows).select('id, email');
  if (tutorErr) { console.error('Tutor insert failed:', tutorErr.message); process.exit(1); }
  const tutorIdByEmail = new Map<string, string>(insertedTutors!.map(t => [t.email, t.id]));
  console.log(`  ✅ Inserted ${insertedTutors!.length} tutors`);
  report.push(`## Tutors (${insertedTutors!.length} inserted)`);
  for (const t of TUTORS) report.push(`- ${t.name} <${t.email}> [${t.subjects.join(', ')}]`);
  report.push('');

  // 3. Insert availability
  console.log('\n📅  Inserting availability...');
  const availRows = AVAILABILITY.map(([email, day, sh, sm, eh, em]) => ({
    tutor_id:    tutorIdByEmail.get(email as string)!,
    day_of_week: day,
    start_time:  `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`,
    end_time:    `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`,
  })).filter(r => r.tutor_id);
  const { error: availErr } = await supabase.from('tutor_availability').insert(availRows);
  if (availErr) { console.error('Availability insert failed:', availErr.message); process.exit(1); }
  console.log(`  ✅ Inserted ${availRows.length} availability slots`);
  report.push(`## Availability: ${availRows.length} slots inserted`);
  report.push('');

  // 4. Fetch students → build lookup map (case-insensitive)
  console.log('\n🔍  Fetching students...');
  const { data: students, error: studErr } = await supabase
    .from('students').select('id, name');
  if (studErr) { console.error('Student fetch failed:', studErr.message); process.exit(1); }
  const studentByName = new Map<string, string>();
  for (const s of students!) studentByName.set(s.name.toLowerCase().trim(), s.id);

  function lookupStudent(name: string): string | null {
    return studentByName.get(name.toLowerCase().trim()) ?? null;
  }

  // 5. Insert sessions
  console.log('\n📝  Inserting sessions...');
  const sessionRows: Array<{
    tutor_id: string; student_id: string; scheduled_at: string;
    duration_minutes: number; session_notes: string; status: string;
  }> = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const def of SESSIONS) {
    const tutorId = tutorIdByEmail.get(def.tutorEmail);
    if (!tutorId) {
      skipped.push(`Tutor not found: ${def.tutorEmail}`);
      continue;
    }
    const scheduledAt = nextOccurrence(def.day, def.h, def.m, def.tz);

    for (const sName of def.studentNames) {
      const studentId = lookupStudent(sName);
      if (!studentId) {
        skipped.push(`Student not found: "${sName}" (tutor: ${def.tutorEmail}, ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][def.day]})`);
        continue;
      }
      sessionRows.push({
        tutor_id:         tutorId,
        student_id:       studentId,
        scheduled_at:     scheduledAt.toISOString(),
        duration_minutes: def.dur,
        session_notes:    def.notes ?? '',
        status:           'scheduled',
      });
    }
  }

  // Insert in batches
  let inserted = 0;
  for (let i = 0; i < sessionRows.length; i += 50) {
    const batch = sessionRows.slice(i, i + 50);
    const { error } = await supabase.from('sessions').insert(batch);
    if (error) {
      console.error(`  Batch ${Math.floor(i/50)+1} failed:`, error.message);
      warnings.push(`Session batch ${Math.floor(i/50)+1} error: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✅ Inserted ${inserted} session records`);

  // 6. Write report
  report.push(`## Sessions: ${inserted} inserted`);
  report.push('');
  report.push('### Conflicts / Flags');
  report.push('- Moin Khan: assigned to both Yiyi Sun (original) and Varun Arya (3/22/2026 update) — sessions created for both');
  report.push('- Saisaran Vigneshkumar: assigned to both Yiyi Sun (Mon/Tue/Thu 9AM CST) and Varun Arya (Tue/Thu 7PM MST) — sessions created for both');
  report.push('- Aarav Vasudevan (Tanish): session time not specified in PDF — defaulted to 5PM CST Mon/Thu/Sat');
  report.push('- Varun/Enakshi & Varun/Muzammil: used updated 3/22/2026 schedule (replaced original table times)');
  report.push('- Saanvi Sunil (Minju): new assignment, moved from David Zhu per PDF note');
  report.push('- Chaitan Praveen: has sessions with both David Zhu (Mon/Fri) and Jesse Palmer (Thu)');
  report.push('- Jesse Palmer / Adam Hamid: biweekly per update note');
  report.push('- David Salas / Olivia Park: recurring status unconfirmed in PDF');
  report.push('- Snehansh in PDF matched to "Snch" in DB');
  report.push('- Chaitan / Chaitan Katta in PDF matched to "Chaitan Praveen" in DB');
  report.push('- Roja in PDF matched to "Rauha" in DB');
  report.push('- Maz in PDF matched to "Maaz" in DB');
  report.push('- Abi in PDF matched to "Abisola Abdul" in DB');
  report.push('');

  if (warnings.length) {
    report.push('### Warnings');
    for (const w of warnings) report.push(`- ${w}`);
    report.push('');
  }

  if (skipped.length) {
    report.push('### Skipped (student/tutor not found in DB)');
    for (const s of skipped) report.push(`- ${s}`);
    report.push('');
    report.push('Note: Sohum, Hazel Papandrea are not in the students table and were skipped.');
  }

  report.push('');
  report.push('### Tutors with no sessions assigned');
  report.push('- Vaishnavi Kolluru (students Monica & Adam in form were not in master schedule table)');
  report.push('- Samarth Bedre (no student assignments found in PDF)');
  report.push('- Daniel Ryu (no student assignments found in PDF)');
  report.push('- Sara Khwaja (no student assignments found in PDF for this import)');
  report.push('- Ronit Peswani (1 student: Elijah Zittel, 1 session/week)');

  const reportText = report.join('\n');
  writeFileSync(resolve(process.cwd(), 'import-report-2.txt'), reportText);
  console.log('\n📄  Wrote import-report-2.txt');
  console.log(`\n✅  Done. ${TUTORS.length} tutors, ${availRows.length} availability slots, ${inserted} sessions.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
