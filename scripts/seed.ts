import { createClient } from '@supabase/supabase-js';
import { subDays, addDays, setHours, setMinutes } from 'date-fns';

// Load env vars
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log('🌱  Seeding StudyCore database...\n');

  // ── 1. Admin user ──────────────────────────────────────────
  console.log('Creating admin user...');
  const { error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@studycore.com',
    password: 'StudyCore2024!',
    email_confirm: true,
  });
  if (authError && !authError.message.includes('already been registered')) {
    console.error('Admin user error:', authError.message);
  } else {
    console.log('✅  Admin user: admin@studycore.com / StudyCore2024!');
  }

  // ── 2. Tutors ──────────────────────────────────────────────
  console.log('\nCreating tutors...');
  const { data: tutors, error: tutorErr } = await supabase.from('tutors').insert([
    {
      name: 'Sarah Chen',
      email: 'sarah.chen@tutors.studycore.com',
      phone: '+1 (415) 555-0101',
      bio: 'Harvard-educated educator with 6 years of SAT tutoring experience. Specializes in Math and helps students break 1500+.',
      subjects: ['SAT Math', 'SAT Reading', 'ACT Math'],
      hourly_rate: 85,
      payment_info: 'Venmo @sarah-chen-tutor',
      zoom_user_id: null,
      availability_mode: 'manual',
    },
    {
      name: 'Marcus Johnson',
      email: 'marcus.j@tutors.studycore.com',
      phone: '+1 (212) 555-0202',
      bio: 'Former CollegeBoard test developer with deep knowledge of Reading and Writing sections. Perfect 800 in Evidence-Based Reading.',
      subjects: ['SAT Reading', 'SAT Writing', 'ACT English', 'ACT Reading'],
      hourly_rate: 95,
      payment_info: 'Bank transfer — contact admin',
      zoom_user_id: null,
      availability_mode: 'form',
    },
    {
      name: 'Priya Patel',
      email: 'priya.p@tutors.studycore.com',
      phone: '+1 (650) 555-0303',
      bio: 'Stanford grad student with a passion for test prep. Helped 50+ students increase scores by 200+ points.',
      subjects: ['SAT Math', 'ACT Math', 'ACT Science'],
      hourly_rate: 75,
      payment_info: 'Zelle 650-555-0303',
      zoom_user_id: null,
      availability_mode: 'manual',
    },
  ]).select();

  if (tutorErr) { console.error('Tutor error:', tutorErr.message); }
  else console.log(`✅  Created ${tutors?.length} tutors`);

  // ── 3. Availability ────────────────────────────────────────
  if (tutors?.length) {
    const [sarah, marcus, priya] = tutors;
    const availSlots = [
      // Sarah: Mon/Wed/Fri 9am-5pm, Sat 10am-2pm
      { tutor_id: sarah.id, day_of_week: 1, start_time: '09:00', end_time: '17:00', is_active: true },
      { tutor_id: sarah.id, day_of_week: 3, start_time: '09:00', end_time: '17:00', is_active: true },
      { tutor_id: sarah.id, day_of_week: 5, start_time: '09:00', end_time: '17:00', is_active: true },
      { tutor_id: sarah.id, day_of_week: 6, start_time: '10:00', end_time: '14:00', is_active: true },
      // Marcus: Tue/Thu 2pm-8pm, Sun 12pm-6pm
      { tutor_id: marcus.id, day_of_week: 2, start_time: '14:00', end_time: '20:00', is_active: true },
      { tutor_id: marcus.id, day_of_week: 4, start_time: '14:00', end_time: '20:00', is_active: true },
      { tutor_id: marcus.id, day_of_week: 0, start_time: '12:00', end_time: '18:00', is_active: true },
      // Priya: Mon-Fri 4pm-9pm
      { tutor_id: priya.id, day_of_week: 1, start_time: '16:00', end_time: '21:00', is_active: true },
      { tutor_id: priya.id, day_of_week: 2, start_time: '16:00', end_time: '21:00', is_active: true },
      { tutor_id: priya.id, day_of_week: 3, start_time: '16:00', end_time: '21:00', is_active: true },
      { tutor_id: priya.id, day_of_week: 4, start_time: '16:00', end_time: '21:00', is_active: true },
      { tutor_id: priya.id, day_of_week: 5, start_time: '16:00', end_time: '21:00', is_active: true },
    ];
    const { error: availErr } = await supabase.from('tutor_availability').insert(availSlots);
    if (availErr) console.error('Availability error:', availErr.message);
    else console.log('✅  Availability slots created');
  }

  // ── 4. Students ────────────────────────────────────────────
  console.log('\nCreating students...');
  const { data: students, error: studErr } = await supabase.from('students').insert([
    { name: 'Alex Rivera',    email: 'alex.r@email.com',    phone: '+1 (555) 100-0001', parent_name: 'Maria Rivera',   parent_email: 'maria.r@email.com',   grade: 11, current_score: 1180, target_score: 1450, notes: 'Strong in math, needs work on reading comprehension and pacing.' },
    { name: 'Jamie Park',     email: 'jamie.p@email.com',   phone: '+1 (555) 100-0002', parent_name: 'Kevin Park',     parent_email: 'kevin.p@email.com',   grade: 10, current_score: 1050, target_score: 1300, notes: 'First-gen student. Very motivated. Struggles with evidence-based questions.' },
    { name: 'Sophia Williams',email: 'sophia.w@email.com',  phone: '+1 (555) 100-0003', parent_name: 'David Williams', parent_email: 'david.w@email.com',   grade: 12, current_score: 1320, target_score: 1500, notes: 'Applying to top schools. Needs consistent 1500+ on practice tests.' },
    { name: 'Ethan Thompson', email: 'ethan.t@email.com',   phone: '+1 (555) 100-0004', parent_name: 'Lisa Thompson',  parent_email: 'lisa.t@email.com',    grade: 11, current_score: 980,  target_score: 1200, notes: 'Math anxiety. Needs confidence building and algebra fundamentals.' },
    { name: 'Chloe Martinez', email: 'chloe.m@email.com',   phone: '+1 (555) 100-0005', parent_name: 'Roberto Martinez',parent_email:'r.martinez@email.com', grade: 10, current_score: 1100, target_score: 1350, notes: 'Strong reader. ACT Science is a weak point — also preparing for ACT.' },
  ]).select();

  if (studErr) { console.error('Student error:', studErr.message); }
  else console.log(`✅  Created ${students?.length} students`);

  // ── 5. Sessions ────────────────────────────────────────────
  if (tutors?.length && students?.length) {
    console.log('\nCreating sessions...');
    const [sarah, marcus, priya] = tutors;
    const [alex, jamie, sophia, ethan, chloe] = students;
    const now = new Date();

    const dt = (daysAgo: number, hour: number, minute = 0) =>
      setMinutes(setHours(subDays(now, daysAgo), hour), minute).toISOString();

    const sessions = [
      { tutor_id: sarah.id,  student_id: alex.id,    scheduled_at: dt(28, 10),    duration_minutes: 60,  status: 'completed', payment_status: 'paid',    payment_amount: 85,    session_notes: 'Covered linear equations and systems. Alex showed great improvement.' },
      { tutor_id: marcus.id, student_id: jamie.id,   scheduled_at: dt(21, 15),    duration_minutes: 60,  status: 'completed', payment_status: 'paid',    payment_amount: 95,    session_notes: 'Evidence-based reading practice. Worked on annotation strategies.' },
      { tutor_id: priya.id,  student_id: sophia.id,  scheduled_at: dt(18, 16, 30),duration_minutes: 90,  status: 'completed', payment_status: 'paid',    payment_amount: 112.5, session_notes: 'Full practice test review. Sophia hit 1480 — almost there!' },
      { tutor_id: sarah.id,  student_id: ethan.id,   scheduled_at: dt(14, 9),     duration_minutes: 60,  status: 'completed', payment_status: 'paid',    payment_amount: 85,    session_notes: 'Algebra fundamentals. Worked through his anxiety with simpler problems first.' },
      { tutor_id: marcus.id, student_id: chloe.id,   scheduled_at: dt(10, 14),    duration_minutes: 60,  status: 'completed', payment_status: 'paid',    payment_amount: 95,    session_notes: 'Reading comprehension strategies. Strong improvement in paired passage questions.' },
      { tutor_id: sarah.id,  student_id: alex.id,    scheduled_at: dt(7, 10),     duration_minutes: 60,  status: 'completed', payment_status: 'paid',    payment_amount: 85,    session_notes: 'Quadratics and advanced algebra. Alex is ready for geometry next session.' },
      { tutor_id: priya.id,  student_id: ethan.id,   scheduled_at: dt(5, 17),     duration_minutes: 60,  status: 'completed', payment_status: 'pending', payment_amount: 75,    session_notes: 'Geometry intro. Ethan is building confidence nicely.' },
      { tutor_id: marcus.id, student_id: sophia.id,  scheduled_at: dt(3, 15),     duration_minutes: 60,  status: 'completed', payment_status: 'pending', payment_amount: 95,    session_notes: 'Writing section drills. Comma usage and sentence structure.' },
      { tutor_id: sarah.id,  student_id: jamie.id,   scheduled_at: dt(1, 11),     duration_minutes: 90,  status: 'completed', payment_status: 'pending', payment_amount: 127.5, session_notes: 'Full mock reading section with timed conditions. Score improved by 40 points.' },
      { tutor_id: priya.id,  student_id: chloe.id,   scheduled_at: addDays(now, 2).toISOString(), duration_minutes: 60, status: 'scheduled', payment_status: 'pending', payment_amount: 75, session_notes: null },
    ];

    const { error: sessErr } = await supabase.from('sessions').insert(sessions);
    if (sessErr) console.error('Sessions error:', sessErr.message);
    else console.log(`✅  Created ${sessions.length} sessions`);

    // ── 6. Progress Scores ────────────────────────────────────
    console.log('\nLogging progress scores...');
    const progressRecords = [
      { student_id: alex.id,    math_score: 620, reading_score: 560, writing_score: 560, total_score: 1180, recorded_at: dt(28, 9).replace('T',  ' ').slice(0,19), notes: 'Baseline' },
      { student_id: alex.id,    math_score: 650, reading_score: 570, writing_score: 570, total_score: 1220, recorded_at: dt(7, 9).replace('T', ' ').slice(0,19),   notes: 'After session 2' },
      { student_id: jamie.id,   math_score: 530, reading_score: 520, writing_score: 510, total_score: 1050, recorded_at: dt(21, 14).replace('T',' ').slice(0,19),  notes: 'Baseline' },
      { student_id: jamie.id,   math_score: 540, reading_score: 550, writing_score: 530, total_score: 1090, recorded_at: dt(1, 10).replace('T',' ').slice(0,19),   notes: 'Progress check' },
      { student_id: sophia.id,  math_score: 660, reading_score: 660, writing_score: 660, total_score: 1320, recorded_at: dt(18, 16).replace('T',' ').slice(0,19),  notes: 'Baseline' },
      { student_id: sophia.id,  math_score: 730, reading_score: 750, writing_score: 740, total_score: 1480, recorded_at: dt(3, 14).replace('T',' ').slice(0,19),   notes: 'Mock test — great progress!' },
      { student_id: ethan.id,   math_score: 500, reading_score: 480, writing_score: 480, total_score: 980,  recorded_at: dt(14, 8).replace('T',' ').slice(0,19),   notes: 'Baseline' },
      { student_id: ethan.id,   math_score: 530, reading_score: 490, writing_score: 490, total_score: 1020, recorded_at: dt(5, 16).replace('T',' ').slice(0,19),   notes: 'Geometry session' },
      { student_id: chloe.id,   math_score: 560, reading_score: 540, writing_score: 540, total_score: 1100, recorded_at: dt(10, 13).replace('T',' ').slice(0,19),  notes: 'Baseline' },
    ];

    const { error: progErr } = await supabase.from('student_progress').insert(progressRecords);
    if (progErr) console.error('Progress error:', progErr.message);
    else console.log(`✅  Logged ${progressRecords.length} progress records`);
  }

  console.log('\n🎉  Seed complete!\n');
  console.log('Admin login:');
  console.log('  Email:    admin@studycore.com');
  console.log('  Password: StudyCore2024!\n');
}

seed().catch(console.error);
