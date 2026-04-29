/**
 * Feature 1 E2E test — Contract PDF Generation
 * Run: npx ts-node --project tsconfig.json scripts/test-feature1-contract-pdf.ts
 */
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Inline PDF generation (mirrors src/lib/contract-pdf.ts) ───────────────

const NAVY_RGB = rgb(30 / 255, 32 / 255, 144 / 255);
const WHITE = rgb(1, 1, 1);
const DARK  = rgb(0.07, 0.07, 0.07);
const GRAY  = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.96);

const CONTRACT_TEMPLATE = `STUDYCORE TUTOR COMMITMENT CONTRACT

This agreement is between StudyCore ("Company") and {TUTOR_NAME} ("Tutor").

1. COMMITMENT
Tutor agrees to fulfill all scheduled tutoring sessions with {STUDENT_NAME} as outlined in the attached Game Plan.

2. SESSIONS & CANCELLATIONS
Tutor must provide at least 24 hours notice for any cancellation. Failure to provide notice or missing a session without notice constitutes a violation. On the 3rd violation, this contract is terminated and all unpaid session earnings are forfeited.

3. NOTICE PERIOD
To discontinue tutoring {STUDENT_NAME}, Tutor must provide a minimum of 2 weeks written notice to StudyCore admin.

4. COMPENSATION
Tutor will be compensated at \${HOURLY_RATE}/hour for all completed sessions as confirmed via session logs.

5. CONFIDENTIALITY
Tutor agrees to keep all student information strictly confidential.

6. EXCLUSIVITY
While engaged with StudyCore, Tutor agrees not to provide tutoring services for any other company or platform without prior written approval from StudyCore.

7. CONSEQUENCES OF VIOLATION
- 1st & 2nd violation: Forfeiture of pay for the missed session and written warning
- 3rd violation: Immediate contract termination and forfeiture of all unpaid session earnings

By signing below, Tutor acknowledges they have read, understood, and agree to all terms.`;

function fillTemplate(tutor: string, student: string, rate: number) {
  return CONTRACT_TEMPLATE
    .replace(/{TUTOR_NAME}/g, tutor)
    .replace(/{STUDENT_NAME}/g, student)
    .replace(/\$\{HOURLY_RATE\}/g, String(rate));
}

type EmbeddedFont = Awaited<ReturnType<PDFDocument['embedFont']>>;

function wrapLine(text: string, font: EmbeddedFont, size: number, maxWidth: number): string[] {
  if (!text.trim()) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateContractPdf(contractId: string): Promise<string | null> {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*, tutor:tutors(name), student:students(name)')
    .eq('id', contractId)
    .single();

  if (error || !contract) { console.error('[pdf] fetch error:', error?.message); return null; }

  const tutorName   = (contract.tutor   as any)?.name ?? 'Tutor';
  const studentName = (contract.student as any)?.name ?? 'Student';
  const hourlyRate  = contract.hourly_rate ?? 0;
  const signature   = contract.tutor_signature ?? '';
  const signedAt    = contract.signed_at
    ? new Date(contract.signed_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : 'Unknown date';

  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

  const pageW = 612; const pageH = 792;
  const marginX = 56; const bodyW = pageW - marginX * 2;

  function newPage() {
    const p = doc.addPage([pageW, pageH]);
    p.drawRectangle({ x: 0, y: pageH - 68, width: pageW, height: 68, color: NAVY_RGB });
    p.drawText('StudyCore', { x: marginX, y: pageH - 35, font: bold, size: 18, color: WHITE });
    p.drawText('Tutor Commitment Contract', { x: marginX, y: pageH - 54, font: reg, size: 10, color: rgb(0.65, 0.72, 1) });
    const idLabel = `Contract #${contractId.slice(0, 8).toUpperCase()}`;
    p.drawText(idLabel, { x: pageW - marginX - reg.widthOfTextAtSize(idLabel, 8), y: pageH - 42, font: reg, size: 8, color: rgb(0.65, 0.72, 1) });
    return p;
  }

  let page = newPage();
  let y = pageH - 68 - 30;

  function drawFooter() {
    const fy = 36;
    page.drawLine({ start: { x: marginX, y: fy + 14 }, end: { x: pageW - marginX, y: fy + 14 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Digitally signed via StudyCore Platform  |  studycore.net', { x: marginX, y: fy, font: reg, size: 8, color: GRAY });
  }

  function drawLine(text: string, font: EmbeddedFont, size: number, color = DARK, indent = 0) {
    const lineH = size * 1.4;
    if (y - lineH < 80) { drawFooter(); page = newPage(); y = pageH - 68 - 30; }
    page.drawText(text, { x: marginX + indent, y, font, size, color });
    y -= lineH;
  }

  const filledText = fillTemplate(tutorName, studentName, hourlyRate);
  const sections = filledText.split('\n\n');
  for (let si = 0; si < sections.length; si++) {
    const lines = sections[si].split('\n');
    const heading = lines[0]; const rest = lines.slice(1);
    if (si === 0) {
      const titleW = bold.widthOfTextAtSize(heading, 13);
      page.drawText(heading, { x: (pageW - titleW) / 2, y, font: bold, size: 13, color: DARK });
      y -= 13 * 1.4 + 6;
      for (const line of rest) for (const wl of wrapLine(line, reg, 9.5, bodyW)) drawLine(wl, reg, 9.5, GRAY);
    } else {
      y -= 6;
      drawLine(heading, bold, /^\d+\./.test(heading) ? 10 : 9.5, DARK);
      for (const line of rest) { const ind = line.startsWith('-') ? 10 : 0; for (const wl of wrapLine(line, reg, 9.5, bodyW - ind)) drawLine(wl, reg, 9.5, DARK, ind); }
    }
  }

  y -= 20;
  if (y < 200) { drawFooter(); page = newPage(); y = pageH - 68 - 30; }
  page.drawRectangle({ x: marginX, y: y - 110, width: bodyW, height: 120, color: LIGHT_GRAY, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 0.5 });
  y -= 12;
  page.drawText('DIGITAL SIGNATURE', { x: marginX + 16, y, font: bold, size: 8, color: GRAY });
  y -= 18;
  page.drawText(signature, { x: marginX + 16, y, font: ital, size: 16, color: NAVY_RGB });
  y -= 20;
  page.drawLine({ start: { x: marginX + 16, y }, end: { x: pageW - marginX - 16, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.8) });
  y -= 14;
  page.drawText(`Signed on: ${signedAt}`, { x: marginX + 16, y, font: reg, size: 9, color: DARK });
  y -= 13;
  page.drawText(`Student: ${studentName}   |   Rate: $${hourlyRate}/hr`, { x: marginX + 16, y, font: reg, size: 9, color: GRAY });
  drawFooter();

  const pdfBytes = await doc.save();
  const storagePath = `contract-${contractId}/signed-contract.pdf`;

  await supabase.storage.createBucket('contracts', { public: true }).catch(() => {});

  const { error: uploadErr } = await supabase.storage.from('contracts').upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) { console.error('[pdf] upload error:', uploadErr.message); return null; }

  const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;
  await supabase.from('contracts').update({ pdf_url: pdfUrl }).eq('id', contractId);
  return pdfUrl;
}

// ── Test ──────────────────────────────────────────────────────────────────────

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 1 Test — Contract PDF Generation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let tutorId:   string | null = null;
  let contractId: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s } = await supabase.from('students')
      .insert({ name: 'PDF Test Student', email: 'pdftest@studycore.test', grade: 11, status: 'active', purchased_hours: 10, target_score: 1400, current_score: 1200 })
      .select('id').single();
    studentId = s!.id;

    const { data: t } = await supabase.from('tutors')
      .insert({ name: 'PDF Test Tutor', email: 'pdftesttutor@studycore.test', hourly_rate: 25 })
      .select('id').single();
    tutorId = t!.id;

    const { data: c } = await supabase.from('contracts')
      .insert({ student_id: studentId, tutor_id: tutorId, hourly_rate: 25, status: 'signed', tutor_signature: 'PDF Test Tutor', signed_at: new Date().toISOString() })
      .select('id').single();
    contractId = c!.id;
    console.log(`  Setup complete: contract=${contractId?.slice(0,8)}\n`);
  } catch (e: any) {
    fail('Setup test data', e.message);
    process.exit(1);
  }

  // ── Step 1: Generate PDF ─────────────────────────────────────────────────
  console.log('── Step 1: Generate PDF');
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await generateContractPdf(contractId!);
    if (pdfUrl) pass('generateContractPdf', pdfUrl.split('/').slice(-2).join('/'));
    else fail('generateContractPdf', 'returned null');
  } catch (e: any) { fail('generateContractPdf', e.message); }

  // ── Step 2: pdf_url in DB ────────────────────────────────────────────────
  console.log('\n── Step 2: pdf_url persisted in DB');
  try {
    const { data: c } = await supabase.from('contracts').select('pdf_url').eq('id', contractId!).single();
    if (c?.pdf_url) pass('pdf_url in contracts table', c.pdf_url.split('/').slice(-2).join('/'));
    else fail('pdf_url in contracts table', 'null');
  } catch (e: any) { fail('pdf_url in DB', e.message); }

  // ── Step 3: PDF downloadable ─────────────────────────────────────────────
  console.log('\n── Step 3: PDF accessible at URL');
  if (pdfUrl) {
    try {
      const res = await fetch(pdfUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const isPdf = buf.slice(0, 4).toString() === '%PDF';
        if (isPdf) pass('PDF valid and accessible', `${buf.length} bytes`);
        else fail('PDF valid', 'magic bytes mismatch');
      } else fail('PDF HTTP accessible', `HTTP ${res.status}`);
    } catch (e: any) { fail('PDF accessible', e.message); }
  } else fail('PDF accessible', 'skipped — no URL');

  // ── Step 4: Correct storage path ────────────────────────────────────────
  console.log('\n── Step 4: Storage path format');
  const expectedPath = `contract-${contractId}/signed-contract.pdf`;
  if (pdfUrl?.includes(expectedPath)) pass('Storage path correct', expectedPath);
  else fail('Storage path correct', `expected '${expectedPath}' in URL`);

  // ── Step 5: Backfill existing signed contracts ───────────────────────────
  console.log('\n── Step 5: Backfill existing signed contracts');
  try {
    const { data: existing } = await supabase.from('contracts').select('id').eq('status', 'signed').is('pdf_url', null);
    const toFill = (existing ?? []).filter(c => c.id !== contractId);
    console.log(`  ${toFill.length} existing signed contracts need backfill`);
    let ok = 0; let bad = 0;
    for (const c of toFill) {
      const url = await generateContractPdf(c.id).catch(() => null);
      if (url) { ok++; console.log(`    ✓ ${c.id.slice(0,8)}`); }
      else { bad++; console.log(`    ✗ ${c.id.slice(0,8)}`); }
    }
    if (bad === 0) pass('Backfill existing contracts', `${ok} done, ${bad} failed`);
    else fail('Backfill existing contracts', `${bad} failed`);
  } catch (e: any) { fail('Backfill', e.message); }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (contractId) await supabase.from('contracts').delete().eq('id', contractId);
    if (studentId)  await supabase.from('students').delete().eq('id', studentId);
    if (tutorId) {
      const { count } = await supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId);
      if (!count) await supabase.from('tutors').delete().eq('id', tutorId);
    }
    if (contractId) await supabase.storage.from('contracts').remove([`contract-${contractId}/signed-contract.pdf`]);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 1 PASS' : '  ⚠️  Feature 1 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
