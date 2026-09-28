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
  DURATION:          'fldqldSnDAZ5mwHlv',
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
