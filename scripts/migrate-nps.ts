/**
 * Creates the nps_surveys table.
 * Run: npx ts-node --project tsconfig.json scripts/migrate-nps.ts
 *
 * SQL to run in Supabase SQL editor:
 *
 * CREATE TABLE nps_surveys (
 *   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 *   session_id   uuid REFERENCES sessions(id),
 *   token        text NOT NULL UNIQUE,
 *   sent_at      timestamptz NOT NULL DEFAULT now(),
 *   responded_at timestamptz,
 *   score        smallint CHECK (score >= 0 AND score <= 10),
 *   feedback     text,
 *   created_at   timestamptz NOT NULL DEFAULT now()
 * );
 * CREATE INDEX ON nps_surveys (student_id);
 * CREATE INDEX ON nps_surveys (token);
 */

console.log('Run the SQL above in Supabase SQL editor to create the nps_surveys table.');
