import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  day: number;
  start_time: string;
  end_time: string;
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
  const [tutorsRes, studentAvailRes, tutorAvailRes, contractsRes] = await Promise.all([
    supabase.from('tutors').select('id, name, email, subjects, hourly_rate, photo_url').is('archived_at', null),
    supabase
      .from('student_availability')
      .select('day_of_week, start_time, end_time')
      .eq('student_id', studentId)
      .eq('is_active', true),
    supabase
      .from('tutor_availability')
      .select('tutor_id, day_of_week, start_time, end_time')
      .eq('is_active', true),
    supabase.from('contracts').select('tutor_id').eq('status', 'signed'),
  ]);

  const tutors = tutorsRes.data ?? [];
  const studentSlots = studentAvailRes.data ?? [];
  const allTutorSlots = tutorAvailRes.data ?? [];
  const signedContracts = contractsRes.data ?? [];

  // Count active (signed) contracts per tutor
  const contractCounts: Record<string, number> = {};
  for (const c of signedContracts) {
    contractCounts[c.tutor_id] = (contractCounts[c.tutor_id] ?? 0) + 1;
  }

  // Total student available minutes
  const totalStudentMinutes = studentSlots.reduce((sum, slot) => {
    return sum + timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
  }, 0);

  const matches: TutorMatch[] = tutors.map(tutor => {
    // ── Subject score ──────────────────────────────────────────
    const subjects: string[] = tutor.subjects ?? [];
    const subjectScore = subjects.length > 0 &&
      subjects.some(s => SAT_SUBJECTS.some(sat => s.toUpperCase().includes(sat)))
      ? 40 : 0;

    // ── Availability score ─────────────────────────────────────
    const tutorSlots = allTutorSlots.filter(s => s.tutor_id === tutor.id);
    let availScore: number;
    const overlappingSlots: OverlapSlot[] = [];

    if (totalStudentMinutes === 0 || tutorSlots.length === 0) {
      availScore = 17.5; // neutral — no data for one or both sides
    } else {
      let overlapMinutes = 0;
      for (const sSlot of studentSlots) {
        const sStart = timeToMinutes(sSlot.start_time);
        const sEnd   = timeToMinutes(sSlot.end_time);
        for (const tSlot of tutorSlots.filter(t => t.day_of_week === sSlot.day_of_week)) {
          const tStart = timeToMinutes(tSlot.start_time);
          const tEnd   = timeToMinutes(tSlot.end_time);
          const overlapStart = Math.max(sStart, tStart);
          const overlapEnd   = Math.min(sEnd, tEnd);
          if (overlapEnd > overlapStart) {
            overlapMinutes += overlapEnd - overlapStart;
            overlappingSlots.push({
              day:        sSlot.day_of_week,
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
