import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing Supabase env vars in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = 'https://my.studycore.net';
const EMAIL    = 'info@studycore.net';
const PASSWORD = 'studycore25!';

async function clearStudents() {
  console.log('🗑️  Clearing tables (sessions → student_progress → students)...');

  // Must delete in FK-dependency order
  for (const table of ['sessions', 'student_progress', 'students'] as const) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`  Failed to clear ${table}:`, error.message);
      process.exit(1);
    }
    console.log(`  ✅ Cleared ${table}`);
  }
}

async function scrapeStudents(): Promise<Array<{ name: string; notes: string | null }>> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // ── Login ────────────────────────────────────────────────────
    console.log('\n🔐 Logging in...');
    // Probe common login URLs for this Angular app
    const loginCandidates = ['/', '/auth/login', '/auth', '/signin', '/sign-in', '/user/login'];
    let loginUrl = BASE_URL;
    for (const path of loginCandidates) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle2', timeout: 20_000 });
      const hasInput = await page.$('input[type="email"], input[type="text"], input[type="password"]');
      if (hasInput) { loginUrl = `${BASE_URL}${path}`; console.log(`  Login page found at: ${loginUrl}`); break; }
      console.log(`  No inputs at ${path}`);
    }
    if (loginUrl === BASE_URL && !(await page.$('input'))) {
      // Last resort: grab the page and look for a login link
      const loginLink = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find(el => /login|sign.?in/i.test(el.textContent ?? el.href));
        return a?.href ?? null;
      });
      if (loginLink) { await page.goto(loginLink, { waitUntil: 'networkidle2', timeout: 20_000 }); console.log(`  Followed login link: ${loginLink}`); }
    }

    // Save debug screenshot + HTML to inspect login form structure
    await page.screenshot({ path: resolve(process.cwd(), 'debug-login.png'), fullPage: true });
    const loginHtml = await page.evaluate(() => document.body.innerHTML);
    const { writeFileSync } = await import('fs');
    writeFileSync(resolve(process.cwd(), 'debug-login.html'), loginHtml);
    console.log('  📸 Saved debug-login.png + debug-login.html');

    // Find all input fields to detect actual selectors
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(el => ({
        type: el.type, name: el.name, id: el.id, placeholder: el.placeholder,
        className: el.className.slice(0, 60),
      }))
    );
    console.log('  Inputs found:', JSON.stringify(inputs, null, 2));

    if (inputs.length === 0) {
      console.error('  No inputs found on login page — check debug-login.html');
      await browser.close();
      process.exit(1);
    }

    // Use first text/email input and first password input
    const emailInput = inputs.find(i => i.type === 'email' || i.type === 'text' || i.name?.includes('email') || i.id?.includes('email'));
    const passInput  = inputs.find(i => i.type === 'password');

    if (!emailInput || !passInput) {
      console.error('  Could not identify email/password inputs. Found:', inputs);
      await browser.close();
      process.exit(1);
    }

    const emailSel = emailInput.id ? `#${emailInput.id}` : emailInput.name ? `input[name="${emailInput.name}"]` : `input[type="${emailInput.type}"]`;
    const passSel  = passInput.id  ? `#${passInput.id}`  : passInput.name  ? `input[name="${passInput.name}"]`  : 'input[type="password"]';

    console.log(`  Using selectors: email="${emailSel}" pass="${passSel}"`);

    // Angular ngModel requires dispatching input+change events, not just keystrokes
    await page.evaluate((sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }, emailSel, EMAIL);

    await page.evaluate((sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }, passSel, PASSWORD);

    await new Promise(r => setTimeout(r, 500)); // let Angular update form state

    // Click the "Login" submit button (btn-primary), not "Continue with Google" (btn-light)
    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"], form button.btn-primary, button.btn-primary') as HTMLElement | null;
      if (btn) btn.click();
    });
    console.log('  Clicked Login button via evaluate');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    console.log('  ✅ Post-login URL:', page.url());

    // ── Verify login succeeded ───────────────────────────────────
    const postLoginUrl = page.url();
    if (postLoginUrl.includes('/login') || postLoginUrl === BASE_URL + '/') {
      // Still on login page — check if any error message is shown
      const errMsg = await page.evaluate(() =>
        document.querySelector('[class*="error"], [class*="alert"], .text-danger')?.textContent?.trim() ?? null
      );
      console.warn('  ⚠️  Still on login page after submit. Error:', errMsg ?? '(none visible)');
      console.warn('  Trying to proceed anyway...');
    }

    // ── Navigate to students page ────────────────────────────────
    await page.goto(`${BASE_URL}/director/students`, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 2000)); // extra wait for Angular SPA render
    console.log('  Navigated to /director/students — URL:', page.url());

    const students: Array<{ name: string; notes: string | null }> = [];

    let pageNum = 1;
    while (true) {
      console.log(`\n  📄 Page ${pageNum}...`);

      // Wait for student rows to appear
      await page.waitForSelector('table tbody tr, [class*="student"], [class*="row"]', { timeout: 15_000 });

      // Give JS a moment to hydrate
      await new Promise(r => setTimeout(r, 1000));

      // Take a screenshot for debugging on first page
      if (pageNum === 1) {
        await page.screenshot({ path: resolve(process.cwd(), 'debug-students-page1.png') });
        // Also dump the page HTML structure to understand selectors
        const html = await page.evaluate(() => document.body.innerHTML);
        const fs = await import('fs');
        fs.writeFileSync(resolve(process.cwd(), 'debug-students-page1.html'), html);
        console.log('  📸 Saved debug-students-page1.png and .html for inspection');
      }

      // Extract student rows — we'll try several selector strategies
      const pageStudents = await page.evaluate(() => {
        const results: Array<{ name: string; notes: string | null }> = [];

        // Strategy 1: table rows
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length >= 1) {
            const name = cells[0]?.textContent?.trim() ?? '';
            const program = cells[1]?.textContent?.trim() ?? cells[2]?.textContent?.trim() ?? null;
            if (name && name.length > 1 && !name.toLowerCase().includes('name')) {
              results.push({ name, notes: program || null });
            }
          }
        }

        if (results.length > 0) return results;

        // Strategy 2: list items or card elements
        const cards = Array.from(document.querySelectorAll('[class*="student-row"], [class*="StudentRow"], [class*="student_row"]'));
        for (const card of cards) {
          const name = card.querySelector('[class*="name"], [class*="Name"]')?.textContent?.trim() ?? '';
          const program = card.querySelector('[class*="program"], [class*="Program"], [class*="plan"]')?.textContent?.trim() ?? null;
          if (name) results.push({ name, notes: program || null });
        }

        return results;
      });

      console.log(`  Found ${pageStudents.length} students on page ${pageNum}`);
      students.push(...pageStudents);

      // ── Pagination — find next button via evaluate (SPA-safe) ───
      const advanced = await page.evaluate((currentPage: number) => {
        // Strategy 1: aria-label
        const byAria = document.querySelector('[aria-label="Next page"], [aria-label="next"]') as HTMLElement | null;
        if (byAria && !byAria.hasAttribute('disabled') && byAria.getAttribute('aria-disabled') !== 'true') {
          byAria.click(); return 'aria';
        }

        // Strategy 2: button/link with text "Next" or ">"
        const allClickable = Array.from(document.querySelectorAll('button, a, li, span')) as HTMLElement[];
        const nextEl = allClickable.find(el => {
          const txt = el.textContent?.trim() ?? '';
          const cls = el.className ?? '';
          return (txt === 'Next' || txt === '›' || txt === '»' || txt === '>') ||
                 (cls.includes('next') && !cls.includes('prev'));
        });
        if (nextEl) {
          const disabled = nextEl.hasAttribute('disabled') ||
                           nextEl.classList.contains('disabled') ||
                           nextEl.getAttribute('aria-disabled') === 'true' ||
                           nextEl.closest('li.disabled') !== null;
          if (!disabled) { nextEl.click(); return 'text'; }
          return 'last-page';
        }

        // Strategy 3: page number button (currentPage + 1)
        const nextPageEl = document.querySelector(`[aria-label="Page ${currentPage + 1}"], button[data-page="${currentPage + 1}"], a[href*="page=${currentPage + 1}"]`) as HTMLElement | null;
        if (nextPageEl) { nextPageEl.click(); return 'page-number'; }

        return null;
      }, pageNum);

      if (!advanced || advanced === 'last-page') {
        console.log(`  No next page (reason: ${advanced ?? 'not found'}) — done after page ${pageNum}.`);
        break;
      }
      console.log(`  Advanced via: ${advanced}`);

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      pageNum++;

      if (pageNum > 20) {
        console.warn('  Safety limit: stopped after 20 pages');
        break;
      }
    }

    return students;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀  StudyCore students import\n');

  await clearStudents();

  const students = await scrapeStudents();

  if (students.length === 0) {
    console.error('\n❌  No students scraped. Check debug-students-page1.html to inspect the page structure.');
    process.exit(1);
  }

  console.log(`\n💾  Inserting ${students.length} students into Supabase...`);

  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  const unique = students.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });

  if (unique.length !== students.length) {
    console.log(`  Deduplicated: ${students.length} → ${unique.length} unique`);
  }

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50).map(s => ({
      name:  s.name,
      email: `student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@studycore.import`,
      notes: s.notes,
    }));

    const { error } = await supabase.from('students').insert(batch);
    if (error) {
      console.error(`  Batch ${i / 50 + 1} failed:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n✅  Done. Inserted ${inserted} students.\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
