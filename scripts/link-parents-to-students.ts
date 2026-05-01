/**
 * Link parent emails/names to student records and send parent portal onboarding emails.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/link-parents-to-students.ts
 *   npx ts-node --project tsconfig.json scripts/link-parents-to-students.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { Resend } from 'resend';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const FROM    = process.env.RESEND_FROM_EMAIL ?? 'info@studycore.net';
const CC      = 'info@studycore.net';

const jwtSecret = () =>
  new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

async function signParentJWT(parentEmail: string): Promise<string> {
  return new SignJWT({ parentEmail } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(jwtSecret());
}

// ── Master data ────────────────────────────────────────────────────────────────

interface Mapping {
  parentEmail: string;
  studentEmail: string | null; // null = find by name
  studentName:  string;        // used as fallback lookup or display
  parentName?:  string;
  parentPhone?: string;
}

const MAPPINGS: Mapping[] = [
  // parentEmail                      studentEmail                         studentName              parentName                   parentPhone
  { parentEmail: 'metropolitans13@yahoo.com',  studentEmail: 'metropolitans13@yahoo.com',   studentName: 'Elijah Zittel',        parentName: 'Daniel',              parentPhone: '(845) 238-8577' },
  { parentEmail: 'nataliya_77@hotmail.com',    studentEmail: 'davidbogart09@gmail.com',     studentName: 'David Bogart',         parentName: 'Nataliya',            parentPhone: '(831) 747-0192' },
  { parentEmail: 'lrwolpoff@gmail.com',        studentEmail: 'aayushdhaulakhandi@gmail.com',studentName: 'Aayush Musku',         parentName: 'Laurenn',             parentPhone: '(917) 518-9011' },
  { parentEmail: 'kantit123@gmail.com',        studentEmail: 'snehanshb@gmail.com',         studentName: 'Snehansh',             parentName: 'Kanti',               parentPhone: '(336) 745-7480' },
  { parentEmail: 'siriche80@gmail.com',        studentEmail: 'monicaalomba@gmail.com',      studentName: 'Monica',               parentName: 'Siri',                parentPhone: '(480) 825-8566' },
  { parentEmail: 'humamah_zuhra@yahoo.com',    studentEmail: 'arhamusman450@gmail.com',     studentName: 'Arham Usman',          parentName: 'Humumah',             parentPhone: '(425) 273-3096' },
  { parentEmail: 'annugup84@gmail.com',        studentEmail: 'enakshibansal1@outlook.com',  studentName: 'Enakshi Bansal',       parentName: 'Annu',                parentPhone: '(540) 314-4121' },
  { parentEmail: 'addatmyhome@gmail.com',      studentEmail: '1118194@apps.nsd.org',        studentName: 'Somesh Bhatt',         parentName: 'Sarvesh',             parentPhone: '(425) 770-9607' },
  { parentEmail: 'harish.pathak@gmail.com',    studentEmail: 'tanishi.paathak@gmail.com',   studentName: 'Tanishi Pathak',       parentName: 'Harish',              parentPhone: '(425) 524-3919' },
  { parentEmail: 'harsha.us@gmail.com',        studentEmail: 'adhyaganatra1@gmail.com',     studentName: 'Aadhya Ganatra',       parentName: 'Harsha',              parentPhone: '(408) 826-1747' },
  { parentEmail: 'thehamid123@aol.com',        studentEmail: 'hamid_adam@aol.com',          studentName: 'Adam Hamid',           parentName: 'Shelly',              parentPhone: '(732) 485-9549' },
  { parentEmail: 'imeduri79@gmail.com',        studentEmail: 'harshithkothapalli.25@gmail.com', studentName: 'Harshith',         parentName: 'Indu',                parentPhone: '(515) 779-5429' },
  { parentEmail: 'tompongpat426@gmail.com',    studentEmail: 'abbiepongpat2@gmail.com',     studentName: 'Abbie Pongpat',        parentName: 'Tom',                 parentPhone: '(717) 860-5774' },
  { parentEmail: 'mdms05@hotmail.com',         studentEmail: 'gahuniaavleen@gmail.com',     studentName: 'Avleen Gahunia',       parentName: 'Mandeep',             parentPhone: '(215) 272-8241' },
  { parentEmail: 'Dmeera18@gmail.com',         studentEmail: 'sanjana07m@gmail.com',        studentName: 'Sanjana Mehta',        parentName: 'Dmeera' },
  { parentEmail: 'priya_anantuni@hotmail.com', studentEmail: 'medhatheartist@gmail.com',    studentName: 'Medha' },
  { parentEmail: 'desinwafor99@yahoo.com',     studentEmail: 'cathycheks2005@gmail.com',    studentName: 'Arinze' },
  { parentEmail: 'deepakahuja_mit96@yahoo.com',studentEmail: 'Dikshant.ahuja061609@gmail.com', studentName: 'Dikshant Ahuja' },
  { parentEmail: 'yinky22@gmail.com',          studentEmail: 'aderoba1446@gmail.com',       studentName: 'Mide' },
  { parentEmail: 'sreeja79us@yahoo.com',       studentEmail: null,                          studentName: 'Aarav Vasudevan' },
  { parentEmail: 'urvi.mankad@gmail.com',      studentEmail: 'omvyas.0601@gmail.com',       studentName: 'Om Vyas' },
  { parentEmail: 'heatherjoy122@gmail.com',    studentEmail: 'Sapie0520@gmail.com',         studentName: 'Sara Abdelrahman',     parentName: 'Heather' },
  { parentEmail: 'rangarej@gmail.com',         studentEmail: 'vedrangarej0@gmail.com',      studentName: 'Ved' },
  { parentEmail: 'jakintide@gmail.com',        studentEmail: 'dakintide09@gmail.com',       studentName: 'Derin Akintide',       parentName: 'Jackie' },
  { parentEmail: 'syedp4463@gmail.com',        studentEmail: 'syedp4463@gmail.com',         studentName: 'Muzammil',             parentName: 'Syed Pasha',          parentPhone: '(773) 612-5845' },
  { parentEmail: 'farhan74@gmail.com',         studentEmail: '4maaz.k00@gmail.com',         studentName: 'Maz',                  parentName: 'Farhan Khan',         parentPhone: '(425) 457-0917' },
  { parentEmail: 'kajalpatel20@gmail.com',     studentEmail: 'shaan872009@gmail.com',       studentName: 'Shaan Patel',          parentName: 'Kajal Patel',         parentPhone: '(215) 834-8827' },
  { parentEmail: 'georgia_wright43@yahoo.com', studentEmail: '27collsa@dextersouthfield.org', studentName: 'Savannah',           parentName: 'Georgia' },
  { parentEmail: 'qperdon@yahoo.com',          studentEmail: 'jwongkaren27@llastudent.org', studentName: 'Javet Wongkaren',      parentName: 'Michelle Perdon' },
  { parentEmail: 'kimberly.rockers@gmail.com', studentEmail: 'susannah.rockers@gmail.com',  studentName: 'Susannah Rockers',     parentName: 'Kim Rockers' },
  { parentEmail: 'fola80@gmail.com',           studentEmail: 'fola80@gmail.com',            studentName: 'Abisola',              parentName: 'Fola' },
  { parentEmail: 'cerissapark@gmail.com',      studentEmail: 'oliviapark222@icloud.com',    studentName: 'Olivia Park',          parentName: 'Cerissa' },
  { parentEmail: 'defreest@gmail.com',         studentEmail: 'nicolaidefreest@gmail.com',   studentName: 'Nicolai Defreest',     parentName: 'Melissa DeFreest' },
  { parentEmail: 'nehashoney@gmail.com',       studentEmail: 'nehashoney@gmail.com',        studentName: 'Mrinal Agarwal',       parentName: 'Neha' },
  { parentEmail: 'vaish.rv83@gmail.com',       studentEmail: 'Saisaranvk@gmail.com',        studentName: 'Saisaran Vigneshkumar',parentName: 'Vaishnavi' },
  { parentEmail: 'jillcg91@yahoo.com',         studentEmail: 'defelicepierre34@gmail.com',  studentName: 'Pierre DeFelice',      parentName: 'Jill DeFelice' },
  { parentEmail: 'AWindard@HoustonISD.org',    studentEmail: 'scwinard@gmail.com',          studentName: 'Sophia Winard',        parentName: 'Andrea' },
  { parentEmail: 'kumar.chheda@gmail.com',     studentEmail: 'vishnu.chheda@gmail.com',     studentName: 'Vishnu Chheda',        parentName: 'Kumar' },
  { parentEmail: 'nnebblett@hotmail.com',      studentEmail: 'asherman76572@gmail.com',     studentName: 'Ann Sherman',          parentName: 'Natalie Sherman' },
  { parentEmail: 'folashade.brown@yahoo.com',  studentEmail: 'queenmimi1518@gmail.com',     studentName: 'Miracle Brown',        parentName: 'Folashade' },
  { parentEmail: 'pradnya_sunil@yahoo.com',    studentEmail: 'prishakolhe@icloud.com',      studentName: 'Prisha Kolhe',         parentName: 'Sunil Kolhe' },
  { parentEmail: 'zudiet@gmail.com',           studentEmail: 'emily123a@outlook.com',       studentName: 'Emily Dietzenbach',    parentName: 'Zu' },
  { parentEmail: 'calleyat@aol.com',           studentEmail: 'kairosen@gmail.com',          studentName: 'Kai Rosen',            parentName: 'Calley' },
  { parentEmail: 'rbnyc@hotmail.com',          studentEmail: 'angel48b@gmail.com',          studentName: 'Roopkatha Bagchi',     parentName: 'Ratna' },
  { parentEmail: 'jenmpackard@gmail.com',      studentEmail: 'isabelmvill12@gmail.com',     studentName: 'Isabel Villarreal',    parentName: 'Jen P',               parentPhone: '(210) 990-4454' },
  { parentEmail: 'payal79j@gmail.com',         studentEmail: 'Krish2008j@gmail.com',        studentName: 'Krish Jariwala',       parentName: 'Payal Jariwala',      parentPhone: '4434167036' },
  { parentEmail: 'pdsmd1@hotmail.com',         studentEmail: 'camillamorningstar777@gmail.com', studentName: 'Lauren Streck',    parentName: 'Paul Streck',         parentPhone: '6092211833' },
  { parentEmail: 'labkovich.alena@gmail.com',  studentEmail: 'mlabkovich@gmail.com',        studentName: 'Milana Labkovich',     parentName: 'Alena Labkovich',     parentPhone: '(781) 521-8574' },
  { parentEmail: 'drayissild@gmail.com',       studentEmail: 'ayissijessica9@gmail.com',    studentName: 'Jessica Ayissi',       parentName: 'Desire',              parentPhone: '15133285933' },
  { parentEmail: 'priva.vadavalli@gmail.com',  studentEmail: 'rishi.yadavalli10@gmail.com', studentName: 'Rishi Yadavalli',      parentName: 'Priva',               parentPhone: '14802934340' },
  { parentEmail: 'debbani11@yahoo.com',        studentEmail: 'aarinin04@gmail.com',         studentName: 'Aarini Naskar',        parentName: 'Debanni',             parentPhone: '14088885035' },
  { parentEmail: 'debusik@ymail.com',          studentEmail: 'aditrisikdar14@gmail.com',    studentName: 'Aditri Sikdar',        parentName: 'Debabrata Sikdar',    parentPhone: '14699099961' },
  { parentEmail: 'angeline.judex@gmail.com',   studentEmail: 'Kai.judex@gmail.com',         studentName: 'Kai Judex',            parentName: 'Angeline Judex',      parentPhone: '631-431-1192' },
  { parentEmail: 'beth.clauss@gmail.com',      studentEmail: 'addy.jane.hill@gmail.com',    studentName: 'Addy Hill',            parentName: 'Beth Clauss',         parentPhone: '12672407597' },
  { parentEmail: 'umapadhi2008@gmail.com',     studentEmail: 'bhargavpadhi09@gmail.com',    studentName: 'Bhargav Padhi',        parentName: 'Uma Padhi',           parentPhone: '1813-507-5466' },
  { parentEmail: 'wdrhll@aol.com',             studentEmail: 'myarihll@aol.com',            studentName: 'Mya Hill',             parentName: 'Woody Hill',          parentPhone: '917-494-8134' },
  { parentEmail: 'rvanap@gmail.com',           studentEmail: 'Vijayvanaparthy201011@gmail.com', studentName: 'Vijay Vanaparthy', parentName: 'Sairam Vanaparthy',   parentPhone: '314 623 4843' },
  { parentEmail: 'atchutb@gmail.com',          studentEmail: 'vineelm128@gmail.com',        studentName: 'Vineel Motadikela',    parentName: 'Atchuta',             parentPhone: '8484820442' },
  { parentEmail: 'ogeanazia123@gmail.com',     studentEmail: 'nnaallahj@gmail.com',         studentName: 'Nnaallah Anazia',      parentName: 'Oge Anazia',          parentPhone: '270 320 5986' },
  { parentEmail: 'jackievtoledo@gmail.com',    studentEmail: 'alecjosetoledo@gmail.com',    studentName: 'Alec Toledo',          parentName: 'Jackie Toledo',       parentPhone: '8132158435' },
  { parentEmail: 'reza.motarjem@gmail.com',    studentEmail: 'smotarjem27@hb.edu',          studentName: 'Setaya Motarjem',      parentName: 'Laleh Ghassemi',      parentPhone: '216 212 2626' },
  { parentEmail: 'winich12@yahoo.com',         studentEmail: 'chizm.eze@gmail.com',         studentName: 'Chisom Eze',           parentName: 'Chinwe Ezeanyika',    parentPhone: '9732628127' },
  { parentEmail: 's_navin@hotmail.com',        studentEmail: 'shreyasamba19@gmail.com',     studentName: 'Shreya Samba',         parentName: 'Naveen',              parentPhone: '303-523-5623' },
  { parentEmail: 'bencyab@hotmail.com',        studentEmail: 'anayaabraham29@gmail.com',    studentName: 'Anaya Abraham',        parentName: 'Bency',               parentPhone: '(734) 306-2693' },
  { parentEmail: 'simonew2015@att.net',        studentEmail: 'simone.willingham1202@gmail.com', studentName: 'Sydney Willingham',parentName: 'Simone Willingham',   parentPhone: '6785754719' },
  { parentEmail: 'donald.lilly1@gmail.com',    studentEmail: 'brittany.lilly2008@gmail.com',studentName: 'Brittany Lilly',       parentName: 'Donald Lilly',        parentPhone: '8645617732' },
  { parentEmail: 'hussain_syed1@yahoo.com',    studentEmail: 'askarinaqvi2008@gmail.com',   studentName: 'Askari Hussain',       parentName: 'Sajid Hussein',       parentPhone: '9194549687' },
  { parentEmail: 'soniasmith23@gmail.com',     studentEmail: 'emeriejsmith@gmail.com',      studentName: 'Emerie Smith',         parentName: 'Sonia',               parentPhone: '(817) 723-7141' },
  { parentEmail: 'msnmjp@gmail.com',           studentEmail: 'needlemana27@fordhamprep.org',studentName: 'Adam Needleman',       parentName: 'Michael Needleman',   parentPhone: '(917) 913-1123' },
  { parentEmail: 'jatts.crew@gmail.com',       studentEmail: 'temibella.apata@gmail.com',   studentName: 'Temi Apata',           parentName: 'Jummai Apata',        parentPhone: '4433073589' },
  { parentEmail: 's.sheynin@gmail.com',        studentEmail: 'kyle.levi.lerman@gmail.com',  studentName: 'Kyle Lerman',          parentName: 'Sheila Lerman',       parentPhone: '2013907841' },
  { parentEmail: 'deeptisingh.4@gmail.com',    studentEmail: 'contactprady@gmail.com',      studentName: 'Pradyumn Singh',       parentName: 'Deepti Singh',        parentPhone: '(919) 400-0513' },
  { parentEmail: 'ncuddapah@gmail.com',        studentEmail: 'rajcuddapah@gmail.com',       studentName: 'Raj Cuddapah',         parentName: 'Nirel Cuddapah',      parentPhone: '(678) 687-1250' },
  { parentEmail: 'Chanchalladdha@gmail.com',   studentEmail: 'suhaniladdha@gmail.com',      studentName: 'Suhani Laddha',        parentName: 'Chanchal Laddha',     parentPhone: '919 400 0513' },
  { parentEmail: 'tcamua@hotmail.com',         studentEmail: 'wrcv9898@gmail.com',          studentName: 'Willfred Villasica',   parentName: 'Thelma Villasica',    parentPhone: '3016134675' },
  { parentEmail: 'rash_ashwin@yahoo.co.in',    studentEmail: 'arrowbow16@gmail.com',        studentName: 'Nitant Handa',         parentName: 'Rashmi',              parentPhone: '2019650666' },
  { parentEmail: 'ygasperino@gmail.com',       studentEmail: null,                          studentName: 'Shayne Dagleish',      parentName: 'Yvonne',              parentPhone: '914 409 6269' },
  { parentEmail: 'lathabaddam@gmail.com',      studentEmail: 'Aayushreddymusku@gmail.com',  studentName: 'Aayush Musku',         parentName: 'Latha Baddam',        parentPhone: '(301) 401-2985' },
  { parentEmail: 'praveen.ramashetty@gmail.com',studentEmail: 'chaitan.katta@gmail.com',   studentName: 'Chaitan Praveen',      parentName: 'Praveen' },
  { parentEmail: 'syeda.nida.haider@gmail.com',studentEmail: 'syeda.nida.haider@gmail.com', studentName: 'Muhammad Haider',      parentName: 'Nida' },
  // Additional from the phone/name section not already covered
  { parentEmail: 'jakintide@gmail.com',        studentEmail: null,                          studentName: 'Javyn',                parentName: 'Tricia',              parentPhone: '(407) 394-5072' },
  { parentEmail: 'kimberly.rockers@gmail.com', studentEmail: 'susannah.rockers@gmail.com',  studentName: 'Susannah Rockers',     parentName: 'Kim Rockers' },
  { parentEmail: 'syedp4463@gmail.com',        studentEmail: 'syedp4463@gmail.com',         studentName: 'Muzammil',             parentName: 'Syed Pasha',          parentPhone: '(773) 612-5845' },
];

// Deduplicate by studentName (keep last occurrence which may have more data)
const seen = new Map<string, Mapping>();
for (const m of MAPPINGS) {
  const key = m.studentName.toLowerCase().trim();
  const existing = seen.get(key);
  // Merge: keep richer data
  if (existing) {
    seen.set(key, {
      ...existing,
      ...m,
      parentName:  m.parentName  ?? existing.parentName,
      parentPhone: m.parentPhone ?? existing.parentPhone,
    });
  } else {
    seen.set(key, m);
  }
}
const DEDUPED = Array.from(seen.values());

// ── Helpers ────────────────────────────────────────────────────────────────────

async function findStudentByEmail(email: string): Promise<any | null> {
  const { data } = await supabase.from('students').select('id,name,email,parent_email,parent_name')
    .ilike('email', email).limit(2);
  if (!data || data.length === 0) return null;
  // Prefer non-import record
  const real = data.find((r: any) => !r.email?.includes('@studycore.import'));
  return real ?? data[0];
}

async function findStudentByName(name: string): Promise<any | null> {
  const { data } = await supabase.from('students').select('id,name,email,parent_email,parent_name')
    .ilike('name', `%${name.split(' ')[0]}%`);
  if (!data || data.length === 0) return null;
  // Exact or closest match, prefer non-import
  const normalized = name.toLowerCase();
  const exact = data.find((r: any) => r.name?.toLowerCase() === normalized);
  if (exact) return exact;
  const real = data.find((r: any) => !r.email?.includes('@studycore.import'));
  return real ?? data[0];
}

async function sendOnboardingEmail(student: any, parentEmail: string, parentName: string | undefined): Promise<boolean> {
  const token     = await signParentJWT(parentEmail.toLowerCase());
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;
  const greeting  = parentName ? `Hi ${parentName},` : 'Hi,';
  const NAVY = '#1e2090';

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.09);}
  .header{background:${NAVY};padding:28px 36px;}
  .header h1{color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-.3px;}
  .header p{color:#9ab0ff;margin:5px 0 0;font-size:14px;}
  .body{padding:36px;}
  .body p{color:#374151;line-height:1.7;margin:0 0 14px;font-size:15px;}
  .cta-wrap{text-align:center;margin:28px 0;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;}
  .steps{margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
  .step{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid #f3f4f6;}
  .step:last-child{border-bottom:none;}
  .step-num{width:28px;height:28px;border-radius:50%;background:${NAVY};color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
  .step-title{font-weight:600;color:#111827;font-size:14px;margin:0 0 3px;}
  .step-desc{color:#6b7280;font-size:13px;margin:0;line-height:1.5;}
  .resources{background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px 24px;margin:24px 0;}
  .resources h3{margin:0 0 12px;font-size:15px;color:#1e2090;font-weight:700;}
  .resource-item{margin-bottom:14px;}
  .resource-title{font-weight:600;color:#111827;font-size:14px;}
  .resource-body{color:#6b7280;font-size:13px;line-height:1.55;margin:3px 0 0;}
  ul.tips{margin:4px 0 0 16px;padding:0;color:#6b7280;font-size:13px;line-height:1.7;}
  .footer{padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">
  <div class="header"><h1>StudyCore</h1><p>Welcome — Your Next Steps</p></div>
  <div class="body">
    <p>${greeting}</p>
    <p>We're excited to have <strong>${student.name}</strong> join StudyCore! To get the most out of your tutoring experience, please complete a few quick onboarding steps. It only takes a few minutes.</p>
    <div class="cta-wrap"><a href="${magicLink}" class="btn">Access Your Parent Portal →</a></div>
    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:-10px">Link is valid for 7 days. No password needed.</p>
    <p style="margin-top:24px;font-weight:600;color:#111827;font-size:15px;">Your 5 onboarding steps:</p>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div><p class="step-title">Portal Access</p><p class="step-desc">Click the link above to log into your parent portal. You're already on your way!</p></div></div>
      <div class="step"><div class="step-num">2</div><div><p class="step-title">Complete the Student Intake Form</p><p class="step-desc">Tell us about ${student.name}'s current scores, target score, test date, and learning style so we can personalize their program.</p></div></div>
      <div class="step"><div class="step-num">3</div><div><p class="step-title">Schedule a Kickoff Call</p><p class="step-desc">Join a short 15-minute intro call with your tutor to align on goals and answer any questions.</p></div></div>
      <div class="step"><div class="step-num">4</div><div><p class="step-title">Review the Game Plan</p><p class="step-desc">Once your tutor creates a personalized study plan for ${student.name}, review and acknowledge it in the portal.</p></div></div>
      <div class="step"><div class="step-num">5</div><div><p class="step-title">Confirm the Session Schedule</p><p class="step-desc">Review the upcoming session schedule and confirm it works for your family's calendar.</p></div></div>
    </div>
    <div class="resources">
      <h3>📚 Resources for Parents</h3>
      <div class="resource-item"><div class="resource-title">How sessions work</div><div class="resource-body">All sessions are held via Zoom. You'll receive a join link in each booking confirmation email. After each session, your tutor will log notes on what was covered and any follow-up items.</div></div>
      <div class="resource-item"><div class="resource-title">Supporting your student at home</div><ul class="tips"><li>Encourage 30–60 min of independent SAT practice between sessions</li><li>Review the tutor's session notes together</li><li>Make sure your student has a quiet, distraction-free study space</li><li>Stay positive — consistent progress beats cramming every time</li></ul></div>
      <div class="resource-item"><div class="resource-title">How to reach us</div><div class="resource-body">Questions? Email us anytime at <a href="mailto:info@studycore.net" style="color:${NAVY}">info@studycore.net</a>.</div></div>
    </div>
    <p>We're looking forward to helping ${student.name} reach their goal. Let's get started!</p>
    <p style="margin-top:20px;font-weight:600;color:#111827;">The StudyCore Team</p>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} StudyCore. All rights reserved.<br><a href="mailto:info@studycore.net" style="color:#9ca3af">info@studycore.net</a></div>
</div></body></html>`;

  const { error } = await resend.emails.send({
    from:    FROM as string,
    to:      [parentEmail],
    cc:      [CC],
    subject: `Welcome to StudyCore — Your Next Steps for ${student.name}`,
    html,
  }) as any;

  if (error) {
    console.error(`    ✗ Email error for ${parentEmail}: ${(error as any).message ?? JSON.stringify(error)}`);
    return false;
  }
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const HR = '─'.repeat(72);
  console.log(`\n${HR}`);
  console.log('  Link Parents to Students + Send Onboarding Emails');
  if (DRY_RUN) console.log('  *** DRY RUN — no writes or emails ***');
  console.log(`${HR}\n`);

  const results = {
    emailUpdated:    0,
    emailSkipped:    0,
    nameUpdated:     0,
    emailsSent:      0,
    emailsFailed:    0,
    notFound:        [] as string[],
    alreadyCorrect:  [] as string[],
    updated:         [] as string[],
  };

  // Students whose parent_email was newly set → send onboarding email
  const toEmail: Array<{ student: any; parentEmail: string; parentName: string | undefined }> = [];

  console.log(`Processing ${DEDUPED.length} unique student mappings…\n`);

  for (const m of DEDUPED) {
    let student: any = null;

    // 1. Find by student email
    if (m.studentEmail) {
      student = await findStudentByEmail(m.studentEmail);
    }
    // 2. Fallback: find by student name
    if (!student) {
      student = await findStudentByName(m.studentName);
    }

    if (!student) {
      console.log(`  ○ NOT FOUND: ${m.studentName} (email: ${m.studentEmail ?? 'none'})`);
      results.notFound.push(m.studentName);
      continue;
    }

    const normalizedParent = m.parentEmail.toLowerCase().trim();
    const currentParent    = (student.parent_email ?? '').toLowerCase().trim();

    // Check if already correct
    if (currentParent === normalizedParent && student.parent_name) {
      console.log(`  ⏭  ${student.name} — already has ${m.parentEmail} (skipped)`);
      results.alreadyCorrect.push(student.name);
      results.emailSkipped++;
      continue;
    }

    const isEmailChange = currentParent !== normalizedParent;
    const updates: Record<string, any> = {};

    if (isEmailChange) {
      updates.parent_email = m.parentEmail;
    }
    if (m.parentName) {
      updates.parent_name = m.parentName;
    }

    if (Object.keys(updates).length === 0) {
      console.log(`  ⏭  ${student.name} — no changes needed`);
      results.emailSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${student.name} → parent: ${m.parentEmail}${m.parentName ? ` (${m.parentName})` : ''}`);
      results.emailUpdated++;
      continue;
    }

    const { error } = await supabase.from('students').update(updates).eq('id', student.id);
    if (error) {
      console.log(`  ✗ DB error for ${student.name}: ${error.message}`);
      continue;
    }

    const changes: string[] = [];
    if (isEmailChange) changes.push(`email: ${currentParent || '(none)'} → ${m.parentEmail}`);
    if (m.parentName && student.parent_name !== m.parentName) { changes.push(`name: ${m.parentName}`); results.nameUpdated++; }
    console.log(`  ✅  ${student.name} — ${changes.join(', ')}`);

    if (isEmailChange) results.emailUpdated++;

    // Queue onboarding email if we just set a new parent email
    // Skip if parent email === student email (parent is the student themselves)
    const shouldEmail = isEmailChange &&
      normalizedParent !== (student.email ?? '').toLowerCase().trim() &&
      normalizedParent.length > 0;

    if (shouldEmail) {
      toEmail.push({ student: { ...student, name: student.name }, parentEmail: m.parentEmail, parentName: m.parentName });
    }

    results.updated.push(student.name);
  }

  // ── Send onboarding emails ──────────────────────────────────────────────────
  if (toEmail.length > 0) {
    console.log(`\n${HR}`);
    console.log(`  Sending ${toEmail.length} parent onboarding email(s)…`);
    console.log(`${HR}\n`);

    for (const { student, parentEmail, parentName } of toEmail) {
      if (DRY_RUN) {
        console.log(`  [dry-run] email → ${parentEmail} for ${student.name}`);
        results.emailsSent++;
        continue;
      }

      console.log(`  → ${student.name} (${parentEmail})…`);
      const sent = await sendOnboardingEmail(student, parentEmail, parentName);
      if (sent) {
        // Mark onboarding email sent
        await supabase.from('students').update({
          onboarding_email_sent: true,
          onboarding_email_sent_at: new Date().toISOString(),
        }).eq('id', student.id);
        console.log(`    ✅  Sent`);
        results.emailsSent++;
      } else {
        results.emailsFailed++;
      }

      // Small delay to avoid Resend rate limits
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log('  SUMMARY');
  console.log(HR);
  console.log(`  Parent emails updated:          ${results.emailUpdated}`);
  console.log(`  Parent names updated:           ${results.nameUpdated}`);
  console.log(`  Already correct (skipped):      ${results.emailSkipped}`);
  console.log(`  Onboarding emails sent:         ${results.emailsSent}`);
  if (results.emailsFailed > 0)
    console.log(`  Onboarding emails FAILED:       ${results.emailsFailed}`);
  console.log(`  Students not found in DB:       ${results.notFound.length}`);
  if (results.notFound.length > 0) {
    for (const n of results.notFound) console.log(`    - ${n}`);
  }
  if (DRY_RUN) console.log('\n  *** DRY RUN — no writes or emails were sent ***');
  console.log(`${HR}\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
