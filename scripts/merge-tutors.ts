/**
 * Tutor duplicate detection + merge script.
 * Dry run:  npx ts-node --project tsconfig.json scripts/merge-tutors.ts
 * Execute:  npx ts-node --project tsconfig.json scripts/merge-tutors.ts --write
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const WRITE = process.argv.includes('--write');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── helpers ───────────────────────────────────────────────────────────────────

function normName(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function emailDomain(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function isBlank(v: any) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Fetch all tutors
  const { data: tutors, error } = await supabase
    .from('tutors')
    .select('id, name, email, hourly_rate, bio, subjects, payment_info, google_access_token, created_at')
    .order('created_at');

  if (error || !tutors) { console.error('Failed to fetch tutors:', error); process.exit(1); }

  // 2. Fetch related record counts per tutor
  const [sessRes, conRes, availRes] = await Promise.all([
    supabase.from('sessions').select('id, tutor_id'),
    supabase.from('contracts').select('id, tutor_id'),
    supabase.from('tutor_availability').select('id, tutor_id'),
  ]);

  const sessionCount = (sessRes.data ?? []).reduce((m: Record<string, number>, r) => {
    m[r.tutor_id] = (m[r.tutor_id] ?? 0) + 1; return m;
  }, {});
  const contractCount = (conRes.data ?? []).reduce((m: Record<string, number>, r) => {
    m[r.tutor_id] = (m[r.tutor_id] ?? 0) + 1; return m;
  }, {});
  const availCount = (availRes.data ?? []).reduce((m: Record<string, number>, r) => {
    m[r.tutor_id] = (m[r.tutor_id] ?? 0) + 1; return m;
  }, {});

  function counts(id: string) {
    return {
      sessions:     sessionCount[id]  ?? 0,
      contracts:    contractCount[id] ?? 0,
      avail:        availCount[id]    ?? 0,
    };
  }

  // 3. Build duplicate groups
  // Each group = set of tutor IDs that are duplicates of each other
  const unionFind: Record<string, string> = {};
  function root(id: string): string {
    if (!unionFind[id]) unionFind[id] = id;
    if (unionFind[id] !== id) unionFind[id] = root(unionFind[id]);
    return unionFind[id];
  }
  function union(a: string, b: string) {
    const ra = root(a), rb = root(b);
    if (ra !== rb) unionFind[ra] = rb;
  }

  // Rule 1: exact email match (case-insensitive)
  const byEmail: Record<string, string[]> = {};
  for (const t of tutors) {
    const key = t.email.toLowerCase().trim();
    if (!byEmail[key]) byEmail[key] = [];
    byEmail[key].push(t.id);
  }
  for (const ids of Object.values(byEmail)) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  // Rule 2: same normalized full name
  const byName: Record<string, string[]> = {};
  for (const t of tutors) {
    const key = normName(t.name);
    if (!byName[key]) byName[key] = [];
    byName[key].push(t.id);
  }
  for (const ids of Object.values(byName)) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  // Rule 3: same first name + same last name (handles trailing spaces etc.)
  // Already covered by normName above.

  // Rule 4: similar name + same email domain (same name, same domain → likely same person)
  for (let i = 0; i < tutors.length; i++) {
    for (let j = i + 1; j < tutors.length; j++) {
      const a = tutors[i], b = tutors[j];
      if (normName(a.name) === normName(b.name) && emailDomain(a.email) === emailDomain(b.email) && emailDomain(a.email) !== '') {
        union(a.id, b.id);
      }
    }
  }

  // 4. Collect groups with > 1 member
  const groups: Record<string, string[]> = {};
  for (const t of tutors) {
    const r = root(t.id);
    if (!groups[r]) groups[r] = [];
    groups[r].push(t.id);
  }

  const dupGroups = Object.values(groups).filter(g => g.length > 1);

  if (dupGroups.length === 0) {
    console.log('\n✅  No duplicate tutors found.\n');
    return;
  }

  // 5. For each group, decide keep vs drop
  interface MergeGroup {
    keep: (typeof tutors)[0];
    drop: (typeof tutors)[0][];
    reason: string;
    fieldUpdates: Record<string, any>;
  }

  const mergeGroups: MergeGroup[] = [];

  const tutorById = Object.fromEntries(tutors.map(t => [t.id, t]));

  for (const group of dupGroups) {
    const members = group.map(id => tutorById[id]).filter(Boolean);

    // Pick keeper: most sessions; tie → oldest created_at
    members.sort((a, b) => {
      const sc = (sessionCount[b.id] ?? 0) - (sessionCount[a.id] ?? 0);
      if (sc !== 0) return sc;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const [keep, ...drop] = members;

    // Figure out what fields to copy onto keeper from dropped records
    const fieldUpdates: Record<string, any> = {};
    const copyFields = ['email', 'hourly_rate', 'bio', 'payment_info', 'google_access_token'] as const;
    for (const dropped of drop) {
      for (const field of copyFields) {
        if (isBlank((keep as any)[field]) && !isBlank((dropped as any)[field])) {
          fieldUpdates[field] = (dropped as any)[field];
        }
      }
      // subjects: merge arrays
      if ((isBlank(keep.subjects) || keep.subjects.length === 0) && !isBlank(dropped.subjects) && dropped.subjects.length > 0) {
        fieldUpdates['subjects'] = dropped.subjects;
      }
    }

    const reason = (() => {
      if (members.every(m => m.email.toLowerCase().trim() === members[0].email.toLowerCase().trim())) return 'exact email match';
      if (members.every(m => normName(m.name) === normName(members[0].name))) return 'exact name match';
      return 'same name + same email domain';
    })();

    mergeGroups.push({ keep, drop, reason, fieldUpdates });
  }

  // 6. Print dry-run table
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  TUTOR DUPLICATE REPORT — ${WRITE ? '⚡ WRITE MODE' : '🔍 DRY RUN'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < mergeGroups.length; i++) {
    const { keep, drop, reason, fieldUpdates } = mergeGroups[i];
    const kc = counts(keep.id);

    console.log(`┌─ Group ${i + 1} — ${reason}`);
    console.log(`│`);
    console.log(`│  KEEP   ► ${keep.name.padEnd(24)} <${keep.email}>`);
    console.log(`│           ID: ${keep.id}`);
    console.log(`│           Sessions: ${kc.sessions}  Contracts: ${kc.contracts}  Avail slots: ${kc.avail}`);
    console.log(`│           Rate: $${keep.hourly_rate ?? '—'}  Created: ${keep.created_at.slice(0,10)}`);
    console.log(`│`);

    for (const d of drop) {
      const dc = counts(d.id);
      console.log(`│  DROP   ✕ ${d.name.padEnd(24)} <${d.email}>`);
      console.log(`│           ID: ${d.id}`);
      console.log(`│           Sessions: ${dc.sessions}  Contracts: ${dc.contracts}  Avail slots: ${dc.avail}`);
      console.log(`│           Rate: $${d.hourly_rate ?? '—'}  Created: ${d.created_at.slice(0,10)}`);
    }

    console.log(`│`);
    const actions: string[] = [];
    for (const d of drop) {
      const dc = counts(d.id);
      if (dc.sessions > 0)  actions.push(`  • Move ${dc.sessions} session(s) from ${d.name}`);
      if (dc.contracts > 0) actions.push(`  • Move ${dc.contracts} contract(s) from ${d.name}`);
      if (dc.avail > 0)     actions.push(`  • Move ${dc.avail} availability slot(s) from ${d.name}`);
    }
    if (Object.keys(fieldUpdates).length > 0) {
      actions.push(`  • Copy fields onto keeper: ${Object.keys(fieldUpdates).join(', ')}`);
    }
    actions.push(`  • Delete ${drop.length} duplicate record(s)`);

    console.log(`│  Actions:`);
    for (const a of actions) console.log(`│  ${a}`);
    console.log(`└${'─'.repeat(60)}\n`);
  }

  console.log(`Found ${mergeGroups.length} duplicate group(s) involving ${mergeGroups.reduce((s, g) => s + 1 + g.drop.length, 0)} tutor records.\n`);

  if (!WRITE) {
    console.log('👆  Dry run complete. To execute, re-run with --write\n');
    return;
  }

  // ── WRITE MODE ──────────────────────────────────────────────────────────────
  console.log('⚡  Executing merges...\n');

  const RELATED_TABLES = [
    { table: 'sessions',           col: 'tutor_id' },
    { table: 'contracts',          col: 'tutor_id' },
    { table: 'tutor_availability', col: 'tutor_id' },
  ];

  let totalMoved = 0;
  let totalDeleted = 0;

  for (const { keep, drop, fieldUpdates } of mergeGroups) {
    // 1. Update keeper fields if needed
    if (Object.keys(fieldUpdates).length > 0) {
      const { error } = await supabase.from('tutors').update(fieldUpdates).eq('id', keep.id);
      if (error) console.error(`  ✕ Failed to update keeper ${keep.name}: ${error.message}`);
      else console.log(`  ✓ Updated fields on keeper ${keep.name}: ${Object.keys(fieldUpdates).join(', ')}`);
    }

    for (const dropped of drop) {
      // 2. Reassign related records
      for (const { table, col } of RELATED_TABLES) {
        const { data: affected, error: moveErr } = await supabase
          .from(table)
          .update({ [col]: keep.id })
          .eq(col, dropped.id)
          .select('id');
        if (moveErr) {
          console.error(`  ✕ Failed to move ${table} from ${dropped.name}: ${moveErr.message}`);
        } else if ((affected?.length ?? 0) > 0) {
          console.log(`  ✓ Moved ${affected!.length} ${table} row(s) from ${dropped.name} → ${keep.name}`);
          totalMoved += affected!.length;
        }
      }

      // 3. Delete the duplicate
      const { error: delErr } = await supabase.from('tutors').delete().eq('id', dropped.id);
      if (delErr) {
        console.error(`  ✕ Failed to delete ${dropped.name} (${dropped.id}): ${delErr.message}`);
      } else {
        console.log(`  ✓ Deleted duplicate: ${dropped.name} <${dropped.email}>`);
        totalDeleted++;
      }
    }

    console.log('');
  }

  console.log(`\n✅  Done. ${totalDeleted} record(s) deleted, ${totalMoved} related row(s) reassigned.\n`);
}

main().catch(console.error);
