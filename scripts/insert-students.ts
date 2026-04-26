import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const NAMES = [
  'Alessandra Tamayo', 'Ariyana Patel', 'Jose Tamayo', 'aayush', 'Adam Ayyub',
  'Gosifechukwu Ugwu', 'Nitant Handa', 'Shayne Dalgleish', 'Temi Apata', 'Suhani Laddha',
  'Mide', 'Aiden Aponte Maxwell', 'Pradyumn Singh', 'Willfred Villasica', 'Sydney Willingham',
  'Nnaallah', 'Addy Hill', 'Kyle Lerman', 'Askari Hussain', 'Adam Needleman',
  'Setaya Motarjem', 'Vijay Vanaparthy', 'Rauha', 'Maaz', 'Mya Hall',
  'Shreya Samba', 'setaya', 'Chisom Ezeanyika', 'Kurt Henline', 'Kai Judex',
  'Vineel Motadikela', 'Bhargav', 'Raj Cuddapah', 'Sara Kalangi', 'Aarini Naskar',
  'Aditri Sikdar', 'Dikshant Ahuja', 'Alec Toledo', 'Brittany Lilly', 'Rishi Yadavalli',
  'Sophia Winard', 'Roopkatha Bagchi', 'Jessica Ayissi', 'Colby Burton', 'Lauren Streck',
  'Arush Roy', 'Krish Jariwala', 'Sid Iyer', 'Kai', 'Emily Dietzenbach',
  'Isabel Villarreal', 'Milana Labkovich', 'Sara Kalangi', 'Aaditya Kapoor', 'Muhammad Haider',
  'Miracle Brown', 'Arinze Nwafor', 'Prisha Kolhe', 'Santiago Perez', 'Vishnu',
  'Saanvi Sunil', 'Ann Sherman', 'Saisaran Vigneshkumar', 'Pierre DeFelice',
  'radhae muthukumaraswamy', 'Saanvi Kumar', 'Chaitan Praveen', 'Irtaza Haider',
  'Nicolai Defreest', 'Susannah Rockers', 'Olivia Park', 'Moin Khan', 'Nicholas Zaccagnino',
  'Mrinal Agarwal', 'Abisola Abdul', 'Savannah', 'Javet Wongkaren', 'Team Burton',
  'Arnav Mishra', 'Shaan Patel', 'Muzammil', 'Justin Shah', 'David Bogart',
  'Om Vyas', 'shreya shah', 'Derin Akintide', 'Adithya reddy', 'ved r',
  'Sara Abdelrahman', 'Snch', 'Aarush Das', 'Aarav Vasudevan', 'Arham Usman',
  'Emerie Smith', 'Anaya Abraham', 'Avleen Gahunia', 'Monica', 'Elijah Zittel',
  'Enakshi', 'Sanjana Mehta', 'abbie pongpat', 'Adam Hamid', 'Harshith',
  'Medha Anantuni', 'Somesh Bhatt', 'Isha Ganatra', 'Adhya Ganatra', 'Tanishi Pathak',
];

async function main() {
  console.log('🗑️  Clearing tables...');
  for (const table of ['sessions', 'student_progress', 'students'] as const) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { console.error(`Failed to clear ${table}:`, error.message); process.exit(1); }
    console.log(`  ✅ Cleared ${table}`);
  }

  console.log(`\n💾  Inserting ${NAMES.length} students...`);

  const rows = NAMES.map((name, i) => ({
    name,
    // Unique placeholder — include index to handle duplicate names (e.g. "Sara Kalangi" x2)
    email: `student-${i + 1}-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@studycore.import`,
    notes: 'SAT',
  }));

  const { error } = await supabase.from('students').insert(rows);
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`✅  Inserted ${rows.length} students.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
