/**
 * Tutor onboarding blast — sends personalized SMS + email to all tutors.
 * SMS includes their Tutor ID, student roster with IDs, and all form links.
 * Email includes the same + their personal ID Reference PDF + Daily Workflow PDF attached.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read .env.local
const envVars = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const GHL_API_KEY     = envVars.GHL_SUPPORT_API_KEY;
const GHL_LOCATION_ID = envVars.GHL_SUPPORT_LOCATION_ID;
const GHL_BASE        = 'https://services.leadconnectorhq.com';

const PDF_DIR      = '/Users/tchandrada/Documents/claudesecondbrain/tutor_id_refs';
const WORKFLOW_PDF = '/Users/tchandrada/Documents/claudesecondbrain/StudyCore Tutor Daily Workflow.pdf';
const CSV_PATH     = '/Users/tchandrada/Documents/claudesecondbrain/stduent and tutor ids - Sheet1.csv';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

// Parse CSV → group students by tutor
const lines = fs.readFileSync(CSV_PATH, 'utf-8').trim().split('\n').slice(1);
const tutorMap = new Map(); // tutorName → { tutorId, students: [{name, id}] }
for (const line of lines) {
  const cols       = line.split(',');
  const tutorName  = cols[2]?.trim();
  const tutorId    = cols[3]?.trim();
  const studentName = cols[0]?.trim();
  const studentId   = cols[1]?.trim();
  if (!tutorName || !tutorId) continue;
  if (!tutorMap.has(tutorName)) tutorMap.set(tutorName, { tutorId, students: [] });
  if (studentName && studentId) tutorMap.get(tutorName).students.push({ name: studentName, id: studentId });
}

// Match tutor name to their ID reference PDF
function findPDF(tutorName) {
  const filename = tutorName.replace(/ /g, '_') + '_ID_Reference.pdf';
  const fullPath = path.join(PDF_DIR, filename);
  return fs.existsSync(fullPath) ? fullPath : null;
}

async function findContact(name) {
  const res  = await fetch(`${GHL_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(name)}`, { headers: ghlHeaders() });
  const data = await res.json();
  const list = data.contacts ?? [];
  return list.find(c => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim().toLowerCase() === name.toLowerCase()) ?? list[0] ?? null;
}

async function sendSMS(contactId, message) {
  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ type: 'SMS', contactId, message }),
  });
  const data = await res.json();
  if (!res.ok) console.log('    SMS error:', data.message ?? JSON.stringify(data));
  return res.ok;
}

async function sendEmail(contactId, toEmail, subject, html, attachments) {
  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ type: 'Email', contactId, emailTo: toEmail, subject, html, attachments }),
  });
  const data = await res.json();
  if (!res.ok) console.log('    Email error:', data.message ?? JSON.stringify(data));
  return res.ok;
}

function buildSMS(firstName, tutorId, students) {
  const roster = students.map(s => `- ${s.name} (ID: ${s.id})`).join('\n');
  return `Hey ${firstName}! Your Tutor ID is ${tutorId}.

Your students:
${roster}

Starting now, submit these 3 forms on any day you have sessions:

1️⃣ Start of Day (before first session):
tally.so/r/J9gJMo

2️⃣ Session Report (after every session):
tally.so/r/rjXPvv

3️⃣ End of Day (after last session):
tally.so/r/pbM7zq

Use your Tutor ID on every form — not your name. Full guide sent to your email.

Any questions or need a student's ID? Just reply here and we'll help.`;
}

function buildEmailHTML(firstName, tutorId, students) {
  const roster = students.map(s => `<li>${s.name} — ID ${s.id}</li>`).join('\n');
  return `<p>Hey ${firstName},</p>
<p>Attached are two documents:</p>
<ol>
  <li><strong>Your personal Tutor ID Reference</strong> — your Tutor ID number and your current student roster with their IDs. Use these on every form, every time. Don't share it with other tutors.</li>
  <li><strong>The Tutor Daily Workflow guide</strong> — what to submit, when, and what a good response looks like.</li>
</ol>
<p><strong>Your Tutor ID: ${tutorId}</strong></p>
<p><strong>Your Students:</strong></p>
<ul>${roster}</ul>
<p>Starting now, submit these 3 forms on any day you have sessions:</p>
<ul>
  <li><strong>Start of Day Check-In</strong> (before your first session): <a href="https://tally.so/r/J9gJMo">tally.so/r/J9gJMo</a></li>
  <li><strong>Session Report</strong> (after every session): <a href="https://tally.so/r/rjXPvv">tally.so/r/rjXPvv</a></li>
  <li><strong>End of Day Check-In</strong> (after your last session): <a href="https://tally.so/r/pbM7zq">tally.so/r/pbM7zq</a></li>
</ul>
<p>Use your Tutor ID on every form — not your name.</p>
<p>If you have any questions or need help finding a student's ID number, just reply to this email and we'll sort it out.</p>
<p>– StudyCore</p>`;
}

function pdfToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function main() {
  if (!GHL_API_KEY) { console.error('GHL_SUPPORT_API_KEY not set'); process.exit(1); }

  const workflowB64 = pdfToBase64(WORKFLOW_PDF);
  console.log(`Sending to ${tutorMap.size} tutors...\n`);

  let smsSent = 0, smsF = 0, emailSent = 0, emailF = 0, notFound = 0;

  for (const [name, { tutorId, students }] of tutorMap) {
    const firstName = name.split(' ')[0];
    console.log(`${name} (ID: ${tutorId}, ${students.length} students)...`);

    const contact = await findContact(name);
    if (!contact) {
      console.log('  ❌ not found in GHL\n');
      notFound++;
      continue;
    }

    // SMS
    const smsOk = await sendSMS(contact.id, buildSMS(firstName, tutorId, students));
    console.log(`  SMS: ${smsOk ? '✓' : '❌'}`);
    smsOk ? smsSent++ : smsF++;

    // Email
    if (contact.email) {
      const pdfPath = findPDF(name);
      const attachments = [];
      if (pdfPath) {
        attachments.push({ filename: `${name.replace(/ /g, '_')}_ID_Reference.pdf`, data: pdfToBase64(pdfPath), type: 'application/pdf' });
      } else {
        console.log(`  ⚠️  No ID Reference PDF found for ${name}`);
      }
      attachments.push({ filename: 'StudyCore_Tutor_Daily_Workflow.pdf', data: workflowB64, type: 'application/pdf' });

      const emailOk = await sendEmail(
        contact.id,
        contact.email,
        'Your StudyCore Tutor ID Reference + Daily Forms',
        buildEmailHTML(firstName, tutorId, students),
        attachments,
      );
      console.log(`  Email: ${emailOk ? '✓' : '❌'}`);
      emailOk ? emailSent++ : emailF++;
    } else {
      console.log('  Email: ❌ no email on file');
      emailF++;
    }

    console.log('');
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n✅ Done`);
  console.log(`SMS   — sent: ${smsSent}, failed: ${smsF}`);
  console.log(`Email — sent: ${emailSent}, failed: ${emailF}`);
  console.log(`Not found in GHL: ${notFound}`);
}

main().catch(console.error);
