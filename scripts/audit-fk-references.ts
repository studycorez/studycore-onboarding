/**
 * FK auto-discovery audit: finds every column that references sessions.id
 * (or any other table.column) — both formally constrained FKs and
 * name-pattern suspects that lack a formal constraint.
 *
 * PREREQUISITE: Apply supabase/migrations/20260515_fk_audit_helpers.sql
 * in the Supabase SQL Editor before running this script.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/audit-fk-references.ts [table] [column]
 *
 * Examples:
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-fk-references.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-fk-references.ts sessions id
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-fk-references.ts students id
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormalFkRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  referenced_schema: string;
  referenced_table: string;
  referenced_column: string;
  constraint_name: string;
}

interface SuspectedColRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers
        .map(h => {
          const v = r[h] ?? '';
          return String(v).includes(',') ? `"${v}"` : String(v);
        })
        .join(','),
    ),
  ];
  return lines.join('\n') + '\n';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const refTable  = process.argv[2] ?? 'sessions';
  const refColumn = process.argv[3] ?? 'id';

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`FK AUDIT: Finding all references to ${refTable}.${refColumn}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  // ── 1. Formal FKs ─────────────────────────────────────────────────────────
  console.log('Querying formal FK constraints from information_schema…');
  const { data: formalData, error: formalErr } = await supabase.rpc('get_formal_fk_refs', {
    p_referenced_table:  refTable,
    p_referenced_column: refColumn,
  });

  if (formalErr) {
    if (formalErr.message.includes('Could not find the function')) {
      console.error('\n❌ Helper functions not found in database.');
      console.error('   Apply the migration first:');
      console.error('   supabase/migrations/20260515_fk_audit_helpers.sql');
      console.error('   (paste into Supabase SQL Editor and run)\n');
    } else {
      console.error('get_formal_fk_refs failed:', formalErr.message);
    }
    process.exit(1);
  }

  const formalRows = (formalData ?? []) as FormalFkRow[];
  const formalKeys = new Set(formalRows.map(r => `${r.table_name}.${r.column_name}`));

  // ── 2. Suspected columns (name-pattern, not formally constrained) ──────────
  console.log('Querying suspected session-reference columns by name pattern…');
  const { data: suspectedData, error: suspectedErr } = await supabase.rpc('get_suspected_session_cols');

  if (suspectedErr) {
    console.error('get_suspected_session_cols failed:', suspectedErr.message);
    process.exit(1);
  }

  const suspectedRows = (suspectedData ?? []) as SuspectedColRow[];

  // Only keep suspects that are NOT already in the formal FK list AND
  // that are NOT the referenced table's own PK (sessions.id is not a suspect ref).
  const suspectedOnly = suspectedRows.filter(r =>
    !formalKeys.has(`${r.table_name}.${r.column_name}`) &&
    !(r.table_name === refTable && r.column_name === refColumn),
  );

  // ── 3. Write CSVs ──────────────────────────────────────────────────────────
  const outputDir = join(process.cwd(), 'scripts', 'output');
  mkdirSync(outputDir, { recursive: true });
  const date = todayStr();

  const formalFile    = join(outputDir, `fk-formal-refs-${date}.csv`);
  const suspectedFile = join(outputDir, `fk-suspected-refs-${date}.csv`);

  writeFileSync(formalFile,    toCSV(formalRows as any));
  writeFileSync(suspectedFile, toCSV(suspectedOnly as any));

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`RESULTS`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`\nFormal FK constraints → ${refTable}.${refColumn}: ${formalRows.length}`);
  for (const r of formalRows) {
    console.log(`  ${r.table_name}.${r.column_name}  [constraint: ${r.constraint_name}]`);
  }

  console.log(`\nSuspected (name-pattern, NOT formally constrained): ${suspectedOnly.length}`);
  for (const r of suspectedOnly) {
    const flag = r.column_name.includes('session_id') ? '⚠️ ' : '   ';
    console.log(`  ${flag}${r.table_name}.${r.column_name}  (${r.data_type})`);
  }

  console.log(`\nFiles written:`);
  console.log(`  ${formalFile}`);
  console.log(`  ${suspectedFile}`);
  console.log(`\n══════════════════════════════════════════════════════════════\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
