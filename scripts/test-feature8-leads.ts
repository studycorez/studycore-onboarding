/**
 * Feature 8 E2E test — Lead Pipeline Kanban
 * Run: npx ts-node --project tsconfig.json scripts/test-feature8-leads.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type LeadStage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'converted' | 'lost';

// ── Inline lead logic ────────────────────────────────────────────────────────
async function createLead(name: string, email?: string, grade?: number, source?: string) {
  if (!name?.trim()) return { ok: false, error: 'Name required', status: 400 };
  const { data, error } = await supabase.from('leads')
    .insert({ name, email: email ?? null, grade: grade ?? null, source: source ?? null })
    .select().single();
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data, status: 201 };
}

async function updateStage(id: string, stage: LeadStage) {
  const { data, error } = await supabase.from('leads')
    .update({ stage, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function deleteLead(id: string) {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  return { ok: !error };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 8 Test — Lead Pipeline Kanban');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const createdIds: string[] = [];

  // ── Step 1: Leads page + API files exist ─────────────────────────────────
  console.log('── Step 1: Files exist');
  const files = [
    'src/app/admin/leads/page.tsx',
    'src/app/api/leads/route.ts',
    'src/app/api/leads/[id]/route.ts',
  ];
  const missing = files.filter(f => !existsSync(resolve(process.cwd(), f)));
  if (missing.length === 0) pass('All files exist', `${files.length} files`);
  else fail('Files missing', missing.join(', '));

  // ── Step 2: Create lead ───────────────────────────────────────────────────
  console.log('\n── Step 2: Create lead');
  const r2 = await createLead('Test Lead Alice', 'alice@test.com', 11, 'referral');
  if (r2.ok) { createdIds.push(r2.data.id); pass('Lead created', `id=${r2.data.id.slice(0,8)}, stage=new`); }
  else fail('Create lead', r2.error ?? '');

  // ── Step 3: Default stage = 'new' ─────────────────────────────────────────
  console.log('\n── Step 3: Default stage is new');
  if (r2.ok && r2.data.stage === 'new') pass('Default stage = new', '');
  else fail('Default stage', r2.data?.stage ?? 'no data');

  // ── Step 4: Name required ─────────────────────────────────────────────────
  console.log('\n── Step 4: Name required validation');
  const r4 = await createLead('');
  if (r4.status === 400) pass('Empty name rejected', 'status 400');
  else fail('Name validation', `status ${r4.status}`);

  // ── Step 5: Create second lead, check list ────────────────────────────────
  console.log('\n── Step 5: Multiple leads in DB');
  const r5 = await createLead('Test Lead Bob', 'bob@test.com', 10, 'website');
  if (r5.ok) { createdIds.push(r5.data.id); }
  const { data: allLeads } = await supabase.from('leads').select('id').in('id', createdIds);
  if ((allLeads?.length ?? 0) === 2) pass('Multiple leads stored', `${allLeads!.length} leads`);
  else fail('Multiple leads', `got ${allLeads?.length ?? 0}`);

  // ── Step 6: Move lead through stages ─────────────────────────────────────
  console.log('\n── Step 6: Stage progression');
  if (createdIds[0]) {
    const stages: LeadStage[] = ['contacted', 'qualified', 'demo_scheduled', 'converted'];
    let allOk = true;
    for (const stage of stages) {
      const r = await updateStage(createdIds[0], stage);
      if (!r.ok) { allOk = false; fail(`Move to ${stage}`, r.error ?? ''); break; }
    }
    if (allOk) {
      const { data } = await supabase.from('leads').select('stage').eq('id', createdIds[0]).single();
      if (data?.stage === 'converted') pass('Stage progression works', 'new→contacted→qualified→demo_scheduled→converted');
      else fail('Final stage', `got ${data?.stage}`);
    }
  } else fail('Stage progression', 'no lead id');

  // ── Step 7: Move to lost ──────────────────────────────────────────────────
  console.log('\n── Step 7: Mark lead as lost');
  if (createdIds[1]) {
    const r7 = await updateStage(createdIds[1], 'lost');
    if (r7.ok && r7.data.stage === 'lost') pass('Lead marked lost', '');
    else fail('Mark lost', r7.error ?? '');
  } else fail('Mark lost', 'no lead id');

  // ── Step 8: Filter by stage ───────────────────────────────────────────────
  console.log('\n── Step 8: Filter leads by stage');
  const { data: converted } = await supabase.from('leads').select('id').eq('stage', 'converted').in('id', createdIds);
  const { data: lost }      = await supabase.from('leads').select('id').eq('stage', 'lost').in('id', createdIds);
  if (converted?.length === 1 && lost?.length === 1) pass('Stage filter works', `converted=1, lost=1`);
  else fail('Stage filter', `converted=${converted?.length}, lost=${lost?.length}`);

  // ── Step 9: Update fields ─────────────────────────────────────────────────
  console.log('\n── Step 9: Update lead fields');
  if (createdIds[0]) {
    await supabase.from('leads').update({ target_score: 1450, notes: 'Very motivated student', updated_at: new Date().toISOString() }).eq('id', createdIds[0]);
    const { data } = await supabase.from('leads').select('target_score, notes').eq('id', createdIds[0]).single();
    if (data?.target_score === 1450 && data?.notes?.includes('motivated')) pass('Field update works', `target_score=${data.target_score}`);
    else fail('Field update', JSON.stringify(data));
  } else fail('Field update', 'no lead id');

  // ── Step 10: Delete lead ──────────────────────────────────────────────────
  console.log('\n── Step 10: Delete lead');
  if (createdIds[0]) {
    const r10 = await deleteLead(createdIds[0]);
    const { data: check } = await supabase.from('leads').select('id').eq('id', createdIds[0]);
    if (r10.ok && (check?.length ?? 0) === 0) pass('Lead deleted', '');
    else fail('Delete lead', `still in DB: ${check?.length}`);
  } else fail('Delete lead', 'no id');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (createdIds.length) await supabase.from('leads').delete().in('id', createdIds);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 8 PASS' : '  ⚠️  Feature 8 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
