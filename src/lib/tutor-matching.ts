import { createClient } from '@supabase/supabase-js';
import { deriveAvailabilityUTC, utcMinuteOfDay, utcDayOfWeek } from './availability-utc';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export interface OverlapSlot {
  day: number;        // UTC day-of-week (0=Sun … 6=Sat)
  start_time: string; // "HH:MM" in UTC
  end_time: string;   // "HH:MM" in UTC
}

export interface TutorMatch {
  tutor: {
    id: string;
    name: string;
    email: string;
    subjects: string[];
    hourly_rate: number;
    photo_url: string | null;
  };
  total_score: number;
  subject_score: number;
  availability_score: number;
  load_score: number;
  active_students: number;
  overlapping_slots: OverlapSlot[];
  match_label: 'Excellent Match' | 'Good Match' | 'Fair Match';
}

const SAT_SUBJECTS = ['SAT', 'ACT', 'PSAT'];

export async function getTopTutorMatches(studentId: string): Promise<TutorMatch[]> {
  const [tutorsRes, studentRes, studentAvailRes, tutorAvailRes, contractsRes] = await Promise.all([
    getDb().from('tutors').select('id, name, email, subjects, hourly_rate, photo_url').is('archived_at', null),
    getDb().from('students').select('timezone').eq('id', studentId).single(),
    getDb()
      .from('student_availability')
      .select('day_of_week, start_time, end_time')
      .eq('student_id', studentId)
      .eq('is_active', true),
    // Only read rows that have been backfilled with UTC columns
    getDb()
      .from('tutor_availability')
      .select('tutor_id, start_utc, end_utc')
      .eq('is_active', true)
      .not('start_utc', 'is', null),
    getDb().from('contracts').select('tutor_id').eq('status', 'signed'),
  ]);

  const tutors          = tutorsRes.data ?? [];
  const studentTz       = studentRes.data?.timezone ?? 'America/New_York';
  const studentSlots    = studentAvailRes.data ?? [];
  const allTutorSlots   = tutorAvailRes.data ?? [];
  const signedContracts = contractsRes.data ?? [];

  // Count active (signed) contracts per tutor
  const contractCounts: Record<string, number> = {};
  for (const c of signedContracts) {
    contractCounts[c.tutor_id] = (contractCounts[c.tutor_id] ?? 0) + 1;
  }

  // Convert student slots to UTC for cross-timezone comparison
  const studentSlotsUTC = studentSlots.map(s =>
    deriveAvailabilityUTC(s.day_of_week, s.start_time, s.end_time, studentTz),
  );

  // Total student available minutes (duration is timezone-invariant)
  const totalStudentMinutes = studentSlots.reduce((sum, slot) => {
    return sum + timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
  }, 0);

  const matches: TutorMatch[] = tutors.map(tutor => {
    // ── Subject score ──────────────────────────────────────────
    const subjects: string[] = tutor.subjects ?? [];
    const subjectScore = subjects.length > 0 &&
      subjects.some(s => SAT_SUBJECTS.some(sat => s.toUpperCase().includes(sat)))
      ? 40 : 0;

    // ── Availability score (UTC-based) ─────────────────────────
    const tutorSlots = allTutorSlots.filter(s => s.tutor_id === tutor.id);
    let availScore: number;
    const overlappingSlots: OverlapSlot[] = [];

    if (totalStudentMinutes === 0 || tutorSlots.length === 0) {
      availScore = 17.5; // neutral — no data for one or both sides
    } else {
      let overlapMinutes = 0;

      for (const sSlot of studentSlotsUTC) {
        const sDow   = utcDayOfWeek(sSlot.start_utc);
        const sStart = utcMinuteOfDay(sSlot.start_utc);
        const sEnd   = utcMinuteOfDay(sSlot.end_utc);

        for (const tSlot of tutorSlots) {
          const tDow = utcDayOfWeek(tSlot.start_utc);
          if (tDow !== sDow) continue;

          const tStart = utcMinuteOfDay(tSlot.start_utc);
          const tEnd   = utcMinuteOfDay(tSlot.end_utc);

          const overlapStart = Math.max(sStart, tStart);
          const overlapEnd   = Math.min(sEnd, tEnd);

          if (overlapEnd > overlapStart) {
            overlapMinutes += overlapEnd - overlapStart;
            overlappingSlots.push({
              day:        sDow,
              start_time: minutesToTime(overlapStart),
              end_time:   minutesToTime(overlapEnd),
            });
          }
        }
      }

      availScore = Math.min(35, (overlapMinutes / totalStudentMinutes) * 35);
    }

    // ── Load score ─────────────────────────────────────────────
    const activeStudents = contractCounts[tutor.id] ?? 0;
    let loadScore: number;
    if (activeStudents === 0)      loadScore = 25;
    else if (activeStudents <= 2)  loadScore = 20;
    else if (activeStudents <= 4)  loadScore = 15;
    else if (activeStudents <= 6)  loadScore = 10;
    else                           loadScore = 5;

    const totalScore = Math.round(subjectScore + availScore + loadScore);
    const match_label: TutorMatch['match_label'] =
      totalScore >= 80 ? 'Excellent Match' :
      totalScore >= 60 ? 'Good Match' :
                         'Fair Match';

    return {
      tutor: {
        id:          tutor.id,
        name:        tutor.name,
        email:       tutor.email,
        subjects,
        hourly_rate: tutor.hourly_rate,
        photo_url:   tutor.photo_url,
      },
      total_score:        totalScore,
      subject_score:      subjectScore,
      availability_score: Math.round(availScore * 10) / 10,
      load_score:         loadScore,
      active_students:    activeStudents,
      overlapping_slots:  overlappingSlots,
      match_label,
    };
  });

  return matches.sort((a, b) => b.total_score - a.total_score).slice(0, 3);
}
