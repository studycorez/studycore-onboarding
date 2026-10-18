import { google } from 'googleapis';
import { CURRICULUM_TOPICS } from './topic-data.js';

const TEMPLATE_ID = process.env.GOOGLE_MASTERY_TRACKER_TEMPLATE_ID;

// Row in the tracker sheet where student info lives
const STUDENT_NAME_CELL  = 'B4';
const PROGRAM_START_CELL = 'E4';
// Column C = "In Program?" for topic rows
const IN_PROGRAM_COL     = 'C';
// Topic rows start at row 11 in the tracker sheet
const TOPIC_START_ROW    = 11;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) return null;
  return new google.auth.JWT(email, null, key, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ]);
}

/**
 * createStudentTracker
 *
 * Copies the Mastery Tracker template, fills in student info and
 * marks "Y" in the "In Program?" column for every topic in the sequence.
 *
 * @param {Object} studentData      — { studentName, programStartDate, ... }
 * @param {Array}  topicSequence    — output from computeProgram
 * @returns {string|null}           — URL of the new Google Sheet, or null on failure
 */
export async function createStudentTracker(studentData, topicSequence) {
  if (!TEMPLATE_ID) {
    console.warn('[Sheets] GOOGLE_MASTERY_TRACKER_TEMPLATE_ID not set — skipping tracker creation');
    return null;
  }

  const auth = getAuth();
  if (!auth) {
    console.warn('[Sheets] Google service account credentials not set — skipping tracker creation');
    return null;
  }

  try {
    await auth.authorize();
    const drive  = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // ── 1. Copy the template ──────────────────────────────────────────────
    const copyRes = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: `${studentData.studentName} — Mastery Tracker`,
      },
    });
    const newSheetId = copyRes.data.id;

    // ── 2. Share: anyone with link can view ───────────────────────────────
    await drive.permissions.create({
      fileId: newSheetId,
      requestBody: { role: 'writer', type: 'anyone' },
    });

    // ── 3. Build value updates ────────────────────────────────────────────
    // Topics in the sequence that should be marked "Y"
    const inProgramTopics = new Set(
      topicSequence.map(t => t.topic)
    );

    const data = [
      { range: `Sheet1!${STUDENT_NAME_CELL}`,  values: [[studentData.studentName]] },
      { range: `Sheet1!${PROGRAM_START_CELL}`, values: [[studentData.programStartDate || '']] },
    ];

    // Mark each topic row
    for (const ct of CURRICULUM_TOPICS) {
      if (ct.trackerRow && inProgramTopics.has(ct.topic)) {
        data.push({
          range:  `Sheet1!${IN_PROGRAM_COL}${ct.trackerRow}`,
          values: [['Y']],
        });
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: newSheetId,
      requestBody:   { valueInputOption: 'USER_ENTERED', data },
    });

    const url = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;
    console.log(`[Sheets] Created tracker: ${url}`);
    return url;
  } catch (err) {
    console.error('[Sheets] Error creating tracker:', err?.message || err);
    return null;
  }
}
