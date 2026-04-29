/**
 * Adds reschedule_token and reschedule_token_expires_at to the sessions table.
 * Run: npx ts-node --project tsconfig.json scripts/migrate-reschedule-token.ts
 *
 * SQL to run in Supabase SQL editor:
 *
 * ALTER TABLE sessions
 *   ADD COLUMN reschedule_token text,
 *   ADD COLUMN reschedule_token_expires_at timestamptz;
 * CREATE UNIQUE INDEX ON sessions (reschedule_token) WHERE reschedule_token IS NOT NULL;
 */

console.log('Run the SQL above in Supabase SQL editor to add reschedule token columns to sessions.');
