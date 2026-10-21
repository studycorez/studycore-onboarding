import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const NAVY = rgb(30 / 255, 32 / 255, 144 / 255);
const WHITE = rgb(1, 1, 1);
const DARK  = rgb(0.07, 0.07, 0.07);
const GRAY  = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.96);

// Same template as the signing page
const CONTRACT_TEMPLATE = `STUDYCORE TUTOR COMMITMENT CONTRACT

This agreement is between StudyCore ("Company") and {TUTOR_NAME} ("Tutor").

1. COMMITMENT
Tutor agrees to fulfill all scheduled tutoring sessions with {STUDENT_NAME} as outlined in the attached Game Plan. The full program duration and session schedule are detailed in the Game Plan document.

2. SESSIONS & CANCELLATIONS
Tutor must provide at least 24 hours notice for any cancellation. Failure to provide notice or missing a session without notice constitutes a violation. On the 3rd violation, this contract is terminated and all unpaid session earnings are forfeited.

3. NOTICE PERIOD
To discontinue tutoring {STUDENT_NAME}, Tutor must provide a minimum of 2 weeks written notice to StudyCore admin.

4. COMPENSATION
Tutor will be compensated at $\{HOURLY_RATE\}/hour for all completed sessions as confirmed via session logs.

5. CONFIDENTIALITY
Tutor agrees to keep all student information strictly confidential, including but not limited to: academic performance, test scores, personal details, and family information.

6. EXCLUSIVITY
While engaged with StudyCore, Tutor agrees not to provide tutoring services for any other company, platform, or organization. Tutor may only conduct independent (non-company) tutoring with prior written approval from StudyCore.

7. CONSEQUENCES OF VIOLATION
- 1st & 2nd violation: Forfeiture of pay for the missed session and written warning
- 3rd violation: Immediate contract termination and forfeiture of all unpaid session earnings

By signing below, Tutor acknowledges they have read, understood, and agree to all terms.`;

function fillTemplate(tutor: string, student: string, rate: number): string {
  return CONTRACT_TEMPLATE
    .replace(/{TUTOR_NAME}/g, tutor)
    .replace(/{STUDENT_NAME}/g, student)
    .replace(/\$\{HOURLY_RATE\}/g, String(rate));
}

// Word-wrap a string into lines that fit within maxWidth (in points) using the given font/size
function wrapLine(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number): string[] {
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

export async function generateContractPdf(contractId: string): Promise<string | null> {
  const supabase = getSupabase();

  // 1. Fetch contract with related tutor and student
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*, tutor:tutors(name), student:students(name)')
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    console.error('[contract-pdf] fetch failed:', error?.message);
    return null;
  }

  const tutorName   = (contract.tutor   as any)?.name ?? 'Tutor';
  const studentName = (contract.student as any)?.name ?? 'Student';
  const hourlyRate  = contract.hourly_rate ?? 0;
  const signature   = contract.tutor_signature ?? '';
  const signedAt    = contract.signed_at
    ? new Date(contract.signed_at).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : 'Unknown date';

  const filledText = fillTemplate(tutorName, studentName, hourlyRate);

  // 2. Build PDF
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Page dimensions (US Letter)
  const pageW = 612;
  const pageH = 792;
  const marginX = 56;
  const bodyW = pageW - marginX * 2;

  // Helper: add a new page and draw the header bar
  function newPage() {
    const p = doc.addPage([pageW, pageH]);
    // Navy header bar
    p.drawRectangle({ x: 0, y: pageH - 68, width: pageW, height: 68, color: NAVY });
    p.drawText('StudyCore', { x: marginX, y: pageH - 35, font: bold, size: 18, color: WHITE });
    p.drawText('Tutor Commitment Contract', { x: marginX, y: pageH - 54, font: reg, size: 10, color: rgb(0.65, 0.72, 1) });
    // Contract ID in header top-right
    const idLabel = `Contract #${contractId.slice(0, 8).toUpperCase()}`;
    const idW = reg.widthOfTextAtSize(idLabel, 8);
    p.drawText(idLabel, { x: pageW - marginX - idW, y: pageH - 42, font: reg, size: 8, color: rgb(0.65, 0.72, 1) });
    return p;
  }

  let page = newPage();
  let y = pageH - 68 - 30; // start below header

  // Helper: draw text at current y, advance y, page-break if needed
  function drawLine(text: string, font: typeof bold, size: number, color = DARK, indent = 0) {
    const lineH = size * 1.4;
    if (y - lineH < 80) {
      // Footer on current page before break
      drawFooter();
      page = newPage();
      y = pageH - 68 - 30;
    }
    page.drawText(text, { x: marginX + indent, y, font, size, color });
    y -= lineH;
  }

  function drawFooter() {
    const footerY = 36;
    page.drawLine({ start: { x: marginX, y: footerY + 14 }, end: { x: pageW - marginX, y: footerY + 14 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Digitally signed via StudyCore Platform  |  studycore.net', {
      x: marginX, y: footerY, font: reg, size: 8, color: GRAY,
    });
  }

  // ── Contract body ────────────────────────────────────────────────────────
  const sections = filledText.split('\n\n');
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const lines = section.split('\n');
    const heading = lines[0];
    const rest    = lines.slice(1);

    if (si === 0) {
      // Title section
      const titleW = bold.widthOfTextAtSize(heading, 13);
      page.drawText(heading, { x: (pageW - titleW) / 2, y, font: bold, size: 13, color: DARK });
      y -= 13 * 1.4;
      y -= 6; // extra space after title
      for (const line of rest) {
        const wrapped = wrapLine(line, reg, 9.5, bodyW);
        for (const wl of wrapped) drawLine(wl, reg, 9.5, GRAY);
      }
    } else {
      y -= 6; // space between sections
      const isNumbered = /^\d+\./.test(heading);
      drawLine(heading, bold, isNumbered ? 10 : 9.5, DARK);
      for (const line of rest) {
        const indent = line.startsWith('-') ? 10 : 0;
        const wrapped = wrapLine(line, reg, 9.5, bodyW - indent);
        for (const wl of wrapped) drawLine(wl, reg, 9.5, DARK, indent);
      }
    }
  }

  // ── Signature block ──────────────────────────────────────────────────────
  y -= 20;
  if (y < 200) {
    drawFooter();
    page = newPage();
    y = pageH - 68 - 30;
  }

  // Signature box background
  page.drawRectangle({ x: marginX, y: y - 110, width: bodyW, height: 120, color: LIGHT_GRAY, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 0.5 });

  y -= 12;
  page.drawText('DIGITAL SIGNATURE', { x: marginX + 16, y, font: bold, size: 8, color: GRAY });
  y -= 18;
  page.drawText(signature, { x: marginX + 16, y, font: ital, size: 16, color: NAVY });
  y -= 20;
  page.drawLine({ start: { x: marginX + 16, y }, end: { x: pageW - marginX - 16, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.8) });
  y -= 14;
  page.drawText(`Signed on: ${signedAt}`, { x: marginX + 16, y, font: reg, size: 9, color: DARK });
  y -= 13;
  page.drawText(`Student: ${studentName}   |   Rate: $${hourlyRate}/hr`, { x: marginX + 16, y, font: reg, size: 9, color: GRAY });

  drawFooter();

  // 3. Serialize to bytes
  const pdfBytes = await doc.save();

  // 4. Upload to Supabase storage
  const storagePath = `contract-${contractId}/signed-contract.pdf`;

  // Ensure bucket exists (idempotent — ignore error if already exists)
  await supabase.storage.createBucket('contracts', { public: true }).catch(() => {});

  const { error: uploadErr } = await supabase.storage
    .from('contracts')
    .upload(storagePath, pdfBytes, {
      contentType:  'application/pdf',
      upsert:       true,
    });

  if (uploadErr) {
    console.error('[contract-pdf] upload failed:', uploadErr.message);
    return null;
  }

  // 5. Get public URL
  const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;

  // 6. Save URL to contracts table
  await supabase.from('contracts').update({ pdf_url: pdfUrl }).eq('id', contractId);

  return pdfUrl;
}
