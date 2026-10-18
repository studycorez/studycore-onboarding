/**
 * Airtable helpers for StudyCore TQC compliance tracking.
 * Base: appTAp5csw4vqR6NA
 */

const AIRTABLE_BASE = 'appTAp5csw4vqR6NA';
const AIRTABLE_API  = 'https://api.airtable.com/v0';

// ─── Table IDs ────────────────────────────────────────────────────────────────
const TABLES = {
  TUTORS:    'tbliVcXBYt1SsRodH',
  SOD:       'tblWqVg6SUFmFJEXS',
  EOD:       'tblA5gmDnREibS16r',
  SESSIONS:  'tblK9QmEEcsoYCsY7',
  FLAGS:     'tblcjvaMEsNY6Kpvp',
};

// ─── Field IDs: Tutors ────────────────────────────────────────────────────────
const TUTOR_FIELDS = {
  NAME:     'fld3unhq6i1UPO9dI',
  EMAIL:    'fldFviXzUO9NtyJMI',
  PHONE:    'fldB87Tm3zprnWkzG',
  ACTIVE:   'flddARXL2pdznD8hD',
  TUTOR_ID: 'fld4oanYrmt3HjTwl',
};

// ─── Field IDs: Start of Day Log ──────────────────────────────────────────────
const SOD_FIELDS = {
  NAME:              'fldCxKQis21bCxLlK',
  TUTOR_NAME_RAW:    'fldbI9hsyWdviOz1C',
  TUTOR_ID:          'fldwDJ48col9ET9WI',
  DATE:              'fldlQ1DP32ZFdlFkY',
  NUM_SESSIONS:      'fldtb9HXZHlJs1qqp',
  STUDENTS:          'fldoXXbZNV51RLd7Y',
  REVIEWED_NOTES:    'fld6alOipStyeWgDd',
  MATERIALS_READY:   'fldiUnThjfW0hygR4',
  CONFIDENCE:        'fld1jFQtDlGEWL3Yx',
  CHALLENGES:        'fldomv9No8MyCL60B',
  SUPPORT_NEEDED:    'fldUDuSSQSvnecv83',
};

// ─── Field IDs: End of Day Log ────────────────────────────────────────────────
const EOD_FIELDS = {
  NAME:                'fldnRJIGODbG09Uu0',
  TUTOR_NAME_RAW:      'fldP5RsnX2s8NGt8V',
  TUTOR_ID:            'fldYNWauCN7wxXP8A',
  DATE:                'fldKrTac3sCO6FZRE',
  SESSIONS_COMPLETED:  'fldPm2rIuNuY2lHeL',
  SESSIONS_MISSED:     'fldZgejx8nQCypvH6',
  STUDENTS:            'fldZ37L8YLVk9f8WC',
  DAY_RATING:          'fld6OfIOsO1iNoD47',
  STUDENTS_STRUGGLED:  'fldXPQB9fj5IBOPfa',
  STUDENTS_GREAT:      'fldU7lQs8fuprfzDk',
  ENGAGEMENT_CONCERNS: 'fldaQ6diwyeCzBsSB',
  CONCERNS_FLAG:       'fld7vTSf90rb56c9s',
  FOR_OPS:             'fld9ENaPWWhGdiQ2k',
};

// ─── Field IDs: Sessions ──────────────────────────────────────────────────────
const SESSION_FIELDS = {
  SESSION_NAME:      'fldLAKvgk5imzTpvC',
  DATE:              'fldICXYWnCzWEj8fv',
  TOPICS:            'fldRp6NOCKCsfhkzw',
  HOMEWORK_ASSIGNED: 'fldfTmhCpky2sLoy7',
  HW_COMPLETION:     'fld7gbX3mZ14Zmgbm',
  ENGAGEMENT:        'fldVhZc5yLkJg2MFG',
  FLAGS:             'fldVEs6xTkcpnjWe7',
  DURATION:          'fldTbynfOTH3BLSE1',  // Duration (Hrs, Calculated)
  FATHOM_LINK:       'fldJYDkRSR9zVfCnR',
  STUDENT_STRUGGLE:  'fldXl8RXKCHEEirQl',
  ON_TRACK:          'fldaFWGvLXCX2c8iD',
  NOTES_SSC:         'fldUN0d5XDUiorPeK',
  STUDENT_NAME_RAW:  'fldlBI7Rpum4lPYVK',
  TUTOR_NAME_RAW:    'fldUzWGlftvGXkZ1E',
  STUDENT_ID:        'fldlIbtjKbK0iZ1s8',
  SESSION_STATUS:    'fldY2JqpJ6pCauWdr',
  TUTOR_ID:          'fldNQlTKRUa4bFId9',
  ENGAGEMENT_RPTD:   'fld4ccL8qHNBbl6mY',
};

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function createRecord(tableId: string, fields: Record<string, unknown>): Promise<void> {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${tableId}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      console.error(`[airtable] createRecord failed for ${tableId}:`, await res.text());
    }
  } catch (err) {
    console.error('[airtable] createRecord error:', err);
  }
}

async function fetchRecords(tableId: string, filterFormula: string): Promise<any[]> {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${tableId}?filterByFormula=${encodeURIComponent(filterFormula)}&pageSize=100`;
  try {
    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) {
      console.error(`[airtable] fetchRecords failed for ${tableId}:`, await res.text());
      return [];
    }
    const data = await res.json();
    return data.records ?? [];
  } catch (err) {
    console.error('[airtable] fetchRecords error:', err);
    return [];
  }
}

async function fetchAllRecords(tableId: string, filterFormula: string): Promise<any[]> {
  const results: any[] = [];
  let offset: string | undefined = undefined;
  try {
    do {
      const params = new URLSearchParams({
        filterByFormula: filterFormula,
        pageSize: '100',
        returnFieldsByFieldId: 'true',
      });
      if (offset) params.set('offset', offset);
      const res = await fetch(
        `${AIRTABLE_API}/${AIRTABLE_BASE}/${tableId}?${params.toString()}`,
        { headers: airtableHeaders() },
      );
      if (!res.ok) { console.error(`[airtable] fetchAllRecords failed for ${tableId}`); break; }
      const data = await res.json();
      results.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset);
  } catch (err) {
    console.error('[airtable] fetchAllRecords error:', err);
  }
  return results;
}

// ─── Public write helpers ─────────────────────────────────────────────────────

export interface SodFields {
  tutorIdNumber: string;
  date: string;
  numSessions: number;
  students: string;
  reviewedNotes: string;
  materialsReady: string;
  confidence: string;
  challenges: string;
  supportNeeded: string;
}

export async function logStartOfDay(f: SodFields): Promise<void> {
  const tutorLabel = `Tutor #${f.tutorIdNumber}`;
  await createRecord(TABLES.SOD, {
    [SOD_FIELDS.NAME]:           tutorLabel,
    [SOD_FIELDS.TUTOR_NAME_RAW]: tutorLabel,
    [SOD_FIELDS.TUTOR_ID]:       f.tutorIdNumber,
    [SOD_FIELDS.DATE]:           f.date,
    [SOD_FIELDS.NUM_SESSIONS]:   f.numSessions,
    [SOD_FIELDS.STUDENTS]:       f.students,
    [SOD_FIELDS.REVIEWED_NOTES]: f.reviewedNotes,
    [SOD_FIELDS.MATERIALS_READY]:f.materialsReady,
    [SOD_FIELDS.CONFIDENCE]:     f.confidence,
    [SOD_FIELDS.CHALLENGES]:     f.challenges,
    [SOD_FIELDS.SUPPORT_NEEDED]: f.supportNeeded,
  });
}

export interface EodFields {
  tutorIdNumber: string;
  date: string;
  sessionsCompleted: number;
  sessionsMissed: number;
  students: string;
  dayRating: string;
  studentsStruggled: string;
  studentsGreat: string;
  engagementConcerns: string;
  concernsFlag: string;
  logisticsIssues: string;
  opsNotes: string;
  reflection: string;
}

export async function logEndOfDay(f: EodFields): Promise<void> {
  const tutorLabel = `Tutor #${f.tutorIdNumber}`;
  await createRecord(TABLES.EOD, {
    [EOD_FIELDS.NAME]:                tutorLabel,
    [EOD_FIELDS.TUTOR_NAME_RAW]:      tutorLabel,
    [EOD_FIELDS.TUTOR_ID]:            f.tutorIdNumber,
    [EOD_FIELDS.DATE]:                f.date,
    [EOD_FIELDS.SESSIONS_COMPLETED]:  f.sessionsCompleted,
    [EOD_FIELDS.SESSIONS_MISSED]:     f.sessionsMissed,
    [EOD_FIELDS.STUDENTS]:            f.students,
    [EOD_FIELDS.DAY_RATING]:          f.dayRating,
    [EOD_FIELDS.STUDENTS_STRUGGLED]:  f.studentsStruggled,
    [EOD_FIELDS.STUDENTS_GREAT]:      f.studentsGreat,
    [EOD_FIELDS.ENGAGEMENT_CONCERNS]: f.engagementConcerns,
    [EOD_FIELDS.CONCERNS_FLAG]:       f.concernsFlag,
    [EOD_FIELDS.FOR_OPS]:             f.opsNotes,
  });
}

export interface SessionLogFields {
  studentName: string;
  tutorIdNumber: string;
  date: string;
  sessionStatus: string;
  topics: string;
  studentStruggle: string;
  homeworkAssigned: string;
  hwCompletion: string;
  engagement: string;
  flags: string;
  durationHours: number;
  fathomLink: string;
  onTrack: string;
  notesForSsc: string;
  studentId: string;
}

export async function logSession(f: SessionLogFields): Promise<void> {
  const sessionName = `${f.studentName} — ${f.date}`;
  await createRecord(TABLES.SESSIONS, {
    [SESSION_FIELDS.SESSION_NAME]:     sessionName,
    [SESSION_FIELDS.DATE]:             f.date,
    [SESSION_FIELDS.TOPICS]:           f.topics,
    [SESSION_FIELDS.HOMEWORK_ASSIGNED]:f.homeworkAssigned,
    [SESSION_FIELDS.HW_COMPLETION]:    f.hwCompletion,
    [SESSION_FIELDS.ENGAGEMENT]:       f.engagement,
    [SESSION_FIELDS.FLAGS]:            f.flags,
    [SESSION_FIELDS.DURATION]:         f.durationHours,
    [SESSION_FIELDS.FATHOM_LINK]:      f.fathomLink,
    [SESSION_FIELDS.STUDENT_STRUGGLE]: f.studentStruggle,
    [SESSION_FIELDS.ON_TRACK]:         f.onTrack,
    [SESSION_FIELDS.NOTES_SSC]:        f.notesForSsc,
    [SESSION_FIELDS.STUDENT_NAME_RAW]: f.studentName,
    [SESSION_FIELDS.TUTOR_ID]:         f.tutorIdNumber,
    [SESSION_FIELDS.SESSION_STATUS]:   f.sessionStatus,
    [SESSION_FIELDS.STUDENT_ID]:       f.studentId,
  });
}

// ─── Flag helpers ─────────────────────────────────────────────────────────────

export interface FlagFields {
  tutorName:   string;
  studentName: string;
  flagLevel:   'Red' | 'Yellow';
  notes:       string;
  sessionDate: string;
}

export async function logFlag(f: FlagFields): Promise<string | null> {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${TABLES.FLAGS}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          'Tutor Name':   f.tutorName,
          'Student Name': f.studentName,
          'Flag Level':   f.flagLevel,
          'Notes':        f.notes,
          'Session Date': f.sessionDate,
          'Status':       'Open',
        },
      }),
    });
    if (!res.ok) {
      console.error('[airtable] logFlag failed:', await res.text());
      return null;
    }
    const data = await res.json();
    return data.id ?? null;
  } catch (err) {
    console.error('[airtable] logFlag error:', err);
    return null;
  }
}

export async function resolveFlag(flagId: string, resolvedBy: string): Promise<void> {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${TABLES.FLAGS}/${flagId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          'Status':      'Resolved',
          'Resolved At': new Date().toISOString().slice(0, 10),
          'Resolved By': resolvedBy,
        },
      }),
    });
    if (!res.ok) console.error('[airtable] resolveFlag failed:', await res.text());
  } catch (err) {
    console.error('[airtable] resolveFlag error:', err);
  }
}

export interface OpenFlag {
  id:          string;
  tutorName:   string;
  studentName: string;
  flagLevel:   string;
  notes:       string;
  sessionDate: string;
}

export async function getOpenFlags(): Promise<OpenFlag[]> {
  const records = await fetchRecords(TABLES.FLAGS, `{Status} = 'Open'`);
  return records.map((r: any) => ({
    id:          r.id,
    tutorName:   String(r.fields?.['Tutor Name']   ?? ''),
    studentName: String(r.fields?.['Student Name'] ?? ''),
    flagLevel:   String(r.fields?.['Flag Level']   ?? ''),
    notes:       String(r.fields?.['Notes']        ?? ''),
    sessionDate: String(r.fields?.['Session Date'] ?? ''),
  }));
}

// ─── Public read helpers ──────────────────────────────────────────────────────

export interface TutorRecord {
  name:       string;
  email:      string;
  phone:      string;
  airtableId: string;
  tutorId:    string;
}

export async function getActiveTutors(): Promise<TutorRecord[]> {
  const records = await fetchRecords(TABLES.TUTORS, `{${TUTOR_FIELDS.ACTIVE}} = TRUE()`);
  return records.map((r: any) => ({
    name:       String(r.fields?.[TUTOR_FIELDS.NAME]     ?? '').trim(),
    email:      String(r.fields?.[TUTOR_FIELDS.EMAIL]    ?? '').trim(),
    phone:      String(r.fields?.[TUTOR_FIELDS.PHONE]    ?? '').trim(),
    airtableId: r.id ?? '',
    tutorId:    String(r.fields?.[TUTOR_FIELDS.TUTOR_ID] ?? '').trim(),
  })).filter((t: TutorRecord) => t.name);
}

export interface ComplianceData {
  tutors: TutorRecord[];
  sodByTutor: Record<string, { submitted: boolean; numSessions: number; date: string }[]>;
  eodByTutor: Record<string, { submitted: boolean; concernsFlag: string; rating: string; date: string }[]>;
  sessionsByTutor: Record<string, { studentName: string; hasFathom: boolean; status: string; date: string }[]>;
}

function normKey(name: string): string {
  return name.toLowerCase().trim();
}

export async function getComplianceData(dateStr: string): Promise<ComplianceData> {
  return getComplianceRange(dateStr, dateStr);
}

export async function getComplianceRange(from: string, to: string): Promise<ComplianceData> {
  const [tutors, sodRecords, eodRecords, sessionRecords] = await Promise.all([
    getActiveTutors(),
    fetchRecords(
      TABLES.SOD,
      `AND(IS_AFTER({${SOD_FIELDS.DATE}}, DATEADD("${from}", -1, 'days')), IS_BEFORE({${SOD_FIELDS.DATE}}, DATEADD("${to}", 1, 'days')))`,
    ),
    fetchRecords(
      TABLES.EOD,
      `AND(IS_AFTER({${EOD_FIELDS.DATE}}, DATEADD("${from}", -1, 'days')), IS_BEFORE({${EOD_FIELDS.DATE}}, DATEADD("${to}", 1, 'days')))`,
    ),
    fetchRecords(
      TABLES.SESSIONS,
      `AND(IS_AFTER({${SESSION_FIELDS.DATE}}, DATEADD("${from}", -1, 'days')), IS_BEFORE({${SESSION_FIELDS.DATE}}, DATEADD("${to}", 1, 'days')))`,
    ),
  ]);

  const sodByTutor: ComplianceData['sodByTutor'] = {};
  for (const r of sodRecords) {
    const rawId = String(r.fields?.[SOD_FIELDS.TUTOR_ID] ?? '').trim();
    const rawName = String(r.fields?.[SOD_FIELDS.TUTOR_NAME_RAW] ?? '').trim();
    const key = rawName ? normKey(rawName) : normKey(`tutor #${rawId}`);
    const date = String(r.fields?.[SOD_FIELDS.DATE] ?? '').slice(0, 10);
    if (!sodByTutor[key]) sodByTutor[key] = [];
    sodByTutor[key].push({
      submitted: true,
      numSessions: Number(r.fields?.[SOD_FIELDS.NUM_SESSIONS] ?? 0),
      date,
    });
  }

  const eodByTutor: ComplianceData['eodByTutor'] = {};
  for (const r of eodRecords) {
    const rawId = String(r.fields?.[EOD_FIELDS.TUTOR_ID] ?? '').trim();
    const rawName = String(r.fields?.[EOD_FIELDS.TUTOR_NAME_RAW] ?? '').trim();
    const key = rawName ? normKey(rawName) : normKey(`tutor #${rawId}`);
    const date = String(r.fields?.[EOD_FIELDS.DATE] ?? '').slice(0, 10);
    if (!eodByTutor[key]) eodByTutor[key] = [];
    eodByTutor[key].push({
      submitted: true,
      concernsFlag: String(r.fields?.[EOD_FIELDS.CONCERNS_FLAG] ?? 'Green'),
      rating: String(r.fields?.[EOD_FIELDS.DAY_RATING] ?? ''),
      date,
    });
  }

  const sessionsByTutor: ComplianceData['sessionsByTutor'] = {};
  for (const r of sessionRecords) {
    const rawId = String(r.fields?.[SESSION_FIELDS.TUTOR_ID] ?? '').trim();
    const rawName = String(r.fields?.[SESSION_FIELDS.TUTOR_NAME_RAW] ?? '').trim();
    const key = rawName ? normKey(rawName) : normKey(`tutor #${rawId}`);
    const date = String(r.fields?.[SESSION_FIELDS.DATE] ?? '').slice(0, 10);
    if (!sessionsByTutor[key]) sessionsByTutor[key] = [];
    sessionsByTutor[key].push({
      studentName: String(r.fields?.[SESSION_FIELDS.STUDENT_NAME_RAW] ?? ''),
      hasFathom:   !!String(r.fields?.[SESSION_FIELDS.FATHOM_LINK] ?? '').trim(),
      status:      String(r.fields?.[SESSION_FIELDS.SESSION_STATUS] ?? ''),
      date,
    });
  }

  return { tutors, sodByTutor, eodByTutor, sessionsByTutor };
}

// ─── SSC prep card data ───────────────────────────────────────────────────────

const AT_STUDENTS    = 'tbloSDTj4Edc7nPVs';
const AT_TUTORS      = 'tbliVcXBYt1SsRodH';
const AT_HANDOFF     = 'tblbn02ZwvUD5y4ud';
const AT_STU_ONBOARD = 'tblp6E6zuRaczqA4Y';
const AT_PAR_ONBOARD = 'tblC2zdJlvVSXqeIW';
const AT_CHECKINS    = 'tbldzhlPx9gNsDic5';

const CHECKIN_FIELDS = {
  STUDENT_ID_NUMBER: 'fld0U3NHVj3oy3bR0',
  SUBMITTED_BY:      'fldlufuxCaEZNttqo',
  CHECK_IN_DATE:     'fldzJ6Wg0h0NflAQe',
  CHECK_IN_TYPE:     'fldeSQnZvSVwtaWLw',
  FATHOM_LINK:       'fldZb5amIy5zAtMrm',
  OVERALL_STATUS:    'fldkcM9TUaHxtFqeb',
  SUMMARY_NOTES:     'fldDyctgeHVpa1VYl',
  CONCERNS:          'fldjQ5uI2EZVY7qo3',
  FOUNDER_ATTENTION: 'fldwTIGSAujWB1c9a',
  STUDENT_LINK:      'fldHch05zsKwsLmfx',
  FIRST_SESSION_RATING: 'fldHuN1dN3xvcqazK',
  OFFICIAL_SAT_SCORE:   'fldydYVhJXwwZhPWk',
  HIT_TARGET:           'fld2lGkpWFPJcqdrI',
};

async function fetchRecord(tableId: string, recordId: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${AIRTABLE_API}/${AIRTABLE_BASE}/${tableId}/${recordId}`,
      { headers: airtableHeaders() },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export interface SscAirtableData {
  // Identity
  studentName:          string;   // Students.Name
  airtableRecordId:     string;   // Airtable record ID (used to fetch check-ins)
  studentSeq:           number;   // Students.Seq autoNumber
  grade:                string;   // Students.Grade
  // Tutor
  tutorName:            string;   // Tutors.Name
  tutorSatScore:        string;   // Tutors.SAT Overall
  // Contact info — priority: Handoff → Students → Student/Parent Onboarding
  studentPhone:         string;
  studentEmail:         string;
  parentPhone:          string;
  parentEmail:          string;
  // Program info
  hoursPurchased:       number;   // Students.Total Purchased hours
  guarantee:            string;   // Handoff.Guarantee Offered
  sessionFrequency:     string;   // Handoff.Session Frequency
  preferredDays:        string[]; // Handoff.Preferred Session Days
  preferredTime:        string;   // Handoff.Preferred Session Time
  closerName:           string;   // Handoff.Closer Name
  // SAT dates
  satTestDate:          string;   // Student Onboarding.SAT Date (YYYY-MM-DD)
  // Scores
  priorSatScore:        number;   // Students.Prior SAT Score
  targetScore:          number;   // Students.Target Score
  currentScoreFromForm: number;   // Handoff.Current SAT Score (at time of enrollment)
  targetScoreFromHandoff: number; // Handoff.Target SAT Score
  // Student intake context (Student Onboarding form)
  hardestTopics:        string[]; // "Hardest Topics"
  harderSection:        string;   // "Harder Section"
  strugglesInDetail:    string;   // "Struggles in Detail"
  dailyPracticeTime:    string;   // "Daily Practice Time"
  anythingElseForTutor: string;   // "Anything Else for Tutor"
  studentTimezone:      string;   // "Time Zone"
  priorSatPrep:         string;   // "Prior SAT Prep"
  whosDriving:          string;   // "Whose Idea" (from student form)
  studentDoubts:        string;   // "Doubts or Concerns" (from student form)
  // Parent intake context (Parent Onboarding form)
  parentBestTime:       string;   // "Best Time to Reach"
  checkinContactMethod: string;   // "Check-In Contact Method"
  parentConfidence:     number;   // "Confidence 1-10"
  parentConcerns:       string;   // "Concerns or Doubts"
  whyStudyCore:         string;   // "Why StudyCore"
  targetSchools:        string;   // "Target Schools"
  anythingElseAboutStudent: string; // "Anything Else About Student"
  whatDidntWorkBefore:  string;   // "What Didn't Work Before"
  parentWhosDriving:    string;   // "Who's Driving"
  parentTargetScore:    number;   // "Parent Target Score"
}

export async function getSscAirtableData(studentName: string, parentName?: string, contactFirstName?: string): Promise<SscAirtableData | null> {
  // 1. Look up student in Students table by student name first
  let students = await fetchRecords(
    AT_STUDENTS,
    `LOWER({Name})=LOWER("${studentName.replace(/"/g, '')}")`,
  );
  // 2. Fall back to GHL contact firstName (handles truncated/corrupted STUDENT_NAME CF)
  if (!students.length && contactFirstName && contactFirstName.toLowerCase() !== studentName.toLowerCase()) {
    students = await fetchRecords(
      AT_STUDENTS,
      `LOWER({Name})=LOWER("${contactFirstName.replace(/"/g, '')}")`,
    );
  }
  // 3. Fall back to parent name lookup (covers contacts where GHL name = parent name)
  if (!students.length && parentName) {
    students = await fetchRecords(
      AT_STUDENTS,
      `LOWER({Parent Name})=LOWER("${parentName.replace(/"/g, '')}")`,
    );
  }
  if (!students.length) return null;
  const airtableRecordId = students[0].id as string;
  const stu = students[0].fields as Record<string, any>;

  const tutorIds      = (stu['fldhpDjVEpjbjq8Jr'] as string[] | undefined) ?? [];
  const handoffIds    = (stu['fldh56l681yOPwHfR']  as string[] | undefined) ?? [];
  const onboardIds    = (stu['fldb92XDEJvj14fcf']  as string[] | undefined) ?? [];
  const parOnboardIds = (stu['fldgMP4IXFARtbFqT']  as string[] | undefined) ?? [];

  // 2. Fetch linked records in parallel
  const [tutorRec, handoffRec, onboardRec, parOnboardRec] = await Promise.all([
    tutorIds[0]      ? fetchRecord(AT_TUTORS,      tutorIds[0])      : null,
    handoffIds[0]    ? fetchRecord(AT_HANDOFF,     handoffIds[0])    : null,
    onboardIds[0]    ? fetchRecord(AT_STU_ONBOARD, onboardIds[0])    : null,
    parOnboardIds[0] ? fetchRecord(AT_PAR_ONBOARD, parOnboardIds[0]) : null,
  ]);

  const hoursPurchased = parseFloat(String(stu['Total Purchased hours'] ?? stu['Total Purchased Hours'] ?? 0)) || 0;

  const hf  = (handoffRec?.fields    ?? {}) as Record<string, any>;
  const of_ = (onboardRec?.fields    ?? {}) as Record<string, any>;
  const pf  = (parOnboardRec?.fields ?? {}) as Record<string, any>;
  const tf  = (tutorRec?.fields      ?? {}) as Record<string, any>;

  // Strip placeholder values GHL/Tally write for blank fields
  function clean(v: any): string {
    const s = String(v ?? '').trim();
    return (s === '' || s === '-' || s === 'null' || s === 'N/A') ? '' : s;
  }

  // Contact info: Handoff → Students → Onboarding forms
  const studentPhone = clean(hf['Student Phone']) || clean(stu['Student Phone']) || clean(of_['Phone']);
  const studentEmail = clean(hf['Student Email']) || clean(stu['Student Email']) || clean(of_['Email']);
  const parentPhone  = clean(hf['Parent Phone'])  || clean(stu['Parent Phone'])  || clean(pf['Phone']);
  const parentEmail  = clean(hf['Parent Email'])  || clean(stu['Parent Email'])  || clean(pf['Email']);

  return {
    // Identity
    studentName:      clean(stu['Name']),
    airtableRecordId,
    studentSeq:       Number(stu['fld9sx92SQe4MrqYI'] ?? stu['Seq'] ?? 0),
    grade:            clean(stu['Grade']) || clean(hf['Grade']),
    // Tutor — field IDs confirmed from Airtable meta API
    tutorName:        clean(tf['fld3unhq6i1UPO9dI']) || clean(tf['Name']),
    tutorSatScore:    clean(tf['fldjYwnhElkb4VyjH']),
    // Contact info
    studentPhone, studentEmail, parentPhone, parentEmail,
    // Program
    hoursPurchased,
    guarantee:        clean(hf['fldXRU7ChtZHTn4zv']) || clean(hf['Guarantee Offered']),
    sessionFrequency: clean(hf['fldCySQlt3mAJy2Td']) || clean(hf['Session Frequency']),
    preferredDays:    (hf['fldYqxFopE2h4Wh89'] ?? hf['Preferred Session Days'] ?? []) as string[],
    preferredTime:    clean(hf['fldNZ2weOoaEysB5k']) || clean(hf['Preferred Session Time']),
    closerName:       clean(hf['flddOtjzyGE6cDsMr']) || clean(hf['Closer Name']),
    // SAT date — Student Onboarding form (field ID confirmed)
    satTestDate:      clean(of_['fldxI5EEH75dg1EOD']) || clean(of_['SAT Date']),
    // Scores
    priorSatScore:        parseFloat(String(stu['fldPLwFiP9d0Y3fTp'] ?? stu['Prior SAT Score'] ?? 0)) || 0,
    targetScore:          parseFloat(String(stu['fld7nF9sNCxVBrIMu'] ?? stu['Target Score'] ?? 0)) || 0,
    currentScoreFromForm: parseFloat(String(hf['fldEJt2tlgoJhU7py'] ?? hf['Current SAT Score'] ?? 0)) || 0,
    targetScoreFromHandoff: parseFloat(String(hf['fld4wJxXHU26Edy0n'] ?? hf['Target SAT Score'] ?? 0)) || 0,
    // Student onboarding context (field IDs confirmed)
    hardestTopics:        (of_['fld0PumDFaIdnLdfo'] ?? of_['Hardest Topics'] ?? []) as string[],
    harderSection:        clean(of_['fldHVtQP9qwGlhuvi']) || clean(of_['Harder Section']),
    strugglesInDetail:    clean(of_['fldFZbNDw5wJjzV72']) || clean(of_['Struggles in Detail']),
    dailyPracticeTime:    clean(of_['fldIGQfmK4za4OM0T']) || clean(of_['Daily Practice Time']),
    anythingElseForTutor: clean(of_['fldwpDSpvPFsxBxwx']) || clean(of_['Anything Else for Tutor']),
    studentTimezone:      clean(of_['fldAOYzrfVyEqk6o4']) || clean(of_['Time Zone']),
    priorSatPrep:         clean(of_['fldxdF1qk3l7SNRc6']) || clean(of_['Prior SAT Prep']),
    whosDriving:          clean(of_['fldU9rLHvQKZJCZf9']) || clean(of_['Whose Idea']),
    studentDoubts:        clean(of_['fld6PPQn2DjdG4HRY']) || clean(of_['Doubts or Concerns']),
    // Parent onboarding context (field IDs confirmed)
    parentBestTime:       clean(pf['fldwNbvSmIa2lsDEI']) || clean(pf['Best Time to Reach']),
    checkinContactMethod: clean(pf['fldB0SR9Agwv8DDnq']) || clean(pf['Check-In Contact Method']),
    parentConfidence:     parseFloat(String(pf['fldvgdq5Y24RheON5'] ?? pf['Confidence 1-10'] ?? 0)) || 0,
    parentConcerns:       clean(pf['fldB2WjtO4bVZR64G']) || clean(pf['Concerns or Doubts']),
    whyStudyCore:         clean(pf['fldofXBKP0y6f2YYb']) || clean(pf['Why StudyCore']),
    targetSchools:        clean(pf['fld54h4LcMFXzuXYT']) || clean(pf['Target Schools']),
    anythingElseAboutStudent: clean(pf['fldIlLQ4YssxJJb5P']) || clean(pf['Anything Else About Student']),
    whatDidntWorkBefore:  clean(pf['fld8qKPnpfUCxKXUb']) || clean(pf['What Didn\'t Work Before']),
    parentWhosDriving:    clean(pf['fldL7AjFLvYoeDr0T']) || clean(pf['Who\'s Driving']),
    parentTargetScore:    parseFloat(String(pf['fldNkzKBfUNEZvylY'] ?? pf['Parent Target Score'] ?? 0)) || 0,
  };
}

// ─── Check-in helpers ──────────────────────────────────────────────────────────

export interface SscCheckin {
  id:              string;
  checkInDate:     string;
  checkInType:     string;
  submittedBy:     string;
  overallStatus:   string;
  summaryNotes:    string;
  concerns:        string;
  founderAttention: boolean;
  fathomLink:      string;
  firstSessionRating: string;
  officialSatScore: string;
  hitTarget:        string;
}

export async function getStudentCheckins(studentRecordId: string): Promise<SscCheckin[]> {
  const records = await fetchRecords(
    AT_CHECKINS,
    `FIND("${studentRecordId}", ARRAYJOIN({${CHECKIN_FIELDS.STUDENT_LINK}}))`,
  );
  return records
    .map((r: any) => ({
      id:                  r.id,
      checkInDate:         String(r.fields?.[CHECKIN_FIELDS.CHECK_IN_DATE]     ?? '').slice(0, 10),
      checkInType:         String(r.fields?.[CHECKIN_FIELDS.CHECK_IN_TYPE]     ?? ''),
      submittedBy:         String(r.fields?.[CHECKIN_FIELDS.SUBMITTED_BY]      ?? ''),
      overallStatus:       String(r.fields?.[CHECKIN_FIELDS.OVERALL_STATUS]    ?? ''),
      summaryNotes:        String(r.fields?.[CHECKIN_FIELDS.SUMMARY_NOTES]     ?? ''),
      concerns:            String(r.fields?.[CHECKIN_FIELDS.CONCERNS]          ?? ''),
      founderAttention:    r.fields?.[CHECKIN_FIELDS.FOUNDER_ATTENTION] === true,
      fathomLink:          String(r.fields?.[CHECKIN_FIELDS.FATHOM_LINK]       ?? ''),
      firstSessionRating:  String(r.fields?.[CHECKIN_FIELDS.FIRST_SESSION_RATING] ?? ''),
      officialSatScore:    String(r.fields?.[CHECKIN_FIELDS.OFFICIAL_SAT_SCORE]   ?? ''),
      hitTarget:           String(r.fields?.[CHECKIN_FIELDS.HIT_TARGET]           ?? ''),
    }))
    .sort((a: SscCheckin, b: SscCheckin) => b.checkInDate.localeCompare(a.checkInDate));
}

export interface CheckinRecordFields {
  studentRecordId:     string;
  studentSeq:          number;
  submittedBy:         string;
  checkInDate:         string;
  checkInType:         string;
  overallStatus:       string;
  summaryNotes:        string;
  concerns:            string;
  founderAttention:    boolean;
  fathomLink?:         string;
  firstSessionRating?: string;
  // Score fields — composite stored as Official SAT Score; math/rw appended to notes
  practiceTestScore?:  string;
  mathScore?:          string;
  rwScore?:            string;
}

export async function createCheckinRecord(f: CheckinRecordFields): Promise<string | null> {
  // Build notes — append score breakdown if provided
  let notes = f.summaryNotes || '';
  if (f.practiceTestScore || f.mathScore || f.rwScore) {
    const scoreLine = [
      f.practiceTestScore ? `Composite: ${f.practiceTestScore}` : '',
      f.mathScore          ? `Math: ${f.mathScore}`              : '',
      f.rwScore            ? `R&W: ${f.rwScore}`                 : '',
    ].filter(Boolean).join(' | ');
    notes = notes ? `${notes}\n[Scores: ${scoreLine}]` : `[Scores: ${scoreLine}]`;
  }

  const fields: Record<string, unknown> = {
    [CHECKIN_FIELDS.STUDENT_LINK]:      [f.studentRecordId],
    [CHECKIN_FIELDS.STUDENT_ID_NUMBER]: f.studentSeq || undefined,
    [CHECKIN_FIELDS.SUBMITTED_BY]:      f.submittedBy,
    [CHECKIN_FIELDS.CHECK_IN_DATE]:     f.checkInDate,
    [CHECKIN_FIELDS.CHECK_IN_TYPE]:     f.checkInType,
    [CHECKIN_FIELDS.OVERALL_STATUS]:    f.overallStatus,
    [CHECKIN_FIELDS.SUMMARY_NOTES]:     notes,
    [CHECKIN_FIELDS.CONCERNS]:          f.concerns,
    [CHECKIN_FIELDS.FOUNDER_ATTENTION]: f.founderAttention,
  };
  if (f.fathomLink)         fields[CHECKIN_FIELDS.FATHOM_LINK]          = f.fathomLink;
  if (f.firstSessionRating) fields[CHECKIN_FIELDS.FIRST_SESSION_RATING] = f.firstSessionRating;
  // Write composite score to Official SAT Score field for phase check-ins / actual SAT results
  if (f.practiceTestScore)  fields[CHECKIN_FIELDS.OFFICIAL_SAT_SCORE]   = f.practiceTestScore;

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${AT_CHECKINS}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      console.error('[airtable] createCheckinRecord failed:', await res.text());
      return null;
    }
    const data = await res.json();
    return data.id ?? null;
  } catch (err) {
    console.error('[airtable] createCheckinRecord error:', err);
    return null;
  }
}

// ─── Field IDs: Sessions (additional) ────────────────────────────────────────
const SESSION_FIELDS_EXT = {
  COMPLETED_PHASE: 'fldvGfNlvbXOuEYJW',   // Completed Phase field
};

export interface SscSession {
  id:               string;
  date:             string;
  tutorId:          string;
  tutorName:        string;
  topics:           string;
  engagement:       string;
  engagementRptd:   string;
  flags:            string;
  hwCompletion:     string;
  hwAssigned:       string;
  studentStruggle:  string;
  onTrack:          string;
  notesSsc:         string;
  fathomLink:       string;
  sessionStatus:    string;
  duration:         number;
  completedPhase:   string;
}

export interface StudentSessionsResult {
  sessions:       SscSession[];
  totalHoursUsed: number;
}

export async function getStudentSessions(studentSeq: number): Promise<StudentSessionsResult> {
  const formula = `{${SESSION_FIELDS.STUDENT_ID}} = ${studentSeq}`;
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${TABLES.SESSIONS}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=${SESSION_FIELDS.DATE}&sort[0][direction]=desc&pageSize=200&returnFieldsByFieldId=true`;
  try {
    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) {
      console.error('[airtable] getStudentSessions failed:', await res.text());
      return { sessions: [], totalHoursUsed: 0 };
    }
    const data = await res.json();
    const records: any[] = data.records ?? [];
    const sessions: SscSession[] = records.map(r => ({
      id:              r.id,
      date:            String(r.fields?.[SESSION_FIELDS.DATE]              ?? '').slice(0, 10),
      tutorId:         String(r.fields?.[SESSION_FIELDS.TUTOR_ID]          ?? ''),
      tutorName:       String(r.fields?.[SESSION_FIELDS.TUTOR_NAME_RAW]    ?? ''),
      topics:          String(r.fields?.[SESSION_FIELDS.TOPICS]            ?? ''),
      engagement:      String(r.fields?.[SESSION_FIELDS.ENGAGEMENT]        ?? ''),
      engagementRptd:  String(r.fields?.[SESSION_FIELDS.ENGAGEMENT_RPTD]   ?? ''),
      flags:           String(r.fields?.[SESSION_FIELDS.FLAGS]             ?? ''),
      hwCompletion:    String(r.fields?.[SESSION_FIELDS.HW_COMPLETION]     ?? ''),
      hwAssigned:      String(r.fields?.[SESSION_FIELDS.HOMEWORK_ASSIGNED] ?? ''),
      studentStruggle: String(r.fields?.[SESSION_FIELDS.STUDENT_STRUGGLE]  ?? ''),
      onTrack:         String(r.fields?.[SESSION_FIELDS.ON_TRACK]          ?? ''),
      notesSsc:        String(r.fields?.[SESSION_FIELDS.NOTES_SSC]         ?? ''),
      fathomLink:      String(r.fields?.[SESSION_FIELDS.FATHOM_LINK]       ?? ''),
      sessionStatus:   String(r.fields?.[SESSION_FIELDS.SESSION_STATUS]    ?? ''),
      duration:        parseFloat(String(r.fields?.[SESSION_FIELDS.DURATION] ?? '0')) || 0,
      completedPhase:  String(r.fields?.[SESSION_FIELDS_EXT.COMPLETED_PHASE] ?? ''),
    }));
    const totalHoursUsed = sessions
      .filter(s => s.sessionStatus === 'Held')
      .reduce((sum, s) => sum + s.duration, 0);
    return { sessions, totalHoursUsed };
  } catch (err) {
    console.error('[airtable] getStudentSessions error:', err);
    return { sessions: [], totalHoursUsed: 0 };
  }
}

// ─── Fulfillment health stats ─────────────────────────────────────────────────

export interface MonthSessionStats {
  held:         number;
  noShow:       number;
  deliveryRate: number; // held / (held + noShow) * 100, or 100 if no completed sessions
}

export async function getMonthSessionStats(monthStart: string, monthEnd: string): Promise<MonthSessionStats> {
  const formula = `AND(IS_AFTER({${SESSION_FIELDS.DATE}}, DATEADD("${monthStart}", -1, 'days')), IS_BEFORE({${SESSION_FIELDS.DATE}}, DATEADD("${monthEnd}", 1, 'days')))`;
  const records = await fetchAllRecords(TABLES.SESSIONS, formula);
  let held = 0;
  let noShow = 0;
  for (const r of records) {
    const status = String(r.fields?.[SESSION_FIELDS.SESSION_STATUS] ?? '');
    if (status === 'Held') held++;
    else if (
      status === 'No Show' || status === 'No-Show' || status === 'Student No Show' ||
      status === 'Late cancel' || status === 'Late Cancel' || status === 'Cancelled'
    ) noShow++;
  }
  const total = held + noShow;
  const deliveryRate = total > 0 ? Math.round((held / total) * 100) : 100;
  return { held, noShow, deliveryRate };
}

export async function lookupAirtableStudentByName(
  studentName: string,
): Promise<{ recordId: string; seqNumber: number } | null> {
  const records = await fetchRecords(
    AT_STUDENTS,
    `LOWER({Name})=LOWER("${studentName.replace(/"/g, '')}")`,
  );
  if (!records.length) return null;
  const r = records[0];
  return {
    recordId:  r.id as string,
    seqNumber: Number(r.fields?.['fld9sx92SQe4MrqYI'] ?? r.fields?.['Seq'] ?? 0),
  };
}
