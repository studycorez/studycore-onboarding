import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { format } from 'date-fns';

const NAVY       = rgb(30 / 255, 32 / 255, 144 / 255);
const DARK       = rgb(0.07, 0.07, 0.07);
const GRAY       = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.96);
const GREEN      = rgb(0.07, 0.6, 0.35);
const RED        = rgb(0.8, 0.15, 0.15);

export interface ProgressReportData {
  studentName: string;
  tutorName: string;
  periodStart: string;
  periodEnd: string;
  sessions: Array<{
    date: string;
    duration_minutes: number;
    status: string;
    session_notes: string | null;
  }>;
  progressEntries: Array<{
    recorded_at: string;
    total_score: number | null;
    math_score: number | null;
    reading_score: number | null;
    writing_score: number | null;
  }>;
  targetScore: number | null;
  currentScore: number | null;
}

export async function generateProgressReport(data: ProgressReportData): Promise<Uint8Array> {
  const doc    = await PDFDocument.create();
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  function addPage() {
    const p = doc.addPage([595.28, 841.89]); // A4
    return p;
  }

  let page = addPage();
  let y    = 800;
  const LEFT  = 50;
  const RIGHT = 545;
  const WIDTH = RIGHT - LEFT;

  function write(text: string, x: number, yPos: number, size: number, font = normal, color = DARK) {
    page.drawText(text, { x, y: yPos, size, font, color });
  }

  function line(yPos: number, color = LIGHT_GRAY) {
    page.drawLine({ start: { x: LEFT, y: yPos }, end: { x: RIGHT, y: yPos }, thickness: 0.5, color });
  }

  function newPageIfNeeded(neededSpace: number) {
    if (y < neededSpace + 60) {
      page = addPage();
      y = 800;
      write('StudyCore Progress Report (continued)', LEFT, y, 9, normal, GRAY);
      y -= 20;
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────
  page.drawRectangle({ x: LEFT - 10, y: y - 10, width: WIDTH + 20, height: 70, color: NAVY });
  write('StudyCore', LEFT + 5, y + 42, 22, bold, rgb(1, 1, 1));
  write('Monthly Progress Report', LEFT + 5, y + 22, 12, normal, rgb(0.65, 0.75, 1));
  write(`Generated ${format(new Date(), 'MMMM d, yyyy')}`, RIGHT - 130, y + 22, 9, normal, rgb(0.65, 0.75, 1));
  y -= 25;

  // ── Student info ────────────────────────────────────────────────────────
  y -= 30;
  write(data.studentName, LEFT, y, 18, bold, DARK);
  y -= 18;
  write(`Tutor: ${data.tutorName}`, LEFT, y, 10, normal, GRAY);
  write(
    `Period: ${format(new Date(data.periodStart), 'MMM d, yyyy')} – ${format(new Date(data.periodEnd), 'MMM d, yyyy')}`,
    LEFT + 200, y, 10, normal, GRAY,
  );
  y -= 24;
  line(y + 8);
  y -= 10;

  // ── Score summary ────────────────────────────────────────────────────────
  write('Score Summary', LEFT, y, 13, bold, NAVY);
  y -= 18;

  const sorted = [...data.progressEntries].sort((a, b) =>
    new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const firstEntry = sorted[0];
  const lastEntry  = sorted[sorted.length - 1];

  const cols = [
    { label: 'Metric',           x: LEFT },
    { label: 'Start',            x: LEFT + 140 },
    { label: 'Latest',           x: LEFT + 230 },
    { label: 'Change',           x: LEFT + 320 },
    { label: 'Target',           x: LEFT + 400 },
  ];

  // Table header
  page.drawRectangle({ x: LEFT - 4, y: y - 4, width: WIDTH + 8, height: 18, color: LIGHT_GRAY });
  cols.forEach(c => write(c.label, c.x, y, 9, bold, DARK));
  y -= 18;

  function scoreRow(label: string, startVal: number | null | undefined, latestVal: number | null | undefined, target?: number | null) {
    newPageIfNeeded(20);
    const startStr  = startVal  != null ? String(startVal)  : '—';
    const latestStr = latestVal != null ? String(latestVal) : '—';
    const change    = startVal != null && latestVal != null ? latestVal - startVal : null;
    const changeStr = change != null ? (change >= 0 ? `+${change}` : String(change)) : '—';
    const changeColor = change == null ? GRAY : change > 0 ? GREEN : change < 0 ? RED : DARK;
    const targetStr = target != null ? String(target) : '—';

    write(label,      LEFT,        y, 9, normal, DARK);
    write(startStr,   LEFT + 140,  y, 9, normal, DARK);
    write(latestStr,  LEFT + 230,  y, 9, normal, DARK);
    write(changeStr,  LEFT + 320,  y, 9, bold,   changeColor);
    write(targetStr,  LEFT + 400,  y, 9, normal, GRAY);
    y -= 16;
    line(y + 12);
  }

  scoreRow('Total Score', firstEntry?.total_score, lastEntry?.total_score, data.targetScore);
  scoreRow('Math',        firstEntry?.math_score,  lastEntry?.math_score);
  scoreRow('Reading',     firstEntry?.reading_score, lastEntry?.reading_score);
  scoreRow('Writing',     firstEntry?.writing_score, lastEntry?.writing_score);

  if (sorted.length === 0) {
    write('No progress data recorded for this period.', LEFT, y, 9, normal, GRAY);
    y -= 20;
  }

  y -= 10;

  // ── Sessions ────────────────────────────────────────────────────────────
  newPageIfNeeded(60);
  write('Sessions', LEFT, y, 13, bold, NAVY);
  y -= 6;

  const completed = data.sessions.filter(s => s.status === 'completed');
  write(
    `${completed.length} completed session${completed.length !== 1 ? 's' : ''} | ${(completed.reduce((a, s) => a + s.duration_minutes, 0) / 60).toFixed(1)} hours`,
    LEFT, y - 10, 9, normal, GRAY,
  );
  y -= 22;

  // Session table header
  page.drawRectangle({ x: LEFT - 4, y: y - 4, width: WIDTH + 8, height: 18, color: LIGHT_GRAY });
  write('Date',     LEFT,        y, 9, bold, DARK);
  write('Duration', LEFT + 170,  y, 9, bold, DARK);
  write('Status',   LEFT + 250,  y, 9, bold, DARK);
  write('Notes',    LEFT + 330,  y, 9, bold, DARK);
  y -= 18;

  for (const s of data.sessions.slice(0, 30)) {
    newPageIfNeeded(20);
    const dateStr = format(new Date(s.date), 'MMM d, yyyy');
    const durStr  = `${s.duration_minutes} min`;
    const notesStr = s.session_notes
      ? s.session_notes.slice(0, 50) + (s.session_notes.length > 50 ? '…' : '')
      : '';
    write(dateStr,  LEFT,        y, 8, normal, DARK);
    write(durStr,   LEFT + 170,  y, 8, normal, DARK);
    write(s.status, LEFT + 250,  y, 8, normal, s.status === 'completed' ? GREEN : GRAY);
    if (notesStr) write(notesStr, LEFT + 330, y, 7, normal, GRAY);
    y -= 15;
    line(y + 10);
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  newPageIfNeeded(30);
  y = 40;
  line(y + 10, GRAY);
  write('StudyCore — Confidential — For internal use only', LEFT, y, 8, normal, GRAY);
  write(`Report generated ${format(new Date(), 'PPpp')}`, RIGHT - 200, y, 8, normal, GRAY);

  return doc.save();
}
