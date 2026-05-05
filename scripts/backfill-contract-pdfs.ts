/**
 * Backfill PDF generation for all signed contracts missing pdf_url.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { generateContractPdf } from '../src/lib/contract-pdf';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, tutor_signature, signed_at, tutor:tutors(name), student:students(name)')
    .eq('status', 'signed')
    .is('pdf_url', null);

  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  if (!contracts?.length) { console.log('No signed contracts missing pdf_url.'); return; }

  console.log(`Found ${contracts.length} signed contracts missing pdf_url. Generating...\n`);

  let ok = 0, failed = 0;

  for (const c of contracts) {
    const tutor   = (c.tutor as any)?.name ?? '?';
    const student = (c.student as any)?.name ?? '?';

    // Stamp placeholder signature if missing (same logic as regenerate-pdf route)
    if (!c.tutor_signature) {
      await supabase.from('contracts').update({
        tutor_signature: 'Digitally accepted',
        signed_at: c.signed_at ?? new Date().toISOString(),
      }).eq('id', c.id);
    }

    const url = await generateContractPdf(c.id);
    if (url) {
      console.log(`  ✓ ${tutor} / ${student} — ${c.id.slice(0,8)}`);
      ok++;
    } else {
      console.log(`  ✗ ${tutor} / ${student} — ${c.id.slice(0,8)} FAILED`);
      failed++;
    }
    await sleep(200); // avoid hammering storage
  }

  console.log(`\n═══ DONE ═══`);
  console.log(`  Generated: ${ok}`);
  console.log(`  Failed:    ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
